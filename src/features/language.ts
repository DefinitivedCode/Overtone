import type { LangCode } from '@/db/types';

export const LANGUAGES: readonly LangCode[] = ['ko', 'ja', 'zh', 'yue'];

export const LANG_NAME: Record<LangCode, string> = {
  ko: 'Korean',
  ja: 'Japanese',
  zh: 'Mandarin',
  yue: 'Cantonese',
};

/**
 * Friendly two-letter chip labels (no per-language colour; DESIGN_SYSTEM §3). Display only: stored data, imports and
 * the engine keep the codes ko / ja / zh / yue.
 */
export const LANG_CODE: Record<LangCode, string> = { ko: 'KR', ja: 'JP', zh: 'CN', yue: 'HK' };
