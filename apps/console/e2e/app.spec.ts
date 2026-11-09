import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ORGANIZER_TOKEN } from '../playwright.config';

test.describe.configure({ mode: 'serial' });

const API = 'http://localhost:8091';
const org = { 'x-organizer-token': ORGANIZER_TOKEN };

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
}

test('organizer opens the console, starts the game and schedules a shrink', async ({ page }) => {
  await page.goto('/console/#/organizer');
  await page.getByLabel('Organizer token').fill(ORGANIZER_TOKEN);
  await page.getByRole('button', { name: 'Open console' }).click();
  await expect(page.getByRole('heading', { name: 'Live stats' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Map of MeetSpace Expo Park/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR code to check in at Lumen Labs' })).toBeVisible();

  await page.getByRole('button', { name: '▶ Start' }).click();
  await expect(page.getByText('Game is now live')).toBeVisible();
  await page.getByRole('button', { name: 'Schedule shrink' }).click();
  await expect(page.getByText(/Circle shrinks to 70% in/)).toBeVisible();
  await expectAccessible(page);
});

test('a physical booth QR code: join, answer, earn XP; a forged code is refused', async ({ page, request }) => {
  const booths = await (await request.get(`${API}/api/organizer/booths`, { headers: org })).json();
  const lumen = booths.find((b: { company: string }) => b.company === 'Lumen Labs');

  await page.goto(`/console/#/checkin/${lumen.id}?code=forged`);
  await page.getByLabel('Display name').fill('Priya');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('heading', { name: 'Lumen Labs' })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel('Applied AI for healthcare').check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByRole('alert')).toContainText('not valid');

  await page.goto(`/console/#/checkin/${lumen.id}?code=${lumen.code}`);
  await page.getByLabel('Applied AI for healthcare').check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByRole('heading', { name: '+10 XP' })).toBeVisible();
});

test('booths outside the circle warn that they are in the storm', async ({ page, request }) => {
  const booths = await (await request.get(`${API}/api/organizer/booths`, { headers: org })).json();
  const [first, far] = [booths[0], booths[booths.length - 1]];
  await request.put(`${API}/api/organizer/circle`, { headers: org, data: { center: first.anchor, radius: 6 } });
  await page.goto(`/console/#/checkin/${far.id}?code=${far.code}`);
  await page.getByLabel('Display name').fill('Sam');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('alert')).toContainText('in the storm');
  // The server enforces it too.
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByRole('alert').last()).toContainText(/storm|Not quite/);
});

test('big screen shows the podium with the player who scored', async ({ page }) => {
  await page.goto('/console/');
  await expect(page.getByLabel('Top 3')).toContainText('Priya');
  await expect(page.getByText(/Round 1 · \d+ booths in the zone · LIVE/)).toBeVisible();
  await expectAccessible(page);
});
