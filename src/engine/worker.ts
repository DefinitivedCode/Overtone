import { expose } from 'comlink';
import { analyseBatch } from './analyse';
import type { AnalyseRequest } from './analyse';
import type { LineAnalysis } from './model';

/** The RPC surface of the engine worker (typed via Comlink). */
export interface EngineApi {
  analyse(req: AnalyseRequest): Promise<LineAnalysis[]>;
}

const api: EngineApi = { analyse: analyseBatch };
expose(api);
