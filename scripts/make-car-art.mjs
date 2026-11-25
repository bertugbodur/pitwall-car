// Draws the project's own car art: an animated GIF and a sticker for the README.
// Needs ffmpeg. Usage: PW_CHANNEL=msedge node scripts/make-car-art.mjs <frames dir>
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';

const frames = process.argv[2] ?? 'frames-car';
await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });

const font = await readFile(
  new URL('../apps/web/node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2', import.meta.url),
);
const FONT = `@font-face{font-family:M;src:url(data:font/woff2;base64,${font.toString('base64')});font-weight:200 800}
body{margin:0;font-family:M,sans-serif}`;

/** A neutral hatchback facing right; `spin` turns the wheels. */
const car = (spin) => `
  <path d="M24 112 C26 96 40 90 66 85 L108 79 C132 55 156 44 200 43 C250 42 292 48 314 80 C324 86 328 96 326 112 L322 122 L28 122 Z"
    fill="#2fbf80" stroke="#0b5c3b" stroke-width="3" stroke-linejoin="round"/>
  <path d="M122 78 C140 60 160 52 192 51 L194 76 Z M202 51 C246 51 278 56 296 76 L204 77 Z" fill="#15191d"/>
  <path d="M24 100 L44 97 L42 106 L24 108 Z" fill="#fff6c8"/>
  <rect x="312" y="92" width="14" height="9" rx="3" fill="#c22f2a"/>
  ${[92, 276]
    .map(
      (x) => `<g transform="translate(${x} 120)">
      <circle r="27" fill="#e9eaec"/><circle r="23" fill="#24292e"/><circle r="13" fill="#aeb5bc"/>
      <g transform="rotate(${spin})" stroke="#24292e" stroke-width="3.5" stroke-linecap="round">
        <path d="M0 -10V10M-10 0H10M-7 -7L7 7M-7 7L7 -7"/>
      </g><circle r="3.5" fill="#fff"/></g>`,
    )
    .join('')}`;

/** One frame of the drive; t runs from 0 to 1 and loops seamlessly. */
function scene(t) {
  const bounce = Math.sin(t * Math.PI * 4) * 1.6;
  const dash = -((t * 240) % 80);
  const tree = (x, s) => `<g transform="translate(${x} 205) scale(${s})" fill="#b9d8c9">
    <path d="M0 -70L24 -20H-24ZM0 -48L30 8H-30Z"/><rect x="-4" y="8" width="8" height="14"/></g>`;
  const trees = [0, 1, 2, 3, 4].map((i) => tree(((i * 220 - t * 220) % 1100) + 40, i % 2 ? 0.8 : 1)).join('');
  const wind = [0, 1, 2]
    .map((i) => {
      const x = 215 - ((t * 3 + i / 3) % 1) * 120;
      return `<path d="M${x} ${150 + i * 24}h44" stroke="#9aa4ad" stroke-width="5" stroke-linecap="round"/>`;
    })
    .join('');
  return `<style>${FONT}</style>
  <svg width="800" height="300" viewBox="0 0 800 300">
    <rect width="800" height="300" rx="28" fill="#f5f6f7"/>
    ${trees}
    <rect x="0" y="232" width="800" height="40" fill="#2b3036"/>
    <path d="M0 252H800" stroke="#fff" stroke-width="4" stroke-dasharray="40 40" stroke-dashoffset="${-dash}"/>
    ${wind}
    <g transform="translate(590 ${96 + bounce}) scale(-1 1)">${car(-t * 1080)}</g>
    <text x="36" y="68" font-size="46" font-weight="800" fill="#15191d">pitwall car</text>
    <text x="38" y="100" font-size="19" font-weight="600" fill="#0b6b44">OBD-II · salt okunur / read-only</text>
  </svg>`;
}

const STICKER = `<style>${FONT} html,body{background:transparent}</style>
<svg width="420" height="420" viewBox="0 0 420 420">
  <circle cx="210" cy="210" r="205" fill="#ffffff"/>
  <circle cx="210" cy="210" r="188" fill="#0f7a4f"/>
  <circle cx="210" cy="210" r="172" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="3 12" stroke-linecap="round"/>
  <text x="210" y="122" font-size="52" font-weight="800" fill="#fff" text-anchor="middle">pitwall</text>
  <g transform="translate(60 132) scale(0.86)">
    <path d="M24 112 C26 96 40 90 66 85 L108 79 C132 55 156 44 200 43 C250 42 292 48 314 80 C324 86 328 96 326 112 L322 122 L28 122 Z" fill="#fff"/>
    <path d="M122 78 C140 60 160 52 192 51 L194 76 Z M202 51 C246 51 278 56 296 76 L204 77 Z" fill="#0f7a4f"/>
    <circle cx="92" cy="120" r="24" fill="#15191d"/><circle cx="276" cy="120" r="24" fill="#15191d"/>
    <circle cx="92" cy="120" r="10" fill="#fff"/><circle cx="276" cy="120" r="10" fill="#fff"/>
  </g>
  <text x="210" y="326" font-size="52" font-weight="800" fill="#fff" text-anchor="middle">car</text>
</svg>`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 800, height: 300 } });
const FRAMES = 40;
for (let i = 0; i < FRAMES; i++) {
  await page.setContent(scene(i / FRAMES));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${frames}/c${String(i).padStart(3, '0')}.png` });
}
await page.setViewportSize({ width: 420, height: 420 });
await page.setContent(STICKER);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'docs/media/sticker.png', omitBackground: true });
await browser.close();

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '20', '-i', `${frames}/c%03d.png`,
  '-vf', 'split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none',
  '-loop', '0', 'docs/media/car.gif',
]);
console.log('car.gif and sticker.png written');
