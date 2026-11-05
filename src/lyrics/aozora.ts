import type { ReadingSpan } from '../engine/model';
import { isKana } from '../engine/ja/kana';

/** Parse explicit |base《kana》 and implicit 漢字《kana》 on one lyric line. */
export function parseAozora(line: string): { text: string; readings: ReadingSpan[] } {
  const readings: ReadingSpan[] = [];
  let text = '';
  let consumed = 0;
  for (const match of line.matchAll(/《([^《》\r\n]+)》/gu)) {
    const reading = match[1]!;
    if (!isKana(reading)) continue;
    const before = line.slice(consumed, match.index);
    const explicit = /[|｜]([^|｜《》\r\n]+)$/u.exec(before);
    const implicit = /[\p{Script=Han}々〆]+$/u.exec(before);
    const base = explicit?.[1] ?? implicit?.[0];
    const index = explicit?.index ?? implicit?.index;
    if (!base?.trim() || index === undefined) continue;
    text += before.slice(0, index);
    readings.push({ start: text.length, end: text.length + base.length, reading });
    text += base;
    consumed = match.index + match[0].length;
  }
  return { text: text + line.slice(consumed), readings };
}

export const hasAozora = (text: string): boolean =>
  text.includes('《') && text.split(/\r?\n/u).some((line) => parseAozora(line).readings.length > 0);
