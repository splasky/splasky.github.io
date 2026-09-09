import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { assetResolver, postPath, readPosts, renderPost, rewriteLink, safeFile, type Post } from '../scripts/content.ts';
import { validateSite } from '../scripts/validate.ts';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'splasky-test-'));
  const source = path.join(root, 'source');
  const output = path.join(root, 'output');
  await mkdir(path.join(source, 'content/blog'), { recursive: true });
  await mkdir(output);
  return { root, source, output, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('articles: add, edit, delete, Unicode IDs and invalid metadata', async () => {
  const f = await fixture();
  try {
    const file = path.join(f.source, 'content/blog/中文 # &.md');
    await writeFile(file, '---\ntitle: First\ndate: 2026-01-01\n---\nHello');
    assert.equal((await readPosts(f.source))[0].title, 'First');
    assert.equal(postPath('中文 # &'), '/splasky/blog/%E4%B8%AD%E6%96%87%20%23%20%26/');
    await writeFile(file, '---\ntitle: Revised\ndate: 2026-01-01\n---\nChanged');
    assert.equal((await readPosts(f.source))[0].title, 'Revised');
    await writeFile(file, '---\ntitle: Bad\ndate: not-a-date\n---\n');
    await assert.rejects(readPosts(f.source), /title\/date/);
    await rm(file);
    assert.deepEqual(await readPosts(f.source), []);
  } finally { await f.cleanup(); }
});

test('rewrites only navigation, with Unicode, query and fragments', () => {
  const ids = new Set(['中文', 'a']);
  assert.equal(rewriteLink('https://tinymind-alpha.vercel.app/splasky/blog/中文?q=1#section', 'a', ids), `${postPath('中文')}?q=1#section`);
  assert.equal(rewriteLink('./中文.md#section', 'a', ids), `${postPath('中文')}#section`);
  assert.equal(rewriteLink('https://tinymind.me/splasky/blog', 'a', ids), '/');
  assert.equal(rewriteLink('https://example.com/', 'a', ids), 'https://example.com/');
  assert.throws(() => rewriteLink('/splasky/blog/missing', 'a', ids), /Broken article/);
  assert.throws(() => rewriteLink('https://tinymind-alpha.vercel.app/login', 'a', ids), /Unmapped/);
});

test('mirrors repo images and renders math, code, tables and reference images without scripts', async () => {
  const f = await fixture();
  try {
    await mkdir(path.join(f.source, 'assets/images'), { recursive: true });
    await writeFile(path.join(f.source, 'assets/images/test.png'), 'image-fixture');
    const post: Post = { id: 'a', title: 'A', date: '2026-01-01T00:00:00Z', html: '', description: '', markdown: `![image][pic]\n\n[pic]: https://raw.githubusercontent.com/splasky/tinymind-blog/main/assets/images/test.png\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n$x^2$\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\n\`https://tinymind-alpha.vercel.app/splasky/blog\`` };
    await renderPost(post, new Set(['a']), assetResolver(f.source, f.output));
    assert.match(post.html, /src="\/assets\/content\//);
    assert.match(post.html, /<table>/);
    assert.match(post.html, /class="katex"/);
    assert.match(post.html, /hljs/);
    assert.doesNotMatch(post.html, /<script|href="javascript:/);
    assert.match(post.html, /https:\/\/tinymind-alpha.vercel.app/); // Preserve literal code examples.
    assert.equal(await readFile(path.join(f.output, post.image!), 'utf8'), 'image-fixture');
    await assert.rejects(assetResolver(f.source, f.output)('/assets/missing.png', 'a'), /ENOENT/);
  } finally { await f.cleanup(); }
});

test('rejects asset traversal and symlinks outside article checkout', async () => {
  const f = await fixture();
  try {
    await writeFile(path.join(f.root, 'private'), 'not-an-asset');
    await symlink(path.join(f.root, 'private'), path.join(f.source, 'linked'));
    await assert.rejects(safeFile(f.source, '../private'), /escapes/);
    await assert.rejects(safeFile(f.source, 'linked'), /escapes/);
  } finally { await f.cleanup(); }
});

test('mirrors Vercel image bytes; fails on unavailable origin instead of publishing a remote URL', async () => {
  const f = await fixture();
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('png', { headers: { 'content-type': 'image/png' } });
    const src = await assetResolver(f.source, f.output)('https://test.vercel.app/image', 'a');
    assert.match(src, /^\/assets\/content\/.+\.png$/);
    globalThis.fetch = async () => new Response('missing', { status: 404 });
    await assert.rejects(assetResolver(f.source, f.output)('https://test.vercel.app/missing', 'a'), /404/);
  } finally { globalThis.fetch = original; await f.cleanup(); }
});

test('output validation rejects Vercel resources and broken links but permits literal prose', async () => {
  const f = await fixture();
  try {
    const file = path.join(f.output, 'index.html');
    await writeFile(file, '<p>https://example.vercel.app</p>');
    await validateSite(f.output);
    await writeFile(file, '<img src="https://example.vercel.app/a.png">');
    await assert.rejects(validateSite(f.output), /Vercel dependency/);
    await writeFile(file, '<a href="/missing/">Missing</a>');
    await assert.rejects(validateSite(f.output), /Broken local link/);
    await writeFile(file, '<script src="/a.js"></script>');
    await assert.rejects(validateSite(f.output), /active content/);
  } finally { await f.cleanup(); }
});
