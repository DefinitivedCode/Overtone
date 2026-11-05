const KANA = /^(?:[ぁ-ゖァ-ヺーゝゞヽヾ]|\u3099|\u309a)+$/u;
const HAN = /[\p{Script=Han}々〆ヶ]/u;

export const isKana = (text: string): boolean => KANA.test(text.normalize('NFKC'));
export const hasKanji = (text: string): boolean => HAN.test(text);

export function toHiragana(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ァ-ヶヽヾ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
