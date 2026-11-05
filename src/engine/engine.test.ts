import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyseBatch, analyseLine } from './analyse';
import type { AnalyseRequest } from './analyse';
import { EngineClient } from './client';
import type { WorkerHandle } from './client';
import { lemmaCandidates, splitParticle } from './ko/lemma';
import { checkInvariants } from './model';
import type { LineAnalysis } from './model';
import { DEFAULT_ROMAN_PREFS, romaniseLine, tokenRoman } from './romanLine';
import { classifyChar, routeRun, splitRuns } from './segment/segment';

const line = (text: string) => ({ key: 'k', text });
const surfaces = (a: LineAnalysis) => a.tokens.map((t) => t.surface);

describe('script classification and runs', () => {
  it.each([
    ['한', 'hangul'],
    ['ㅋ', 'hangul'],
    ['あ', 'kana'],
    ['ー', 'kana'],
    ['ヶ', 'kana'],
    ['愛', 'han'],
    ['々', 'han'],
    ['a', 'latin'],
    ['é', 'latin'],
    ['Ａ', 'latin'],
    ['7', 'number'],
    [' ', 'space'],
    ['　', 'space'],
    ['!', 'punct'],
    ['、', 'punct'],
    ['♪', 'symbol'],
    ['😀', 'symbol'],
  ])('%s → %s', (ch, cls) => {
    expect(classifyChar(ch)).toBe(cls);
  });

  it('splits maximal runs with correct UTF-16 offsets (astral characters, emoji)', () => {
    const text = '사랑 𠀀 😀 ab';
    const runs = splitRuns(text);
    expect(runs.map((r) => r.text).join('')).toBe(text);
    let o = 0;
    for (const r of runs) {
      expect(r.start).toBe(o);
      expect(text.slice(r.start, r.end)).toBe(r.text);
      o = r.end;
    }
  });
  it('keeps apostrophes and hyphens inside Latin words together, ZWJ emoji sequences whole', () => {
    expect(
      splitRuns("don't stop-me")
        .filter((r) => r.cls === 'latin')
        .map((r) => r.text),
    ).toEqual(["don't", 'stop-me']);
    expect(splitRuns('👨‍👩‍👧').length).toBe(1);
  });
  it('routes scripts to languages by song language', () => {
    expect(routeRun('hangul', 'ko')).toMatchObject({ kind: 'word', lang: 'ko' });
    expect(routeRun('kana', 'ko')).toMatchObject({ lang: 'ja' });
    expect(routeRun('han', 'ko')).toMatchObject({ lang: 'other', note: 'hanja' });
    expect(routeRun('han', 'ja')).toMatchObject({ lang: 'ja' });
    expect(routeRun('han', 'yue')).toMatchObject({ lang: 'yue' });
    expect(routeRun('latin', 'zh')).toMatchObject({ kind: 'latin', lang: 'en' });
  });
});

describe('Korean analysis', () => {
  it('produces eojeol tokens with romanisation, notes and lemma candidates', () => {
    const a = analyseLine(line('나는 노래해!'), 'ko');
    expect(a.status).toBe('ok');
    expect(surfaces(a)).toEqual(['나는', ' ', '노래해', '!']);
    const [na, , norae, bang] = a.tokens;
    expect(na).toMatchObject({
      kind: 'word',
      lang: 'ko',
      roman: 'naneun',
      confidence: 'high',
      notes: ['particle:는'],
    });
    expect(na!.ruby).toEqual([{ base: '나는', reading: null }]);
    expect(norae!.roman).toBe('noraehae');
    expect(bang).toMatchObject({ kind: 'punct', roman: '!', ruby: [] });
    expect(norae!.lemmaCandidates).toContain('노래하다');
    expect(checkInvariants('나는 노래해!', a)).toEqual([]);
  });
  it('passes English through and routes Japanese/Hanja to unannotated tokens flagged for later', () => {
    const a = analyseLine(line('baby 내 맘을 愛 あい'), 'ko');
    expect(a.tokens.find((t) => t.surface === 'baby')).toMatchObject({
      kind: 'latin',
      lang: 'en',
      roman: 'baby',
    });
    expect(a.tokens.find((t) => t.surface === '愛')).toMatchObject({
      lang: 'other',
      notes: ['hanja'],
      confidence: 'none',
    });
    expect(a.tokens.find((t) => t.surface === 'あい')).toMatchObject({
      lang: 'ja',
      notes: ['needs-language-data'],
    });
    expect(a.status).toBe('partial');
  });
  it('marks jamo-only runs (ㅋㅋ) as low confidence', () => {
    const t = analyseLine(line('ㅋㅋ'), 'ko').tokens[0]!;
    expect(t).toMatchObject({ roman: 'kk', confidence: 'low' });
    expect(t.notes).toContain('jamo-only');
  });
  it('other languages keep the original text and say why (until their packs exist)', () => {
    for (const lang of ['ja', 'zh', 'yue'] as const) {
      const a = analyseLine(line('愛してる'), lang);
      expect(a.status).toBe('partial');
      expect(a.tokens.every((t) => t.ruby.length === 0 && t.confidence === 'none')).toBe(true);
      expect(a.tokens[0]!.notes).toContain('needs-language-data');
    }
  });
  it('handles empty and whitespace-only lines', () => {
    expect(analyseLine(line(''), 'ko').tokens).toEqual([]);
    expect(checkInvariants('   ', analyseLine(line('   '), 'ko'))).toEqual([]);
  });
});

