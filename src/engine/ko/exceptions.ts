/**
 * Words whose pronunciation cannot be derived from spelling alone (ㄴ-insertion, ㄹ-insertion), as
 * [spelling, pronunciation-in-Hangul] pairs. Checked before the rules; the pronunciation is then
 * transliterated without further rule application. Every entry needs a fixture line.
 */
export const KO_EXCEPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['꽃잎', '꼰닙'],
  ['솜이불', '솜니불'],
  ['한여름', '한녀름'],
  ['색연필', '생년필'],
  ['눈요기', '눈뇨기'],
  ['맨입', '맨닙'],
  ['알약', '알략'],
  ['물약', '물략'],
  ['서울역', '서울력'],
  ['늑막염', '능망념'],
];
