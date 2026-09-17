import { test, expect } from '@playwright/test';
import process from 'node:process';

test.beforeAll(() => {
  if (process.env.E2E_DISPOSABLE !== 'true' || !process.env.E2E_BASE_URL) throw new Error('Disposable QA stack required.');
});

test('crowded calendar stays bounded and every booking remains accessible', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill('verifier');
  await page.getByLabel('Password', { exact: true }).fill('Verification-only-local-password-2026');
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const units = Array.from({ length: 10 }, (_, i) => ({ id: 9000 + i, name: `Appartamento terrazza vista piscina ${i + 1} con denominazione molto lunga`, property_id: 1 }));
  const bookings = units.map((unit, i) => ({ id: unit.id, unit_id: unit.id, guest_name: `Ospite ${i + 1} Cognomemoltolungosenzaalcunospazioabcdefghijk`, checkin_date: `${month}-15`, checkout_date: `${month}-17`, source: ['direct', 'airbnb', 'booking'][i % 3], status: 'confirmed', nightly_rate: 90, notes: '' }));
  bookings.push({ ...bookings[0], id: 9999, guest_name: 'Cancellata non occupa', status: 'cancelled', checkout_date: `${month}-20` });
  await page.route('**/api/units', route => route.fulfill({ json: units }));
  await page.route('**/api/bookings', route => route.fulfill({ json: bookings }));
  // Keep this layout test independent of real property tariffs and writes.
  await page.route('**/api/revenue/**', route => route.fulfill({ json: { days: [] } }));
  await page.goto('/calendar');
  await expect(page.getByText('Caricamento calendario...')).not.toBeVisible();
  await expect(page.getByText('Cancellata non occupa')).toHaveCount(0);

  const mobile = testInfo.project.name === 'mobile';
  const cell = page.locator(`.occupancy-day[data-date="${month}-15"]`);
  for (const width of mobile ? [390, 320] : [1440, 1100, 820]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.addStyleTag({ content: '*,*::before,*::after { transition: none !important; }' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBeTruthy();
      if (!mobile) {
        await expect(cell.locator('.occupancy-booking')).toHaveCount(3);
        await expect(cell.getByRole('button', { name: /Altre 7 prenotazioni/ })).toBeVisible();
        const sizes = await page.locator('.occupancy-day').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
        expect(new Set(sizes).size).toBe(1);
        expect(sizes[0]).toBe(160);
        expect(await cell.locator('.occupancy-booking').first().evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBeTruthy();
        const preview = cell.locator('.occupancy-booking').first();
        await page.mouse.move(0, 0);
        const background = await preview.evaluate(node => getComputedStyle(node).backgroundColor);
        await preview.hover();
        expect(await preview.evaluate(node => getComputedStyle(node).backgroundColor)).toBe(background);
      } else {
        await expect(page.locator('.occupancy-agenda button')).toHaveCount(10);
      }
      await page.screenshot({ path: testInfo.outputPath(`calendar-${width}-${theme}.png`), fullPage: true });
    }
  }

  if (!mobile) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const more = cell.getByRole('button', { name: /Altre 7 prenotazioni/ });
    await more.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('listitem')).toHaveCount(10);
    await expect(dialog.getByRole('button', { name: 'Nuova prenotazione', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('calendar-day-detail.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(more).toBeFocused();

    const moved = { ...bookings[0], checkin_date: `${month}-20`, checkout_date: `${month}-22` };
    await page.route(`**/api/bookings/${moved.id}`, async route => {
      expect(route.request().method()).toBe('PUT');
      expect(route.request().postDataJSON()).toMatchObject({ checkin_date: moved.checkin_date, checkout_date: moved.checkout_date });
      await route.fulfill({ json: moved });
    });
    await cell.locator('.occupancy-booking').first().dragTo(page.locator(`.occupancy-day[data-date="${month}-20"]`));
    await expect(page.locator(`.occupancy-day[data-date="${month}-20"] .occupancy-booking`)).toHaveCount(1);
    await expect(cell.getByRole('button', { name: /Altre 6 prenotazioni/ })).toBeVisible();
    await cell.getByRole('button', { name: /Altre 6 prenotazioni/ }).click();
    await dialog.getByRole('button', { name: /Ospite 10 / }).click();
  } else {
    await page.locator('.occupancy-agenda button').last().click();
  }
  await expect(page).toHaveURL(/bookings\?booking_id=9009/);
  await expect(page.getByRole('dialog').getByLabel('Nome e Cognome')).toHaveValue(bookings[9].guest_name);
  if (!mobile) {
    await page.goto('/calendar');
    await page.locator(`.occupancy-day[data-date="${month}-20"]`).getByRole('button', { name: /Nuova prenotazione/ }).click();
    await expect(page.getByRole('dialog').getByLabel('Check-in', { exact: true })).toHaveValue(`${month}-20`);
    await expect(page.getByRole('dialog').getByLabel('Appartamento')).toHaveValue('9000');
  }
  expect(errors).toEqual([]);
});
