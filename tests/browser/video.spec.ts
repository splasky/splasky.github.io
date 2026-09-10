import { expect, test } from '@playwright/test';

test('video cards create players only after an explicit click', async ({ page }) => {
  const thirdPartyRequests: string[] = [];
  page.on('request', request => {
    if (/youtube-nocookie|drive\.google|ipfs\.io/.test(request.url())) thirdPartyRequests.push(request.url());
  });
  await page.setContent(`<div class="video-embed" data-video-kind="youtube" data-embed-url="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" data-original-url="https://youtu.be/dQw4w9WgXcQ"><button class="video-embed-load" type="button" aria-label="載入 YouTube 影片"></button></div>`);
  await page.addStyleTag({ path: 'styles/site.css' });
  await page.addScriptTag({ path: 'scripts/video-embed.js' });

  await expect(page.locator('iframe, video')).toHaveCount(0);
  await expect(page.locator('.video-embed-load')).toHaveText('');
  expect(thirdPartyRequests).toEqual([]);
  const before = await page.locator('.video-embed').boundingBox();
  await page.locator('.video-embed-load').press('Enter');
  await expect(page.locator('iframe')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', /allow-scripts/);
  const after = await page.locator('.video-embed').boundingBox();
  expect(Math.abs((before?.height ?? 0) - (after?.height ?? 0))).toBeLessThan(1);
});
