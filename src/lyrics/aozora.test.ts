import { expect, it } from 'vitest';
import { hasAozora, parseAozora } from './aozora';
import { lineKey, parseLyrics } from './parse';

it('recognises both Aozora forms and preserves UTF-16 positions around emoji and astral kanji', () => {
  expect(parseAozora('🌸｜花びら《はなびら》と𠮷野《ヨシノ》')).toEqual({
    text: '🌸花びらと𠮷野',
    readings: [
      { start: 2, end: 5, reading: 'はなびら' },
      { start: 6, end: 9, reading: 'ヨシノ' },
    ],
  });
  expect(hasAozora('|運命《sadame》\n《かな》\n漢字《》')).toBe(false);
  expect(parseAozora('|運命《bad》').text).toBe('|運命《bad》');
});

it('shares progress keys for equal text while preserving different readings and the opt-out', async () => {
  const raw = '|運命《さだめ》\n運命《うんめい》';
  const lines = await parseLyrics(raw, true);
  expect(lines.map((l) => l.key)).toEqual([await lineKey('運命'), await lineKey('運命')]);
  expect(lines.map((l) => l.readings?.[0]?.reading)).toEqual(['さだめ', 'うんめい']);
  expect((await parseLyrics(raw)).map((l) => l.text)).toEqual(raw.split('\n'));
});
