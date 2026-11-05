// Generates docs/badges/*.svg: small flat badges stored in the repo so the README never depends on a badge service.
// Usage: node scripts/docs/badges.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = path.resolve(import.meta.dirname, '..', '..', 'docs', 'badges');
mkdirSync(out, { recursive: true });

const BADGES = [
  ['license', 'license', 'MIT', '#E5533A'],
  ['pwa', 'PWA', 'installable', '#17141A'],
  ['offline', 'offline', 'first', '#2F6B3A'],
  ['backend', 'backend', 'none', '#5E5763'],
  ['tracking', 'tracking', 'none', '#5E5763'],
  ['react', 'React', '19', '#0E7C9E'],
  ['typescript', 'TypeScript', 'strict', '#3178C6'],
  ['vite', 'Vite', '8', '#646CFF'],
  ['playwright', 'tested with', 'Playwright', '#2E8B3A'],
  ['languages', 'languages', 'KR · JP · CN · HK', '#B23A26'],
];

const width = (text) => Math.round(text.length * 6.6 + 14);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

for (const [file, label, message, color] of BADGES) {
  const a = width(label);
  const b = width(message);
  const total = a + b;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="22" role="img" aria-label="${esc(label)}: ${esc(message)}">
  <title>${esc(label)}: ${esc(message)}</title>
  <clipPath id="r"><rect width="${total}" height="22" rx="4"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${a}" height="22" fill="#3C3842"/>
    <rect x="${a}" width="${b}" height="22" fill="${color}"/>
  </g>
  <g fill="#fff" font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="11" text-anchor="middle">
    <text x="${a / 2}" y="15">${esc(label)}</text>
    <text x="${a + b / 2}" y="15" font-weight="700">${esc(message)}</text>
  </g>
</svg>
`;
  writeFileSync(path.join(out, `${file}.svg`), svg);
}
console.log(`${BADGES.length} badges written to ${out}`);
