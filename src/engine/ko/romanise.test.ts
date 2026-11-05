import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasHangul, romaniseEojeol, romaniseKorean } from './romanise';

interface Fx {
  id: string;
  text: string;
  expected: { romanLine: string };
  tags: string[];
}
const fixtures = JSON.parse(
  readFileSync(
    path.join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'fixtures',
      'linguistic',
      'ko',
      'starter.json',
    ),
    'utf8',
  ),
) as Fx[];

describe('Revised Romanization, pronunciation-based', () => {
  it.each(fixtures.map((f) => [f.id, f.text, f.expected.romanLine, f.tags[0]] as const))(
    '%s %s → %s (%s)',
    (_id, text, expected) => {
      expect(romaniseKorean(text)).toBe(expected);
    },
  );
});

describe('rule examples (LANGUAGE_ENGINE §5.1)', () => {
  it.each([
    ['닭', 'dak'],
    ['없다', 'eopda'],
    ['사랑이', 'sarangi'],
    ['먹어', 'meogeo'],
    ['앉아', 'anja'],
    ['좋다', 'jota'],
    ['축하', 'chuka'],
    ['좋아', 'joa'],
    ['많아', 'mana'],
    ['같이', 'gachi'],
    ['굳이', 'guji'],
    ['합니다', 'hamnida'],
    ['국물', 'gungmul'],
    ['종로', 'jongno'],
    ['협력', 'hyeomnyeok'],
    ['신라', 'silla'],
    ['설날', 'seollal'],
    ['꽃', 'kkot'],
    ['밖', 'bak'],
    ['별', 'byeol'],
    ['사랑해', 'saranghae'],
  ])('%s → %s', (word, roman) => {
    expect(romaniseEojeol(word)).toBe(roman);
  });
});

describe('letter-by-letter mode (rule 10 only)', () => {
  it.each([
    ['사랑해', 'saranghae'],
    ['꽃', 'kkoch'],
    ['앉아', 'anja'],
    ['좋다', 'johda'],
    ['밖', 'bakk'],
    ['값', 'gaps'],
    ['별', 'byeol'],
  ])('%s → %s', (word, roman) => {
    expect(romaniseEojeol(word, 'letters')).toBe(roman);
  });
});

describe('mixed content', () => {
  it('passes Latin, digits and punctuation through and keeps whitespace', () => {
    expect(romaniseKorean('baby 내 맘을, I love you!')).toBe('baby nae mameul, I love you!');
    expect(romaniseKorean('사랑해!!')).toBe('saranghae!!');
    expect(romaniseKorean('  두  칸  ')).toBe('  du  kan  ');
  });
  it('does not apply liaison across punctuation inside an eojeol', () => {
    expect(romaniseEojeol('먹-어')).toBe('meok-eo');
  });
  it('transliterates compatibility jamo letter by letter (ㅋㅋ, ㅠㅠ)', () => {
    expect(romaniseKorean('ㅋㅋ')).toBe('kk');
    expect(romaniseKorean('ㅠㅠ')).toBe('yuyu');
  });
  it('detects Hangul', () => {
    expect(hasHangul('abc 가')).toBe(true);
    expect(hasHangul('abc')).toBe(false);
  });
});

describe('invariants', () => {
  it('output is ASCII-only for pure Hangul input and never empty', () => {
    for (const f of fixtures) {
      const out = romaniseKorean(f.text);
      expect(out).toMatch(/^[a-z ]+$/);
    }
  });
});
