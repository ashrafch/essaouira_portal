import { test, expect } from '@playwright/test';
import process from 'node:process';
import { APP_ROUTES } from '../src/routes/appRoutes.js';

// This suite deliberately creates synthetic business data. Never aim it at a site DB.
test.beforeAll(() => {
  if (process.env.E2E_DISPOSABLE !== 'true' || !process.env.E2E_BASE_URL) {
    throw new Error('Run against scripts/verify-production.py --keep only; set E2E_DISPOSABLE=true and E2E_BASE_URL.');
  }
});

test('production login, all route bundles, themes and booking document', async ({ page, request }, testInfo) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`);
  });
  const credentials = { username: 'verifier', password: 'Verification-only-local-password-2026', tenant_id: 'default' };
  const login = await request.post('/api/auth/login', { data: credentials });
  expect(login.ok()).toBeTruthy();
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` };
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  async function post(path, data) {
    const result = await request.post(`/api${path}`, { headers, data });
    expect(result.ok(), `${path}: ${await result.text()}`).toBeTruthy();
    return result.json();
  }
  const property = await post('/properties', { name: `QA ${suffix}`, code: suffix });
  await post('/setup/start', {});
  await post('/setup/units', { property_id: property.id, units: [`QA ${suffix}`] });
  const units = await (await request.get('/api/units', { headers })).json();
  const unit = units.find(row => row.name === `QA ${suffix}`);
  expect(unit).toBeTruthy();
  const booking = await post('/bookings', {
    unit_id: unit.id, guest_name: 'Synthetic QA Guest', checkin_date: '2027-01-01',
    checkout_date: '2027-01-03', nightly_rate: 100, source: 'direct',
  });
  const device = await post('/smart/devices', {
    unit_id: unit.id, external_id: suffix, name: 'QA light', provider: 'mock', category: 'smart_light',
  });

  await page.goto('/login');
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  await page.getByLabel('Username', { exact: true }).fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const paths = APP_ROUTES.map(route => route.path
    .replace(':unitId', String(unit.id)).replace(':deviceId', String(device.id))
    .replace(':bookingId', String(booking.id)));
  for (const theme of ['light', 'dark']) {
    for (const path of paths) {
      await page.goto(path);
      // Wait for lazy bundles and fetched data; a HTTP 200 alone is not a UI test.
      await page.waitForLoadState('networkidle');
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      const text = await page.locator('#root').innerText();
      expect(text.length, `${path} blank`).toBeGreaterThan(30);
      expect(text, path).not.toMatch(/Qualcosa.*andato storto|Cannot read properties|Pagina non trovata/i);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      expect(overflow, `${path} horizontal page overflow`).toBeFalsy();
      expect(failures, `${theme} ${path}`).toEqual([]);
      if (['/', '/bookings', '/operations', '/smart-link'].includes(path)) {
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${path.replaceAll('/', '') || 'home'}.png`), fullPage: true });
      }
    }
  }
  await page.goto(`/bookings/${booking.id}/document`);
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('button', { name: /Scarica PDF/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  expect(await download.failure()).toBeNull();
  expect(failures).toEqual([]);
});
