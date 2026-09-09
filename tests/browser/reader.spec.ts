import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`reader works without Vercel at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: string[] = [];
    const failed: string[] = [];
    page.on('request', request => requests.push(request.url()));
    page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    await page.route(/https?:\/\/[^/]*vercel[^/]*\//, route => route.abort());
    await page.route('https://splasky.disqus.com/embed.js', route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.DISQUS={reset:function(){}};'
    }));
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:4173/splasky/about/');
    await expect(page.locator('.about h1')).toContainText('About');
    expect((await page.goto('/'))?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText('Blog.');
    await page.screenshot({ path: testInfo.outputPath('archive.png'), fullPage: true });
    const links = await page.locator('.archive a').evaluateAll(elements => elements.map(el => el.getAttribute('href')!));
    // Empty blogs are supported; the real content build has articles.
    for (const href of links) {
      expect((await page.goto(href))?.status()).toBe(200);
      await expect(page.locator('.post-header h1')).toBeVisible();
      const title = await page.locator('.post-header h1').innerText();
      await expect(page).toHaveTitle(`${title} — splasky`);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', `${title} — splasky`);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://splasky.github.io${href}`);
      await expect(page.locator('.disqus-thread')).toHaveAttribute('data-shortname', 'splasky');
      await expect(page.locator('.disqus-thread')).toHaveAttribute('data-identifier', /^public-splasky-/);
      await expect(page.locator('.disqus-thread')).toHaveAttribute('data-url', `https://splasky.github.io${href}`);
      await expect(page.locator('.disqus-status')).toBeHidden();
      expect((await page.reload())?.status()).toBe(200);
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      expect(layout.scroll).toBeLessThanOrEqual(layout.width);
      const images = await page.locator('.prose img').evaluateAll(elements => elements.map(el => {
        const img = el as HTMLImageElement;
        return { src: img.src, loaded: img.complete && img.naturalWidth > 0 };
      }));
      expect(images.filter(img => !img.loaded)).toEqual([]);
      if (decodeURIComponent(href).includes('無心插柳')) await page.screenshot({ path: testInfo.outputPath('article.png'), fullPage: true });
      await page.getByRole('link', { name: '← 所有文章' }).click();
      await expect(page).toHaveURL('http://127.0.0.1:4173/');
    }
    expect(requests.filter(url => /https?:\/\/[^/]*vercel[^/]*\//.test(url))).toEqual([]);
    expect(failed).toEqual([]);
    expect((await page.goto('/splasky/blog/'))?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText('Blog.');
    expect((await page.goto('/404.html'))?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText('找不到這個頁面。');
  });
}
