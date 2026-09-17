import { test, expect } from '@playwright/test';
import process from 'node:process';

test.beforeAll(() => {
  if (process.env.E2E_DISPOSABLE !== 'true' || !process.env.E2E_BASE_URL) throw new Error('Disposable QA stack required.');
});
const credentials = { username: 'verifier', password: 'Verification-only-local-password-2026', tenant_id: 'default' };
async function login(page) {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}
async function assertFits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBeTruthy();
}

test('daily workflow, dated links, filters, edit, create and monthly report', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const session = await request.post('/api/auth/login', { data: credentials });
  expect(session.ok()).toBeTruthy();
  const headers = { Authorization: `Bearer ${(await session.json()).access_token}` };
  async function post(path, data) {
    const response = await request.post(`/api${path}`, { data, headers });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  const summary = await (await request.get('/api/dashboard/summary', { headers })).json();
  const today = summary.date;
  const day = offset => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const property = await post('/properties', { name: 'QA Workbench', code: suffix });
  await post('/setup/start', {});
  const unitName = `Terrazza ${suffix}`;
  await post('/setup/units', { property_id: property.id, units: [unitName] });
  const units = await (await request.get('/api/units', { headers })).json();
  const unit = units.find(row => row.name === unitName);
  const guest = `Sara ${suffix}`;
  const departure = `Luca ${suffix}`;
  const arrival = await post('/bookings', { unit_id: unit.id, guest_name: guest, checkin_date: today, checkout_date: day(2), nightly_rate: 90, estimated_arrival_time: '16:30', source: 'direct' });
  await post('/bookings', { unit_id: unit.id, guest_name: departure, checkin_date: day(-2), checkout_date: today, nightly_rate: 100, source: 'direct' });
  await post('/bookings', { unit_id: unit.id, guest_name: `Cancelled ${suffix}`, checkin_date: day(10), checkout_date: day(12), status: 'cancelled', source: 'direct' });

  await login(page);
  const agenda = page.getByRole('region', { name: 'Agenda ospiti' });
  await expect(agenda.getByText(guest, { exact: true })).toBeVisible();
  await page.getByLabel('Cerca in agenda').fill(suffix);
  await page.getByRole('button', { name: 'Aggiorna dashboard' }).click();
  await expect(page.getByRole('button', { name: 'Aggiorna dashboard' })).toBeEnabled();
  await expect(page.getByLabel('Cerca in agenda')).toHaveValue(suffix);
  await page.getByRole('tab', { name: 'Partenze', exact: true }).click();
  await expect(agenda.getByText(departure, { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Arrivi', exact: true }).click();

  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await page.addStyleTag({ content: '*,*::before,*::after { transition: none !important; }' });
    await assertFits(page);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-daily.png`), fullPage: true });
  }
  await agenda.getByRole('link', { name: new RegExp(guest) }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName(`Modifica prenotazione #${arrival.id}`);
  await expect(dialog.getByLabel('Nome e Cognome')).toHaveValue(guest);
  await dialog.getByLabel('Note interne').fill('QA updated through dashboard');
  await dialog.getByRole('button', { name: 'Salva modifiche' }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await (await request.get('/api/bookings', { headers })).json();
  expect(saved.find(row => row.id === arrival.id).notes).toBe('QA updated through dashboard');

  await page.goto('/');
  await page.getByRole('main').getByRole('link', { name: /^Arrivi\s/ }).click();
  await expect(page.getByLabel('Vista prenotazioni')).toHaveValue('arrivals');
  await expect(page.getByLabel('Data operativa')).toHaveValue(today);
  await page.getByLabel('Cerca prenotazioni').fill(suffix);
  await expect(page.getByRole('cell', { name: new RegExp(guest) })).toBeVisible();
  await expect(page.getByRole('cell', { name: new RegExp(departure) })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Vista prenotazioni')).toHaveValue('arrivals');
  await page.getByRole('button', { name: 'Azzera filtri' }).click();
  await page.getByLabel('Vista prenotazioni').selectOption('cancelled');
  await page.getByLabel('Cerca prenotazioni').fill(suffix);
  await expect(page.getByRole('cell', { name: /Cancellata$/ })).toBeVisible();
  await page.getByLabel('Filtra per pagamento').selectOption('unpaid');
  await expect(page.getByText('Nessuna prenotazione per i filtri selezionati.')).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: 'Nuova prenotazione' }).click();
  await expect(dialog.getByLabel('Check-in', { exact: true })).toHaveValue(today);
  await dialog.getByLabel('Appartamento').selectOption(String(unit.id));
  await dialog.getByLabel('Nome e Cognome').fill(`Replacement ${suffix}`);
  await dialog.getByLabel('Check-in', { exact: true }).fill(day(10));
  await dialog.getByLabel('Check-out', { exact: true }).fill(day(12));
  await expect(dialog.getByText(/Attenzione: questa/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Crea prenotazione' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Cerca prenotazioni').fill(`Replacement ${suffix}`);
  await expect(page.getByRole('cell', { name: new RegExp(`Replacement ${suffix}`) })).toBeVisible();

  await page.goto('/?view=performance');
  await expect(page.getByText('Caricamento andamento...')).not.toBeVisible();
  await expect(page.locator('.recharts-pie')).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await page.addStyleTag({ content: '*,*::before,*::after { transition: none !important; }' });
    await assertFits(page);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-performance.png`), fullPage: true });
  }
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica report' }).click();
  expect((await download).suggestedFilename()).toMatch(/report_\d{4}-\d{2}\.csv/);
  await page.getByLabel('Mese del rendiconto').fill(`${Number(today.slice(0, 4)) + 5}-02`);
  await expect(page.getByText('Nessun ricavo nel mese.')).toBeVisible();
  await assertFits(page);
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await assertFits(page);
    await page.screenshot({ path: testInfo.outputPath('narrow-daily.png'), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('partial failures are visible and refresh recovers without dropping search', async ({ page }, testInfo) => {
  await login(page);
  await page.route('**/api/dashboard/summary', route => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/bookings', route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('riepilogo, prenotazioni');
  await expect(page.getByText('Agenda non disponibile.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /^Arrivi/ })).toContainText('N/D');
  await page.getByLabel('Cerca in agenda').fill('nobody-matches');
  await page.screenshot({ path: testInfo.outputPath('partial-failure.png'), fullPage: true });
  await page.unroute('**/api/dashboard/summary');
  await page.unroute('**/api/bookings');
  await page.getByRole('button', { name: 'Aggiorna dashboard' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Cerca in agenda')).toHaveValue('nobody-matches');
  await expect(page.getByText('Nessun ospite corrisponde alla ricerca.')).toBeVisible();
});
