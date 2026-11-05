/**
 * Main-thread engine client (ARCHITECTURE §4.2): batches of ≤ 20 lines, in-flight dedupe, cancellation,
 * idle termination, and a main-thread fallback so a worker failure never breaks rendering.
 */
import { analyseBatch } from './analyse';
import type { AnalyseRequest, LineInput } from './analyse';
import { failedAnalysis } from './model';
import type { LangCode, LineAnalysis } from './model';
import { ENGINE_VERSION } from './version';

export interface WorkerHandle {
  analyse(req: AnalyseRequest): Promise<LineAnalysis[]>;
  terminate(): void;
}

export interface EngineClientOptions {
  /** Creates a worker; may throw (module workers unsupported) — the client then analyses on the main thread. */
  createWorker: () => WorkerHandle;
  idleMs?: number;
  batchSize?: number;
}

export interface AnalyseOptions {
  /** Pending batches are dropped when aborted (e.g. the song is no longer open). */
  signal?: AbortSignal;
}

const BATCH = 20;

export class EngineClient {
  private worker: WorkerHandle | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly inflight = new Map<string, Promise<LineAnalysis>>();
  private chain: Promise<unknown> = Promise.resolve();
  private workerBroken = false;
  /** For diagnostics (Settings → About → Diagnostics, M13). */
  readonly diagnostics: string[] = [];

  constructor(private readonly opts: EngineClientOptions) {}

  get isWorkerRunning(): boolean {
    return this.worker !== null;
  }

  /** Analyses lines; results are returned in input order. Identical lines in flight are analysed once. */
  async analyse(
    lang: LangCode,
    lines: LineInput[],
    opts: AnalyseOptions = {},
  ): Promise<LineAnalysis[]> {
    const size = this.opts.batchSize ?? BATCH;
    const unique = new Map<string, LineInput>();
    for (const l of lines) unique.set(this.keyOf(lang, l), l);

    const waiting: Promise<void>[] = [];
    const todo: [string, LineInput][] = [];
    for (const [k, l] of unique) if (!this.inflight.has(k)) todo.push([k, l]);

    for (let i = 0; i < todo.length; i += size) {
      const slice = todo.slice(i, i + size);
      const batch = new Promise<LineAnalysis[]>((resolve, reject) => {
        this.chain = this.chain.then(async () => {
          if (opts.signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
          try {
            resolve(await this.run({ lang, lines: slice.map(([, l]) => l) }));
          } catch (e) {
            reject(e);
          }
        });
      });
      slice.forEach(([k], idx) => {
        const p = batch.then((r) => r[idx]!);
        this.inflight.set(k, p);
        waiting.push(
          p.then(
            () => void this.inflight.delete(k),
            () => void this.inflight.delete(k),
          ),
        );
      });
    }
    const results = await Promise.all([...unique.keys()].map((k) => this.inflight.get(k)!));
    await Promise.all(waiting);
    const byKey = new Map([...unique.keys()].map((k, i) => [k, results[i]!]));
    return lines.map((l) => byKey.get(this.keyOf(lang, l))!);
  }

  private keyOf(lang: LangCode, l: LineInput): string {
    return `${lang}|${l.packVersion === undefined ? 'active' : (l.packVersion ?? 'none')}|${l.key}|${l.text}\0${JSON.stringify(l.readings ?? [])}`;
  }

  private async run(req: AnalyseRequest): Promise<LineAnalysis[]> {
    this.clearIdle();
    try {
      if (!this.workerBroken) {
        let handle: WorkerHandle | undefined;
        try {
          handle = this.worker ??= this.opts.createWorker();
          return await handle.analyse(req);
        } catch (e) {
          if (handle && this.worker !== handle) throw e; // deliberate idle/hidden-page release
          this.diagnostics.push(`worker failed: ${e instanceof Error ? e.message : String(e)}`);
          this.terminate();
          this.workerBroken = true; // fall back to the main thread for the rest of the session
        }
      }
      try {
        // Imported readings remain usable if workers fail. Keep IPADIC out of the page's memory.
        if (req.lang === 'ja')
          return await analyseBatch({
            ...req,
            lines: req.lines.map((line) => ({ ...line, packVersion: null })),
          });
        return await analyseBatch(req);
      } catch (e) {
        this.diagnostics.push(`analysis failed: ${e instanceof Error ? e.message : String(e)}`);
        return req.lines.map((l) =>
          failedAnalysis(l.key, req.lang, ENGINE_VERSION[req.lang], l.text),
        );
      }
    } finally {
      this.armIdle();
    }
  }

  private armIdle() {
    this.clearIdle();
    if (this.worker)
      this.idleTimer = setTimeout(() => this.terminate(), this.opts.idleMs ?? 60_000);
  }
  private clearIdle() {
    clearTimeout(this.idleTimer);
  }

  /** Releases the worker (and its memory). It is re-created on the next request. */
  terminate(): void {
    this.clearIdle();
    this.worker?.terminate();
    this.worker = null;
  }
}
