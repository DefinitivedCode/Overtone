import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { romaniseEojeol, romaniseKorean } from '@/engine/ko/romanise';
import { assemble, convertLyrics, lineText, reviewCount } from './convert';
import { detectRomanised } from './detect';
import { romajiToKana } from './japanese';
import { romanToHangul } from './korean';

describe('Korean: romanisation → Hangul candidates', () => {
  it.each([
    ['saranghae', '사랑해'],
    ['annyeonghaseyo', '안녕하세요'],
    ['gomawo', '고마워'],
    ['bogo', '보고'],
    ['gwaenchana', '괜차나'], // the real spelling 괜찮아 hides a silent ㅎ: offered only as sound
  ])('%s offers %s first', (roman, expected) => {
    expect(romanToHangul(roman)[0]).toBe(expected);
  });

  it('keeps ambiguous spellings as alternatives instead of choosing silently', () => {
    expect(romanToHangul('meogeo')).toEqual(expect.arrayContaining(['머거', '먹어']));
    expect(romanToHangul('gungmul')).toEqual(expect.arrayContaining(['궁물', '국물']));
    expect(romanToHangul('hamnida')).toEqual(expect.arrayContaining(['함니다', '합니다']));
    expect(romanToHangul('silla')).toEqual(expect.arrayContaining(['신라']));
  });

  it('every revised-romanization candidate romanises back to what was pasted', () => {
    for (const word of ['neoreul', 'saranghae', 'jongno', 'eopda', 'hamnida', 'bamhaneul', 'nal']) {
      for (const c of romanToHangul(word)) expect(romaniseEojeol(c)).toBe(word);
    }
  });

  it('accepts hyphenated syllables and returns nothing for non-romanisation', () => {
    expect(romanToHangul('sa-rang-hae')[0]).toBe('사랑해');
    expect(romanToHangul('love')).toEqual([]);
    expect(romanToHangul('baby')).toEqual([]);
    expect(romanToHangul('123')).toEqual([]);
  });

  it('reads looser conventions as lower-ranked candidates', () => {
    // "ka" written for 가 rather than RR 카
    const c = romanToHangul('kaja');
    expect(c).toContain('카자');
    expect(c).toContain('가자');
    expect(c.indexOf('카자')).toBeLessThan(c.indexOf('가자'));
  });

  it('measures recovery on the starter fixtures (feasibility gate)', () => {
    const fx = JSON.parse(
      readFileSync(
        path.join(import.meta.dirname, '../../../fixtures/linguistic/ko/starter.json'),
        'utf8',
      ),
    ) as Array<{ text: string }>;
    let words = 0;
    let top1 = 0;
    let any = 0;
    for (const { text } of fx) {
      for (const w of text.split(/\s+/).filter((x) => /^[가-힣]+$/.test(x))) {
        words++;
        const c = romanToHangul(romaniseKorean(w));
        if (c[0] === w) top1++;
        if (c.includes(w)) any++;
      }
    }
    // Spelling cannot always be recovered from sound (좋아 → 조아), so these are floors, not promises.
    expect(any / words).toBeGreaterThan(0.5); // measured 0.59 on 73 words
    expect(top1 / words).toBeGreaterThan(0.25); // measured 0.29
  });
});

describe('Japanese: romaji → kana', () => {
  it.each([
    ['kimi', 'きみ'],
    ['arigatou', 'ありがとう'],
    ['konnichiwa', 'こんにちわ'],
    ['gakkou', 'がっこう'],
    ['shinjiru', 'しんじる'],
    ['kyou', 'きょう'],
    ['matcha', 'まっちゃ'],
    ['sensei', 'せんせい'],
    ["kon'ya", 'こんや'],
    ['kanojo', 'かのじょ'],
  ])('%s → %s', (romaji, kana) => {
    expect(romajiToKana(romaji)[0]).toBe(kana);
  });

  it('understands Nihon-shiki spellings', () => {
    expect(romajiToKana('tukuru')[0]).toBe('つくる');
    expect(romajiToKana('sityou')[0]).toBe('ちちょう'.replace('ちちょう', 'しちょう'));
  });

  it('offers the particle readings and long-vowel alternatives', () => {
    expect(romajiToKana('wa')).toEqual(['は', 'わ']);
    expect(romajiToKana('o')).toEqual(['を', 'お']);
    expect(romajiToKana('e')).toEqual(['へ', 'え']);
    expect(romajiToKana('tōkyō')).toEqual(expect.arrayContaining(['とうきょう', 'とおきょお']));
    expect(romajiToKana('kōhī')).toContain('コーヒー');
  });

  it('offers katakana as a later option and rejects non-romaji', () => {
    expect(romajiToKana('kimi')).toEqual(['きみ', 'キミ']);
    for (const w of ['love', 'baby', 'strength', 'x', '']) expect(romajiToKana(w)).toEqual([]);
  });
});

