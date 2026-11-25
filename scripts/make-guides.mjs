// Takes the guide screenshots in both languages and renders the two PDF guides.
// Needs the preview server (pnpm --filter @pitwall/web preview) on :4173.
// Usage: PW_CHANNEL=msedge node scripts/make-guides.mjs
import { chromium } from '@playwright/test';
import { marked } from 'marked';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:4173/pitwall-car/#/';
const DIR = new URL('../docs/guide/', import.meta.url);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });

const LANGUAGES = {
  tr: {
    locale: 'tr-TR', simulator: 'Simülatörle dene', scenario: 'Senaryo', drive: 'Sürüşü başlat',
    fault: /1\. silindirde ateşleme kaçağı/, source: 'kullanim-kilavuzu.md', pdf: 'pitwall-car-kullanim-kilavuzu-tr.pdf',
  },
  en: {
    locale: 'en-GB', simulator: 'Try the simulator', scenario: 'Scenario', drive: 'Start driving',
    fault: /cylinder 1 misfire detected/i, source: 'user-guide.md', pdf: 'pitwall-car-user-guide-en.pdf',
  },
};

async function screenshots(language, text) {
  const out = new URL(`img/${language}/`, DIR);
  await mkdir(out, { recursive: true });
  const shot = (page, name) => page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, out)) });

  async function session(viewport, settings) {
    const context = await browser.newContext({ viewport, locale: text.locale, serviceWorkers: 'block' });
    await context.addInitScript(
      (value) => localStorage.setItem('pitwall-settings', value),
      JSON.stringify({ state: { safetyAccepted: true, language, ...settings }, version: 1 }),
    );
    const page = await context.newPage();
    await page.goto(BASE);
    await page.getByRole('button', { name: text.simulator }).click();
    await page.getByRole('combobox', { name: text.scenario }).waitFor();
    return { context, page };
  }

  const app = await session({ width: 1200, height: 800 }, { scenario: 'misfire' });
  await app.page.waitForTimeout(4000);
  await shot(app.page, 'home');
  await app.page.evaluate(() => (location.hash = '#/codes'));
  await app.page.getByTestId('dtc-P0301').getByText(text.fault).first().waitFor();
  await app.page.waitForTimeout(800);
  await shot(app.page, 'codes');
  await app.page.evaluate(() => (location.hash = '#/planner'));
  await app.page.locator('.maplibregl-canvas').waitFor();
  await app.page.waitForTimeout(5000);
  await shot(app.page, 'planner');
  await app.context.close();

  const cockpit = await session({ width: 1180, height: 700 }, { scenario: 'highway', hmiTheme: 'night' });
  await cockpit.page.evaluate(() => (location.hash = '#/hmi'));
  await cockpit.page.getByRole('button', { name: text.drive }).click();
  await cockpit.page.addStyleTag({ content: '[data-testid=hmi] footer { visibility: hidden }' });
  await cockpit.page.waitForTimeout(4000);
  await shot(cockpit.page, 'cockpit');
  await cockpit.context.close();
}

const dataUri = async (url, type) => `data:${type};base64,${(await readFile(url)).toString('base64')}`;

async function fontFaces() {
  const ranges = { latin: 'U+0000-00FF,U+0131,U+2000-22FF', 'latin-ext': 'U+0100-0130,U+0132-024F,U+1E00-1EFF' };
  const faces = await Promise.all(
    Object.entries(ranges).map(async ([subset, range]) => {
      const file = new URL(
        `../apps/web/node_modules/@fontsource-variable/manrope/files/manrope-${subset}-wght-normal.woff2`,
        import.meta.url,
      );
      return `@font-face{font-family:M;font-weight:200 800;src:url(${await dataUri(file, 'font/woff2')});unicode-range:${range}}`;
    }),
  );
  return faces.join('\n');
}

async function pdf(language, text) {
  let body = marked.parse(await readFile(new URL(text.source, DIR), 'utf8'));
  for (const [match, path] of body.matchAll(/src="(img\/[^"]+)"/g)) {
    body = body.replace(match, `src="${await dataUri(new URL(path, DIR), 'image/png')}"`);
  }
  const sticker = await dataUri(new URL('../docs/media/sticker.png', import.meta.url), 'image/png');
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><style>
    ${await fontFaces()}
    body{font-family:M,sans-serif;color:#15191d;font-size:10.5pt;line-height:1.55;margin:0}
    h1{font-size:24pt;margin:0 0 8pt}
    h1,h1+p{padding-right:96px}
    h2{font-size:15pt;color:#0b6b44;border-bottom:1.5pt solid #ddf0e6;padding-bottom:3pt;margin-top:18pt;break-after:avoid}
    h3{font-size:12pt;break-after:avoid}
    img{max-width:100%;border:1px solid #dee1e4;border-radius:8px;break-inside:avoid}
    table{border-collapse:collapse;width:100%;font-size:9.5pt;break-inside:avoid}
    th,td{border:1px solid #dee1e4;padding:4pt 6pt;text-align:left;vertical-align:top}
    th{background:#f5f6f7}
    pre{background:#f5f6f7;padding:8pt;border-radius:6px;white-space:pre-wrap;break-inside:avoid}
    code{font-family:Consolas,monospace;font-size:9.5pt}
    blockquote{margin:8pt 0;padding:6pt 10pt;background:#fcefcb;color:#7a4e00;border-radius:6px}
    a{color:#0b6b44}
    .sticker{position:absolute;top:0;right:0;width:80px;border:0}
  </style></head><body><img class="sticker" src="${sticker}" alt="">${body}</body></html>`;

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: fileURLToPath(new URL(text.pdf, DIR)),
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '15mm', right: '15mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#545b63;text-align:center">pitwall car · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  await page.close();
  console.log('wrote', text.pdf);
}

for (const [language, text] of Object.entries(LANGUAGES)) {
  await screenshots(language, text);
  await pdf(language, text);
}
await browser.close();
