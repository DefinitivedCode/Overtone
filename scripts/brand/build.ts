import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import type { Font as OTFont, PathCommand } from 'opentype.js';
import { DEVICES } from './devices';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..', '..');

export const COLORS = {
  ink: '#17141A',
  paper: '#F4EFE7',
  vermilion: '#E5533A',
  bgLight: '#F6F2EC',
  bgDark: '#121014',
  accentLight: '#C2412B',
  textSecondary: '#6B6470',
  tertiary: '#8A8290',
};

// ---------- font outlining ----------

type Font = OTFont;

function loadFont(file: string): Font {
  const buf = readFileSync(file);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

function fontsourceDir(pkg: string): string {
  return path.dirname(require.resolve(`${pkg}/package.json`)) + '/files';
}

const fontCache = new Map<string, Font[]>();
/** Loads every 400-weight "normal" .woff slice of a Fontsource package (sorted for determinism). */
function stack(pkg: string, filter: (f: string) => boolean = () => true): Font[] {
  const key = pkg;
  const hit = fontCache.get(key);
  if (hit) return hit;
  const dir = fontsourceDir(pkg);
  const fonts: Font[] = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('-400-normal.woff') || !filter(f)) continue;
    try {
      fonts.push(loadFont(path.join(dir, f)));
    } catch {
      // opentype.js cannot inflate a few woff slices; a missing glyph is reported by outline().
    }
  }
  fontCache.set(key, fonts);
  return fonts;
}

type Cmd = PathCommand;
const n = (v: number | undefined) => String(Math.round((v ?? 0) * 100) / 100);

/** Own serialiser: opentype.js 2.x toPathData emitted malformed data for some glyphs. */
function pathData(commands: Cmd[]): string {
  return commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${n(c.x)} ${n(c.y)}`;
        case 'Q':
          return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case 'C':
          return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        default:
          return 'Z';
      }
    })
    .join('');
}

export interface Outlined {
  d: string;
  width: number;
}

/** Converts text to SVG path data, picking each code point's glyph from the first font that has it. */
export function outline(
  fonts: Font[],
  text: string,
  x: number,
  y: number,
  size: number,
  letterSpacing = 0,
): Outlined {
  let cursor = x;
  const parts: string[] = [];
  for (const ch of text) {
    const font = fonts.find((f) => f.charToGlyph(ch).index !== 0);
    if (!font) throw new Error(`No glyph for ${JSON.stringify(ch)} in the provided fonts`);
    const glyph = font.charToGlyph(ch);
    parts.push(pathData(glyph.getPath(cursor, y, size).commands));
    cursor += ((glyph.advanceWidth ?? 0) * size) / font.unitsPerEm + letterSpacing;
  }
  return { d: parts.join(' '), width: cursor - x };
}

const serif = () => stack('@fontsource/instrument-serif', (f) => f.includes('-latin-'));
const sans = () => stack('@fontsource/inter', (f) => f.includes('-latin-'));

function path_(d: string, fill: string): string {
  return `<path d="${d}" fill="${fill}"/>`;
}

// ---------- mark & icon ----------

function markShapes(strokeFill: string): string {
  return [
    `<rect x="232" y="312" width="248" height="64" rx="32" fill="${COLORS.vermilion}"/>`,
    `<rect x="232" y="420" width="560" height="120" rx="60" fill="${strokeFill}"/>`,
    `<rect x="232" y="592" width="400" height="120" rx="60" fill="${strokeFill}" fill-opacity="0.26"/>`,
  ].join('\n  ');
}

export function markSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  ${markShapes(COLORS.paper)}
</svg>
`;
}

export function faviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="232 312 560 400">
  <style>.l{fill:${COLORS.ink}}@media (prefers-color-scheme:dark){.l{fill:${COLORS.paper}}}</style>
  <rect x="232" y="312" width="248" height="64" rx="32" fill="${COLORS.vermilion}"/>
  <rect class="l" x="232" y="420" width="560" height="120" rx="60"/>
  <rect class="l" x="232" y="592" width="400" height="120" rx="60" fill-opacity="0.26"/>
</svg>
`;
}

function iconSvg(): string {
  return readFileSync(path.join(root, 'brand', 'icon.svg'), 'utf8');
}

function render(svg: string, width: number): Buffer {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
  return Buffer.from(png);
}

// ---------- wordmark & banner ----------

export function wordmarkSvg(): string {
  const o = outline(serif(), 'overtone', 0, 100, 112, -1);
  const w = Math.ceil(o.width) + 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 140" width="${w}" height="140" role="img" aria-label="overtone">
  ${path_(o.d, COLORS.ink)}
</svg>
`;
}

const SPECIMEN = [
  { lang: 'KOREAN', rt: 'saranghae', base: '사랑해', pkg: '@fontsource/noto-sans-kr', x: 0 },
  { lang: 'JAPANESE', rt: 'aishiteru', base: '愛してる', pkg: '@fontsource/noto-sans-jp', x: 280 },
  { lang: 'MANDARIN', rt: 'wǒ ài nǐ', base: '我爱你', pkg: '@fontsource/noto-sans-sc', x: 560 },
  {
    lang: 'CANTONESE',
    rt: 'ngo5 oi3 nei5',
    base: '我愛你',
    pkg: '@fontsource/noto-sans-hk',
    x: 840,
  },
];

