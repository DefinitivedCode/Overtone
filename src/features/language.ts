import type { LangCode } from '@/db/types';

export const LANGUAGES: readonly LangCode[] = ['ko', 'ja', 'zh', 'yue'];

export const LANG_NAME: Record<LangCode, string> = {
  ko: 'Korean',
  ja: 'Japanese',
  zh: 'Mandarin',
  yue: 'Cantonese',
};

/** Two/three-letter chip codes (no per-language colour; DESIGN_SYSTEM §3). */
export const LANG_CODE: Record<LangCode, string> = { ko: 'KO', ja: 'JA', zh: 'ZH', yue: 'YUE' };