describe('token invariants (property tests)', () => {
  const chars = fc.constantFrom(
    ..."가나다사랑해 ㅋㅋ愛あいABC 12!?、。「」…♪😀𠀀éñ-'\t".split(''),
    '‍',
    '️',
  );
  const text = fc.array(chars, { maxLength: 40 }).map((a) => a.join(''));
  it.each(['ko', 'ja', 'zh', 'yue'] as const)(
    '%s: tokens are contiguous and rebuild the text',
    (lang) => {
      fc.assert(
        fc.property(text, (t) => {
          const a = analyseLine(line(t), lang);
          expect(checkInvariants(t, a)).toEqual([]);
          expect(a.tokens.map((x) => x.surface).join('')).toBe(t);
        }),
        { numRuns: 300 },
      );
    },
  );
  it('a corrupted analysis is detected by the checker', () => {
    const a = analyseLine(line('사랑해'), 'ko');
    a.tokens[0]!.end += 1;
    expect(checkInvariants('사랑해', a).length).toBeGreaterThan(0);
  });
});

describe('romanised line and render-time projection', () => {
  it('joins tokens, preserves single spaces and ASCII-fies punctuation', () => {
    const toks = analyseLine(line('사랑해,  보고 싶어。'), 'ko').tokens;
    expect(romaniseLine(toks)).toBe('saranghae, bogo sipeo.');
  });
  it('switches Korean mode at render time without re-analysis', () => {
    const toks = analyseLine(line('꽃이 좋아'), 'ko').tokens;
    expect(romaniseLine(toks, { ko: { mode: 'pronunciation' } })).toBe('kkochi joa');
    expect(romaniseLine(toks, { ko: { mode: 'letters' } })).toBe(
      'kkochi joa'.replace('kkochi', 'kkochi').replace('joa', 'joha'),
    );
  });
  it('never returns blank for annotated-less tokens (falls back to the original, J5.4)', () => {
    const t = analyseLine(line('愛'), 'ko').tokens[0]!;
    expect(tokenRoman(t, DEFAULT_ROMAN_PREFS)).toBe('愛');
    expect(romaniseLine(analyseLine(line('あい 사랑'), 'ko').tokens)).toBe('あい sarang');
  });
});

describe('lemma heuristics', () => {
  it.each([
    ['사랑을', '사랑'],
    ['학교에서', '학교'],
    ['나는', '나'],
    ['집으로', '집'],
    ['너를', '너'],
  ])('splits particle: %s → %s', (word, stem) => {
    expect(splitParticle(word)?.stem).toBe(stem);
  });
  it('respects batchim agreement (은/는, 이/가, 을/를)', () => {
    expect(splitParticle('책은')?.particle).toBe('은');
    expect(splitParticle('나은')).toBeNull(); // 나 has no batchim, so 은 is not a particle here
    expect(splitParticle('책를')).toBeNull();
  });
  it('never strips a bare particle or a one-syllable word', () => {
    expect(splitParticle('는')).toBeNull();
    expect(splitParticle('가')).toBeNull();
  });
  it('generates predicate candidates including reversed contractions', () => {
    expect(lemmaCandidates('먹었어')).toContain('먹다');
    expect(lemmaCandidates('사랑해')).toContain('사랑하다');
    expect(lemmaCandidates('봐')).toContain('보다');
    expect(lemmaCandidates('줘')).toContain('주다');
    expect(lemmaCandidates('가고')).toContain('가다');
    expect(lemmaCandidates('학생이에요')).toContain('학생');
  });
  it('always lists the word itself first', () => {
    expect(lemmaCandidates('하늘')[0]).toBe('하늘');
  });
});

