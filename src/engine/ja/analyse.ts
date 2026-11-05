import { lookupInstalled } from '../dict/lookup';
import { plainToken } from '../model';
import type { Token } from '../model';
import { alignFurigana } from './furigana';
import { hepburn, particleKana } from './hepburn';
import { hasKanji, isKana, toHiragana } from './kana';
import { installedTokenizer } from './tokenizer';
import type { JapaneseMorph } from './tokenizer';

const AMBIGUOUS = new Set([
  '何',
  '方',
  '一日',
  '人気',
  '一人',
  '二人',
  '明日',
  '宝物',
  '今日',
  '生',
]);
// Common standalone compounds whose contextual IPADIC reading can be a counter split or a rarer variant.
const COMPOUNDS = new Map<string, [reading: string, pronunciation?: string]>([
  ['一人', ['ひとり']],
  ['二人', ['ふたり']],
  ['三人', ['さんにん']],
  ['一日中', ['いちにちじゅう', 'いちにちじゅー']],
  ['宝物', ['たからもの']],
]);
const GLOSSES: Readonly<Record<string, string>> = {
  は: 'topic',
  が: 'subject',
  を: 'object',
  に: 'to / at',
  へ: 'toward',
  で: 'at / by',
  と: 'and / with',
  も: 'also',
  の: 'of / possessive',
  よ: 'emphasis',
  ね: 'agreement',
  な: 'sentence ending',
  て: 'connective',
  た: 'past',
  ない: 'negative',
  ます: 'polite',
  です: 'polite copula',
};
const TE_AUX = new Set(['いる', 'おる', 'ある', 'おく', 'みる', 'くる', 'てる', 'でる']);

function attach(morph: JapaneseMorph, previous?: JapaneseMorph): boolean {
  if (!previous) return false;
  const pos = morph.partOfSpeech;
  if (morph.surface === 'な' && morph.conjugationType === '体言接続') return false;
  const connective = previous.partOfSpeech === '助詞' && /^(て|で)$/.test(previous.surface);
  const verbStem = previous.partOfSpeech === '動詞' && previous.conjugationType?.startsWith('連用');
  return (
    pos === '助動詞' ||
    (pos === '助詞' &&
      /^(て|で)$/.test(morph.surface) &&
      /^(動詞|形容詞|助動詞)$/.test(previous.partOfSpeech ?? '')) ||
    (pos === '動詞' &&
      ((verbStem && morph.partOfSpeechSubcategory1 === '非自立') ||
        (connective && TE_AUX.has(morph.baseForm ?? '')))) ||
    morph.partOfSpeechSubcategory1 === '接尾'
  );
}

function mergeCompounds(morphs: JapaneseMorph[]): JapaneseMorph[] {
  const out: JapaneseMorph[] = [];
  for (let i = 0; i < morphs.length;) {
    const morph = morphs[i]!;
    let form = '';
    let merged = false;
    for (let end = i; end < Math.min(i + 3, morphs.length); end++) {
      form += morphs[end]!.surface;
      const reading = COMPOUNDS.get(form);
      if (!reading) continue;
      const next = morphs[end + 1]?.surface ?? '';
      if (
        (form === '一人' && /^(前|称)/u.test(next)) ||
        (form === '二人' && next.startsWith('三脚'))
      )
        break;
      out.push({
        surface: form,
        baseForm: form,
        partOfSpeech: '名詞',
        reading: reading[0],
        pronunciation: reading[1],
      });
      i = end + 1;
      merged = true;
      break;
    }
    if (!merged) {
      out.push(morph);
      i++;
    }
  }
  return out;
}

const kana = (value?: string): string | null => (value && isKana(value) ? toHiragana(value) : null);

export function userReadingToken(surface: string, start: number, reading: string): Token {
  const hiragana = toHiragana(reading);
  return plainToken({
    start,
    end: start + surface.length,
    surface,
    lang: 'ja',
    reading: hiragana,
    roman: hepburn(hiragana),
    ruby: alignFurigana(surface, hiragana).units,
    confidence: 'high',
    userReading: true,
  });
}

export async function analyseJapanese(
  text: string,
  start: number,
  version?: string | null,
): Promise<Token[]> {
  const tokenizer = await installedTokenizer(version);
  if (!tokenizer)
    return [
      plainToken({
        start,
        end: start + text.length,
        surface: text,
        lang: 'ja',
        notes: ['needs-language-data'],
      }),
    ];
  const morphs = mergeCompounds(tokenizer.tokenize(text));
  if (morphs.map((m) => m.surface).join('') !== text)
    return [
      plainToken({
        start,
        end: start + text.length,
        surface: text,
        lang: 'ja',
        notes: ['unknown-word'],
      }),
    ];

  const missing = morphs
    .filter((m) => !kana(m.reading) && hasKanji(m.surface))
    .map((m) => m.surface);
  const entries = missing.length ? await lookupInstalled('ja', missing, version) : null;
  let offset = start;
  return morphs.map((m, i) => {
    const { surface } = m;
    const pos = m.partOfSpeech === 'UNK' ? null : (m.partOfSpeech ?? null);
    const rows = entries?.get(surface);
    const alternatives = [
      ...new Set(
        rows
          ?.flatMap((r) => [r.r, ...(r.a ?? [])])
          .map(kana)
          .filter((r) => r !== null),
      ),
    ];
    const known = kana(m.reading);
    const reading = known ?? kana(surface) ?? alternatives[0] ?? null;
    const previous = morphs[i - 1];
    const volitional =
      pos === '助動詞' && surface === 'う' && previous?.conjugationType === '未然ウ接続';
    const pronunciation = volitional
      ? 'ー'
      : (particleKana(surface, pos) ?? kana(m.pronunciation) ?? undefined);
    const ruby = reading ? alignFurigana(surface, reading) : { units: [], uncertain: false };
    const notes: string[] = [];
    let confidence: Token['confidence'] = 'high';
    if (!reading || alternatives.length) {
      notes.push('unknown-word');
      confidence = !reading ? 'none' : alternatives.length > 1 ? 'low' : 'medium';
    } else if (
      AMBIGUOUS.has(surface) ||
      ruby.uncertain ||
      m.partOfSpeechSubcategory1 === '固有名詞'
    ) {
      notes.push('ambiguous-reading');
      confidence = 'medium';
    }
    const token = plainToken({
      start: offset,
      end: offset + surface.length,
      surface,
      lang: 'ja',
      kind: pos === '助詞' ? 'particle' : 'word',
      pos,
      lemma: m.baseForm && m.baseForm !== '*' ? m.baseForm : null,
      reading,
      pronunciation,
      roman: reading ? hepburn(particleKana(surface, pos) ?? reading, pronunciation) : null,
      ruby: ruby.units,
      confidence,
      notes,
      attachToPrev: attach(m, previous),
      particleGloss:
        pos === '助詞' || pos === '助動詞' ? GLOSSES[m.baseForm ?? surface] : undefined,
    });
    offset += surface.length;
    return token;
  });
}
