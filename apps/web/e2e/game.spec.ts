import { expect, test } from '@playwright/test';
import { ORGANIZER_TOKEN } from '../playwright.config';

const API = 'http://localhost:8092';
const org = { 'x-organizer-token': ORGANIZER_TOKEN };

test('walk-up check-in in the 3D game earns XP from the real API', async ({ page, request }) => {
  await request.post(`${API}/api/organizer/status`, { headers: org, data: { status: 'live' } });
  await request.post(`${API}/api/organizer/schedule-shrink`, { headers: org, data: { inSeconds: 600, factor: 0.6 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/?demo=booth');
  await expect(page.locator('.hud-zone')).toContainText(/Round 1 · 16 booths in the zone · ⏱ shrinks in \d+:\d\d/);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 20_000 });

  // Chat for DWELL_SECONDS, then answer with the booth's real tagline.
  await expect(dialog.locator('.hud-dialog__quiz')).toBeVisible({ timeout: 15_000 });
  const pitch = (await dialog.locator('.hud-dialog__pitch').innerText()).replace(/[“”]/g, '').trim();
  await dialog.getByRole('button', { name: pitch }).click();
  await expect(page.locator('.hud-toast').first()).toContainText('+10 XP');

  const lb = await (await request.get(`${API}/api/leaderboard`)).json();
  expect(lb.entries[0]).toMatchObject({ name: 'Alex', xp: 10, booths: 1 });
  expect(errors).toEqual([]);
});

test('booths in the storm pay nothing and say so', async ({ page, request }) => {
  // Shrink the circle onto the stage, away from every booth.
  await request.put(`${API}/api/organizer/circle`, { headers: org, data: { center: [0, -40], radius: 6 } });
  await page.goto('/?demo=booth');
  await expect(page.locator('.hud-zone')).toContainText('0 booths in the zone');
});

test('falls back to the offline demo when there is no API', async ({ page }) => {
  await page.goto('/?offline&enter=1');
  await page.locator('.app-drawer__toggle').click();
  await expect(page.locator('.app-drawer__mode')).toContainText('Offline demo');
});