describe('EngineClient', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function fakeWorker() {
    const calls: AnalyseRequest[] = [];
    const created: WorkerHandle[] = [];
    const terminated = vi.fn();
    const factory = () => {
      const h: WorkerHandle = {
        analyse: async (req) => {
          calls.push(req);
          return analyseBatch(req);
        },
        terminate: terminated,
      };
      created.push(h);
      return h;
    };
    return { calls, created, terminated, factory };
  }
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ key: `k${i}`, text: `사랑${i}` }));

  it('splits requests into batches of at most 20 lines and returns results in order', async () => {
    const w = fakeWorker();
    const client = new EngineClient({ createWorker: w.factory });
    const lines = mk(45);
    const out = await client.analyse('ko', lines);
    expect(w.calls.map((c) => c.lines.length)).toEqual([20, 20, 5]);
    expect(out.map((a) => a.lineKey)).toEqual(lines.map((l) => l.key));
  });

  it('dedupes identical lines within a request and across concurrent requests', async () => {
    const w = fakeWorker();
    const client = new EngineClient({ createWorker: w.factory });
    const same = [
      { key: 'a', text: '사랑해' },
      { key: 'a', text: '사랑해' },
    ];
    const [r1, r2] = await Promise.all([
      client.analyse('ko', same),
      client.analyse('ko', [same[0]!]),
    ]);
    expect(w.calls.flatMap((c) => c.lines).length).toBe(1);
    expect(r1).toHaveLength(2);
    expect(r2[0]!.tokens[0]!.roman).toBe('saranghae');
  });

  it('cancelled requests never start their pending batches', async () => {
    const w = fakeWorker();
    const client = new EngineClient({ createWorker: w.factory, batchSize: 5 });
    const ctl = new AbortController();
    const first = client.analyse('ko', mk(5));
    const second = client.analyse(
      'ko',
      mk(10).map((l) => ({ ...l, key: `x${l.key}` })),
      { signal: ctl.signal },
    );
    ctl.abort();
    await first;
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(w.calls.length).toBe(1);
  });

  it('terminates the worker after the idle period and recreates it on demand', async () => {
    const w = fakeWorker();
    const client = new EngineClient({ createWorker: w.factory, idleMs: 60_000 });
    await client.analyse('ko', mk(1));
    expect(client.isWorkerRunning).toBe(true);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(client.isWorkerRunning).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(client.isWorkerRunning).toBe(false);
    expect(w.terminated).toHaveBeenCalledTimes(1);
    await client.analyse('ko', [{ key: 'z', text: '다시' }]);
    expect(w.created).toHaveLength(2);
  });

  it('falls back to the main thread when the worker cannot be created, recording a diagnostic', async () => {
    const client = new EngineClient({
      createWorker: () => {
        throw new Error('module workers unsupported');
      },
    });
    const [a] = await client.analyse('ko', [{ key: 'a', text: '사랑해' }]);
    expect(a!.tokens[0]!.roman).toBe('saranghae');
    expect(client.diagnostics[0]).toContain('module workers unsupported');
  });

  it('a worker that rejects falls back to the main thread for that batch and afterwards', async () => {
    const bad: WorkerHandle = {
      analyse: () => Promise.reject(new Error('boom')),
      terminate: vi.fn(),
    };
    const client = new EngineClient({ createWorker: () => bad });
    const [a] = await client.analyse('ko', [{ key: 'a', text: '사랑해' }]);
    expect(a!.status).toBe('ok');
    expect(bad.terminate).toHaveBeenCalled();
    const [b] = await client.analyse('ko', [{ key: 'b', text: '노래' }]);
    expect(b!.tokens[0]!.roman).toBe('norae');
  });

  it('an analyser exception on one line yields a failed, original-text analysis for that line only', () => {
    const out = analyseBatch({
      lang: 'ko',
      lines: [
        { key: 'a', text: '사랑' },
        { key: 'b', text: null as unknown as string },
      ],
    });
    expect(out[0]!.status).toBe('ok');
    expect(out[1]!.status).toBe('failed');
  });
});