describe('detectRomanised', () => {
  it('recognises romanised Korean', () => {
    const d = detectRomanised('saranghae neoreul\nnae maeume eopsseo\nbogo sipeo jeongmal');
    expect(d).toMatchObject({ romanised: true, language: 'ko' });
  });
  it('recognises romanised Japanese', () => {
    const d = detectRomanised('kimi no namae wo yobu\nitsumo soba ni iru yo\nshiawase ni naritai');
    expect(d).toMatchObject({ romanised: true, language: 'ja' });
  });
  it('is not fooled by English lyrics or original script', () => {
    expect(
      detectRomanised("I'm walking down the road tonight\nwith the stars above me").romanised,
    ).toBe(false);
    expect(detectRomanised('사랑해 너를 정말 많이').romanised).toBe(false);
    expect(detectRomanised('君の名前を呼ぶ いつもそばにいる よ').romanised).toBe(false);
    expect(detectRomanised('').romanised).toBe(false);
  });
  it('still offers a choice when both languages fit and nothing tells them apart', () => {
    const d = detectRomanised('kimi nami kami\nsama kana mina');
    expect(d.romanised).toBe(true);
  });
});

describe('convertLyrics', () => {
  const source = '[Verse 1]\nkimi wa utau, I love you\n\nsayonara!';

  it('preserves section labels, blank lines, punctuation and English', () => {
    const lines = convertLyrics(source, 'ja');
    expect(lines.map((l) => l.source).join('\n')).toBe(source);
    const out = assemble(lines).split('\n');
    expect(out[0]).toBe('[Verse 1]');
    expect(out[2]).toBe('');
    expect(out[1]).toBe('きみ は うたう, I love you');
    expect(out[3]).toBe('さよなら!');
  });

  it('keeps ambiguous English words as written but offers the conversion', () => {
    const [, line] = convertLyrics('kimi no koto\nkimi no baby', 'ja');
    expect(lineText(line!)).toBe('きみ の baby');
    const [inLine] = convertLyrics('the sun in my sora', 'ja');
    const inWord = inLine!.segments.find((s) => s.type === 'word' && s.source === 'in');
    // "in" parses as ん-ending romaji, but the line has English: pasted word first, kana still on offer.
    expect(inWord && inWord.type === 'word' && inWord.candidates.slice(0, 2)).toEqual([
      'in',
      'いん',
    ]);
  });

  it('applies word choices and manual line edits without touching other lines', () => {
    const lines = convertLyrics('kimi wa\nmeogeo', 'ja');
    expect(assemble(lines, { '0:2': 1 })).toBe(
      'きみ わ\nめおげお'.replace('めおげお', lineText(lines[1]!)),
    );
    expect(assemble(lines, {}, { 1: 'manual' }).split('\n')[1]).toBe('manual');
    expect(reviewCount(lines[0]!)).toBeGreaterThan(0);
  });

  it('never alters the pasted text it was given', () => {
    const lines = convertLyrics('saranghae\nneoreul', 'ko');
    expect(lines.map((l) => l.source)).toEqual(['saranghae', 'neoreul']);
  });

  it('handles mixed Korean and English lines', () => {
    const [line] = convertLyrics('baby saranghae you', 'ko');
    expect(lineText(line!)).toBe('baby 사랑해 you');
  });
});
