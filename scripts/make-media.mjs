// Records README screenshots and the cockpit demo GIF from the simulator.
// Needs the preview server on :4173 and ffmpeg. Usage: PW_CHANNEL=msedge node scripts/make-media.mjs <frames dir>
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';

const BASE = 'http://localhost:4173/pitwall-car/#/';
const FPS = 8;
const frames = process.argv[2] ?? 'frames';
await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });

async function session(viewport, settings) {
  const context = await browser.newContext({ viewport, locale: 'tr-TR', serviceWorkers: 'block' });
  await context.addInitScript((value) => localStorage.setItem('pitwall-settings', value), JSON.stringify({
    state: { safetyAccepted: true, language: 'tr', ...settings },
    version: 1,
  }));
  const page = await context.newPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Simülatörle dene' }).click();
  await page.getByRole('combobox', { name: 'Senaryo' }).waitFor();
  return { context, page };
}
const go = (page, hash) => page.evaluate((h) => (location.hash = h), `#/${hash}`);
// The simulator controls are not part of the product, so they are hidden in the pictures.
const HIDE = '[data-testid=hmi] footer { visibility: hidden }';

// Demo GIF: night cockpit, a fault arrives, then its explanation.
const demo = await session({ width: 960, height: 540 }, { scenario: 'city', theme: 'dark', hmiTheme: 'night' });
const { page } = demo;
await go(page, 'hmi');
await page.getByRole('button', { name: 'Sürüşü başlat' }).click();
await page.addStyleTag({ content: HIDE });
await page.waitForTimeout(6000);

let index = 0;
async function film(seconds) {
  for (let i = 0; i < seconds * FPS; i++) {
    const started = Date.now();
    await page.screenshot({ path: `${frames}/f${String(index++).padStart(4, '0')}.png` });
    await page.waitForTimeout(Math.max(0, 1000 / FPS - (Date.now() - started)));
  }
}
const click = (name) => page.evaluate((n) => [...document.querySelectorAll('button')].find((b) => b.textContent === n)?.click(), name);

await film(6);
await page.evaluate(() => {
  const select = document.querySelector('select[aria-label=Senaryo]');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'misfire');
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
await film(4);
await click('Aracı durdur');
await page.waitForTimeout(2600);
await go(page, 'codes');
await page.getByTestId('dtc-P0301').waitFor();
await page.getByTestId('dtc-P0301').scrollIntoViewIfNeeded();
await film(5);
await demo.context.close();

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/f%04d.png`,
  '-vf', 'scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
  'docs/media/demo.gif',
]);

// Still pictures.
const home = await session({ width: 1280, height: 900 }, { scenario: 'misfire', theme: 'light' });
await home.page.waitForTimeout(3500);
await home.page.screenshot({ path: 'docs/media/home.png' });
await go(home.page, 'codes');
await home.page.getByText('1. silindirde ateşleme kaçağı').first().waitFor();
await home.page.waitForTimeout(800);
await home.page.screenshot({ path: 'docs/media/codes.png' });
await home.context.close();

const cockpit = await session({ width: 1180, height: 700 }, { scenario: 'highway', hmiTheme: 'night' });
await go(cockpit.page, 'hmi');
await cockpit.page.getByRole('button', { name: 'Sürüşü başlat' }).click();
await cockpit.page.addStyleTag({ content: HIDE });
await cockpit.page.waitForTimeout(4000);
await cockpit.page.screenshot({ path: 'docs/media/cockpit.png' });
await cockpit.context.close();

await browser.close();
console.log('frames', index);
