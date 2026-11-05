import { describe, expect, it } from 'vitest';
import { detectLanguage, hanVariant, langAttr } from './detect';

describe('detectLanguage', () => {
  it('detects Korean from Hangul, ignoring section labels', () => {
    const d = detectLanguage('[Chorus]\n사랑해 요\n나는 노래해');
    expect(d).toMatchObject({ language: 'ko', confidence: 'high', needsChoice: false });
  });
  it('detects Korean with English mixed in', () => {
    expect(detectLanguage('baby 내 맘을 알아\nI love you').language).toBe('ko');
  });
  it('detects Japanese from kana plus kanji', () => {
    expect(detectLanguage('君の名前を呼んでいた')).toMatchObject({
      language: 'ja',
      confidence: 'high',
    });
  });
  it('a little kana in lots of Han is medium confidence Japanese', () => {
    const d = detectLanguage('東京大学京都大学大阪大学北海道大学の');
    expect(d.language).toBe('ja');
    expect(d.confidence).toBe('medium');
  });
  it('Han-only text needs a choice and suggests Mandarin by default', () => {
    expect(detectLanguage('我爱你\n你好吗')).toMatchObject({
      language: null,
      needsChoice: true,
      suggestion: 'zh',
      reason: 'han-only',
    });
  });
  it('Han-only text with Cantonese markers suggests Cantonese (still needs a choice)', () => {
    expect(detectLanguage('我哋喺度\n佢唔係嘅')).toMatchObject({
      needsChoice: true,
      suggestion: 'yue',
    });
  });
  it('weak markers alone do not tip towards Cantonese for Mandarin-looking text', () => {
    const text = '这是我的歌\n你是谁呢\n那是什么呢' + '\n我爱你'.repeat(10);
    expect(detectLanguage(text).suggestion).toBe('zh');
  });
  it('Latin-only text is undetected', () => {
    expect(detectLanguage('I love you\nla la la')).toMatchObject({
      language: null,
      reason: 'no-letters',
      needsChoice: false,
    });
  });
  it('empty text is undetected', () => {
    expect(detectLanguage('').reason).toBe('no-letters');
  });
  it('treats ー and iteration marks as kana', () => {
    expect(detectLanguage('ー').language).toBe('ja');
  });
});

describe('lang attributes', () => {
  it('chooses Simplified vs Traditional by distinguishing characters', () => {
    expect(hanVariant('我爱你')).toBe('hans');
    expect(hanVariant('我愛你')).toBe('hant');
    expect(hanVariant('你好')).toBe('hans');
  });
  it('maps song languages to BCP-47', () => {
    expect(langAttr('ko', '')).toBe('ko');
    expect(langAttr('ja', '')).toBe('ja');
    expect(langAttr('yue', '我愛你')).toBe('zh-HK');
    expect(langAttr('zh', '我愛你')).toBe('zh-Hant');
    expect(langAttr('zh', '我爱你')).toBe('zh-Hans');
  });
});
