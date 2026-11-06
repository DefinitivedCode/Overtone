import { describe, expect, it } from 'vitest';
import { lemmaCandidates } from './lemma';

describe('lemmaCandidates: ㄹ-dropping and absorbed endings', () => {
  const has = (word: string, lemma: string) => expect(lemmaCandidates(word)).toContain(lemma);

  it('restores ㄹ before ㄴ', () => {
    has('분다', '불다');
    has('만든다', '만들다');
    has('안다', '알다');
  });
  it('restores ㄹ before ㅂ니다', () => {
    has('압니다', '알다');
    has('만듭니다', '만들다');
  });
  it('restores ㄹ before 는 and 세요', () => {
    has('아는', '알다');
    has('만드는', '만들다');
    has('만드세요', '만들다');
  });
  it('also finds the plain vowel stem for ㅂ니다 and ㄴ다', () => {
    has('갑니다', '가다');
    has('간다', '가다');
    has('합니다', '하다');
  });
  it('keeps the earlier behaviour', () => {
    has('사랑해', '사랑하다');
    expect(lemmaCandidates('사랑해')[0]).toBe('사랑해');
    has('봤어', '보다');
  });
  it('never throws on odd input', () => {
    for (const w of ['', 'ㅋㅋ', 'a', '다', '니다', '는', 'ㅂ니다'])
      expect(() => lemmaCandidates(w)).not.toThrow();
  });
});