/** 1280-wide banner; `height` 640 (README) or 672 (re-flowed to 1200×630 for Open Graph). */
export function bannerSvg(height = 640): string {
  const dy = (height - 640) / 2;
  const word = outline(serif(), 'overtone', 352, 262, 112, -1);
  const tag = outline(sans(), 'Read it. Say it. Sing it.', 356, 312, 26, 0.5);
  const cells = SPECIMEN.map((s) => {
    const x = 96 + s.x;
    const rt = outline(sans(), s.rt, x, 458, 22);
    const base = outline(stack(s.pkg), s.base, x, 514, 46);
    const lang = outline(sans(), s.lang, x, 560, 15, 2);
    return [
      path_(rt.d, COLORS.accentLight),
      path_(base.d, COLORS.ink),
      path_(lang.d, COLORS.tertiary),
    ].join('\n    ');
  }).join('\n    ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 ${height}" width="1280" height="${height}" role="img" aria-label="Overtone — Read it. Say it. Sing it.">
  <rect width="1280" height="${height}" fill="${COLORS.bgLight}"/>
  <g transform="translate(0 ${dy})">
    <g transform="translate(96 150) scale(0.22)">
      <rect width="1024" height="1024" rx="228" fill="${COLORS.ink}"/>
      ${markShapes(COLORS.paper)}
    </g>
    ${path_(word.d, COLORS.ink)}
    ${path_(tag.d, COLORS.textSecondary)}
    <line x1="96" y1="404" x2="1184" y2="404" stroke="${COLORS.ink}" stroke-opacity="0.08" stroke-width="2"/>
    ${cells}
  </g>
</svg>
`;
}

// ---------- splash ----------

function splashSvg(w: number, h: number, theme: 'light' | 'dark'): string {
  const bg = theme === 'light' ? COLORS.bgLight : COLORS.bgDark;
  const stroke = theme === 'light' ? COLORS.ink : COLORS.paper;
  const s = (0.22 * Math.min(w, h)) / 560;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <g transform="translate(${(w / 2 - 512 * s).toFixed(2)} ${(h / 2 - 512 * s).toFixed(2)}) scale(${s.toFixed(5)})">
  ${markShapes(stroke)}
  </g>
</svg>
`;
}

export interface SplashLink {
  href: string;
  media: string;
}

// ---------- everything ----------

export interface BuiltAsset {
  path: string; // repo-relative
  data: Buffer | string;
}

export function buildAssets(): { assets: BuiltAsset[]; splashLinks: SplashLink[] } {
  const assets: BuiltAsset[] = [];
  const png = (p: string, svg: string, width: number) =>
    assets.push({ path: p, data: render(svg, width) });
  const icon = iconSvg();

  assets.push({ path: 'brand/mark.svg', data: markSvg() });
  assets.push({ path: 'brand/wordmark.svg', data: wordmarkSvg() });
  assets.push({ path: 'brand/banner.svg', data: bannerSvg(640) });
  assets.push({ path: 'public/favicon.svg', data: faviconSvg() });
  png('public/icons/apple-touch-icon.png', icon, 180);
  png('public/icons/icon-192.png', icon, 192);
  png('public/icons/icon-512.png', icon, 512);
  png('public/icons/maskable-512.png', icon, 512);
  png('public/icons/favicon-32.png', icon, 32);
  png('docs/banner.png', bannerSvg(640), 1280);
  // 1280x672 has the 1200x630 aspect ratio; render at exactly 1200 wide.
  png('public/og.png', bannerSvg(672), 1200);

  const splashLinks: SplashLink[] = [];
  for (const d of DEVICES) {
    for (const theme of ['light', 'dark'] as const) {
      const w = d.cssWidth * d.dpr;
      const h = d.cssHeight * d.dpr;
      const file = `splash/${d.name}-${d.cssWidth}x${d.cssHeight}@${d.dpr}x-${theme}.png`;
      assets.push({
        path: `public/${file}`,
        data: Buffer.from(new Resvg(splashSvg(w, h, theme)).render().asPng()),
      });
      splashLinks.push({
        href: file,
        media: `(device-width: ${d.cssWidth}px) and (device-height: ${d.cssHeight}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait) and (prefers-color-scheme: ${theme})`,
      });
    }
  }

  // Self-hosted display font (Latin subset) + its licence.
  const dir = fontsourceDir('@fontsource/instrument-serif');
  assets.push({
    path: 'public/fonts/instrument-serif-latin-400.woff2',
    data: readFileSync(path.join(dir, 'instrument-serif-latin-400-normal.woff2')),
  });
  assets.push({
    path: 'public/fonts/OFL-instrument-serif.txt',
    data: readFileSync(path.join(path.dirname(dir), 'LICENSE')),
  });

  assets.push({
    path: 'src/app/splash-links.generated.ts',
    data:
      `// Generated by scripts/brand/generate-assets.ts — do not edit.\n` +
      `export const splashLinks: ReadonlyArray<{ href: string; media: string }> = ${JSON.stringify(splashLinks, null, 2)};\n`,
  });
  return { assets, splashLinks };
}
