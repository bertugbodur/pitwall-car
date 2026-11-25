/** End to end through the simulator. External services are replaced by local fakes. */
import { expect, test, type Page } from '@playwright/test';

/** A map style with no external tiles, so tests need no network. */
const STYLE = {
  version: 8,
  sources: {
    osm: { type: 'geojson', data: { type: 'Point', coordinates: [32, 39] }, attribution: '© OpenStreetMap' },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#dde' } },
    { id: 'dot', type: 'circle', source: 'osm' },
  ],
};

async function open(page: Page, hash = '', patch: Record<string, unknown> = {}) {
  const settings = { state: { safetyAccepted: true, language: 'tr', scenario: 'city', ...patch }, version: 1 };
  await page.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ json: STYLE }));
  await page.addInitScript((value) => {
    if (!localStorage.getItem('pitwall-settings')) localStorage.setItem('pitwall-settings', value);
  }, JSON.stringify(settings));
  await page.goto(`./#/${hash}`);
}

async function connectSimulator(page: Page) {
  await page.getByRole('button', { name: 'Simülatörle dene' }).click();
  await expect(page.getByRole('combobox', { name: 'Senaryo' })).toBeVisible();
}

const go = (page: Page, link: string) => page.getByRole('navigation').getByRole('link', { name: link }).click();

const frameRate = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const step = () => {
          frames++;
          const elapsed = performance.now() - start;
          if (elapsed < 2000) requestAnimationFrame(step);
          else resolve((frames * 1000) / elapsed);
        };
        requestAnimationFrame(step);
      }),
  );

test('first visit shows the safety warning', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('alertdialog')).toContainText('Sürerken telefonla etkileşime girme');
  await page.getByRole('button', { name: 'Anladım' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('a browser without adapter APIs is told what to use', async ({ page }) => {
  await page.addInitScript(() => {
    delete (Navigator.prototype as any).serial;
    delete (Navigator.prototype as any).bluetooth;
  });
  await open(page);
  await expect(page.getByText('Chrome veya Edge kullan')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bluetooth LE' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Simülatörle dene' })).toBeEnabled();
});

test('connect, live gauges and smooth drawing', async ({ page }) => {
  await open(page, 'live');
  await connectSimulator(page);
  await expect(page.getByRole('img', { name: /Devir: 8\d\d rpm/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Motor suyu: (88|89|90|91|92) °C/ })).toBeVisible();
  expect(await frameRate(page)).toBeGreaterThan(50);
});

test('misfire: Turkish offline explanation, readiness and an AI answer', async ({ page }) => {
  let sent = '';
  await page.route('http://localhost:11434/api/tags', (route) => route.fulfill({ json: { models: [{ name: 'fake' }] } }));
  await page.route('http://localhost:11434/api/chat', (route) => {
    sent = route.request().postData() ?? '';
    return route.fulfill({ json: { message: { content: 'URGENCY: soon\nBujileri kontrol ettir.' } } });
  });
  await open(page, 'codes', { scenario: 'misfire' });
  await connectSimulator(page);

  const card = page.getByTestId('dtc-P0301');
  await expect(card).toContainText('1. silindirde ateşleme kaçağı');
  await expect(card).toContainText('teşhis değildir');
  await expect(page.getByText('Arıza anındaki değerler')).toBeVisible();
  await expect(page.getByText('Arıza lambası yanıyor')).toBeVisible();

  await card.getByRole('button', { name: 'Yapay zekâ ile açıkla' }).click();
  await expect(card.getByTestId('ask-ai')).toContainText('P0301');
  expect(sent).toBe('');
  await card.getByRole('button', { name: 'Gönder' }).click();
  await expect(card).toContainText('Bujileri kontrol ettir.');
  await expect(card).toContainText('Yakında servise git');
  expect(sent).toContain('P0301');
  expect(sent).not.toContain('NM0PW000000000001');
});

test('overheating raises a red warning', async ({ page }) => {
  await open(page, '', { scenario: 'overheat' });
  await connectSimulator(page);
  await expect(page.getByTestId('alert-newCode')).toContainText('P0217');
  await go(page, 'Arızalar');
  await expect(page.getByTestId('dtc-P0217')).toContainText('güvenli bir yerde durdur');
});

