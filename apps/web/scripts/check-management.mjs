// Read-only acceptance check for the fresh six-apartment workspace, never an E2E seed.
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const config = JSON.parse(await readFile(new URL('../../../.env.management.json', import.meta.url), 'utf8'));
if (!/^\d+$/.test(config.WEB_PORT)) throw new Error('Invalid local management port.');
const base = `http://127.0.0.1:${config.WEB_PORT}`;
const output = new URL('../test-results/management/', import.meta.url);
await mkdir(output, { recursive: true });
const expectedUnits = Array.from({ length: 6 }, (_, i) => `Appartamento A${i + 1}`);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method()) && !request.url().endsWith('/auth/login')) {
      errors.push(`Unexpected write blocked: ${request.method()} ${new URL(request.url()).pathname}`);
      await route.abort();
    } else await route.continue();
  });
  await page.goto(base + '/login');
  await page.getByLabel('Username', { exact: true }).fill(config.ADMIN_USERNAME);
  await page.getByLabel('Password', { exact: true }).fill(config.ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page).toHaveURL(base + '/');
  await page.goto(base + '/bookings?new_booking=1&date=2030-02-01');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const options = dialog.getByLabel('Appartamento').locator('option');
  await expect(options).toHaveCount(7);
  expect((await options.allTextContents()).slice(1)).toEqual(expectedUnits);
  const free = dialog.getByText('Libere:', { exact: true }).locator('..');
  await expect(free.locator('span')).toHaveCount(7);
  expect(await free.innerText()).not.toMatch(/QA|Concurrency|Terrazza/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(free).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBeTruthy();
    await page.screenshot({ path: fileURLToPath(new URL(`free-${width}.png`, output)), fullPage: true });
  }
  await dialog.getByRole('button', { name: 'Annulla' }).click();
  await page.goto(base + '/calendar');
  const timelineOptions = page.getByLabel('Appartamento della timeline').locator('option');
  await expect(timelineOptions).toHaveCount(6);
  expect(await timelineOptions.allTextContents()).toEqual(expectedUnits);
  expect(errors).toEqual([]);
  console.log('PASS: six selectable/free apartments on desktop/mobile, six timeline options, no writes or JS errors.');
} finally {
  await browser.close();
}
