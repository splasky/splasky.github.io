import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('Thoughts is reachable from the blog and renders every source entry without Vercel', async ({ page }) => {
  const info = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.route(/https?:\/\/[^/]*vercel[^/]*\//, route => route.abort());
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Thoughts', exact: true }).click({ timeout: 3000 });
  await expect(page).toHaveURL('http://127.0.0.1:4173/splasky/thoughts/');
  expect((await page.reload())?.status()).toBe(200);
  await expect(page.locator('.intro h1')).toHaveText('Thoughts.');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Thoughts', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.thought')).toHaveCount(info.thoughts);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(await page.locator('.thought img').evaluateAll(elements => elements.every(el => {
    const img = el as HTMLImageElement;
    return img.complete && img.naturalWidth > 0;
  }))).toBe(true);
  const dates = await page.locator('.thought time').evaluateAll(elements => elements.map(el => el.getAttribute('datetime')!));
  expect(dates).toEqual([...dates].sort().reverse());
  await page.screenshot({ path: 'test-results/thoughts-mobile.png' });
  if (info.thoughts > 0) {
    const href = await page.locator('.thought-permalink').first().getAttribute('href');
    await page.goto('/');
    expect((await page.goto(href!))?.status()).toBe(200);
    await expect(page).toHaveURL(`http://127.0.0.1:4173${href}`);
    await expect(page.locator('.thought').first()).toBeVisible();
  }
  expect(requests.filter(url => /https?:\/\/[^/]*vercel[^/]*\//.test(url))).toEqual([]);
});