test('drive lock: menus and text entry disappear above 5 km/h', async ({ page }) => {
  await open(page, 'settings', { scenario: 'highway' });
  await expect(page.locator('input').first()).toBeVisible();
  await go(page, 'Ana sayfa');
  await connectSimulator(page);
  await page.getByRole('button', { name: 'Sürüşü başlat' }).click();

  await expect(page.getByTestId('driving-lock')).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.locator('input, select, textarea')).toHaveCount(0);
  // Typing the address of a page does not get around the lock.
  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(page.getByTestId('driving-lock')).toBeVisible();
  await expect(page.locator('input, select, textarea')).toHaveCount(0);

  await page.getByRole('button', { name: 'Simülatörde aracı durdur' }).click();
  await expect(page.getByTestId('driving-lock')).toHaveCount(0);
  await expect(page.locator('input').first()).toBeVisible();
});

test('cockpit mode fits a tablet and hides its controls while driving', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await open(page, 'hmi', { scenario: 'highway', hmiTheme: 'night' });
  await connectSimulator(page);
  const cockpit = page.getByTestId('hmi');
  await expect(cockpit).toHaveAttribute('data-theme', 'dark');
  for (const layout of ['Minimal', 'Yolculuk', 'Klasik']) {
    await page.getByRole('button', { name: layout }).click();
    await expect(page.getByRole('button', { name: layout })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
  }
  await page.getByRole('button', { name: 'Sürüşü başlat' }).click();
  await expect(page.getByRole('button', { name: 'Minimal' })).toHaveCount(0);
  await expect(page.getByRole('img', { name: /Hız: 1\d\d km\/h/ })).toBeVisible();
  expect(await frameRate(page)).toBeGreaterThan(50);
});

test('a drive is recorded and listed without a position', async ({ page }) => {
  await open(page, '', { scenario: 'highway' });
  await connectSimulator(page);
  await page.getByRole('button', { name: 'Sürüşü başlat' }).click();
  await page.waitForTimeout(8000);
  await page.getByRole('button', { name: 'Simülatörde aracı durdur' }).click();
  await page.getByRole('button', { name: 'Bağlantıyı kes' }).click();
  await go(page, 'Yolculuk');
  await expect(page.getByText('Mesafe', { exact: true })).toBeVisible();
  await expect(page.getByText('L/100 km').first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'Kaydedilen iz' })).toHaveCount(0);
});

test('planner: the map opens without any key', async ({ page }) => {
  await open(page, 'planner');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Planla' })).toBeDisabled();
});

test('planner: Istanbul to Ankara with charging stops (services faked)', async ({ page }) => {
  // A straight 450 km line from Istanbul to Ankara.
  const line = Array.from({ length: 101 }, (_, i) => [28.98 + (i * 3.87) / 100, 41.01 - (i * 1.08) / 100, 100]);
  const keys: string[] = [];
  await page.route('https://api.heigit.org/pelias/**', (route) => {
    const text = new URL(route.request().url()).searchParams.get('text')!;
    const point = text === 'İstanbul' ? [28.98, 41.01] : [32.85, 39.93];
    return route.fulfill({ json: { features: [{ geometry: { coordinates: point }, properties: { label: text } }] } });
  });
  await page.route('https://api.heigit.org/openrouteservice/**', (route) => {
    keys.push(route.request().headers().authorization ?? '');
    const summary = { distance: 450_000, duration: 16_200 };
    return route.fulfill({ json: { features: [{ properties: { summary }, geometry: { coordinates: line } }] } });
  });
  await page.route('https://api.openchargemap.io/**', (route) =>
    route.fulfill({
      json: [20, 45, 60, 80].map((i) => ({
        AddressInfo: { Title: `Şarj ${i}`, Longitude: line[i]![0], Latitude: line[i]![1] },
        Connections: [{ PowerKW: 120 }],
        DataProvider: { Title: 'Open Charge Map', License: 'CC BY 4.0' },
      })),
    }),
  );
  const ev = { usableKwh: 60, consumptionWhKm: 190, maxDcKw: 150 };
  await open(page, 'planner', {
    routeKey: 'test-route-key',
    chargeKey: 'test-charge-key',
    profile: { name: '', fuel: 'ev', body: 'suv', makeModelYear: '', ev },
  });
  await page.getByLabel('Nereden').fill('İstanbul');
  await page.getByLabel('Nereye').fill('Ankara');
  await page.getByRole('button', { name: 'Planla' }).click();
  await expect(page.getByTestId('route-summary')).toContainText('450 km');
  await expect(page.getByTestId('charge-stops')).toContainText('Şarj ');
  await expect(page.getByText('Open Charge Map (CC BY 4.0)')).toBeVisible();
  expect(keys).toEqual(['test-route-key']);
});
