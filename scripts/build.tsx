import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { aboutPath, assetResolver, blogPath, postPath, readAbout, readPosts, readThoughts, renderPost, site, siteName, username, repo, contentBranch, disqusShortname, thoughtAnchor, thoughtPath, thoughtsPath, type Post } from './content.ts';
import { validateSite } from './validate.ts';
import { buildFeed } from './feed.ts';

const source = path.resolve(process.env.CONTENT_DIR ?? '.content');
const output = path.resolve('dist');
const posts = await readPosts(source);
const thoughts = await readThoughts(source);
const about = await readAbout(source);
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'assets'), { recursive: true });
const asset = assetResolver(source, output);
const ids = new Set(posts.map(p => p.id));
for (const post of posts) await renderPost(post, ids, asset);
for (const thought of thoughts) {
  await renderPost(thought, ids, asset);
  if (thought.attachment) thought.attachment = await asset(thought.attachment, thought.id);
}
if (about) await renderPost(about, ids, asset);
await cp('styles/site.css', path.join(output, 'assets/site.css'));
await cp('node_modules/katex/dist/katex.min.css', path.join(output, 'assets/katex.min.css'));
await cp('node_modules/katex/dist/fonts', path.join(output, 'assets/fonts'), { recursive: true });
await cp('node_modules/highlight.js/styles/github-dark.min.css', path.join(output, 'assets/highlight.css'));
await cp('scripts/disqus.js', path.join(output, 'assets/disqus.js'));

function Layout({ title, description, canonical, post, children, noindex = false, section = 'blog' }: {
  title: string; description: string; canonical: string; post?: Post; children: React.ReactNode; noindex?: boolean; section?: 'blog' | 'thoughts' | 'about';
}) {
  return <html lang="zh-Hant"><head>
    <meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title><meta name="description" content={description} /><link rel="canonical" href={canonical} />
    {noindex && <meta name="robots" content="noindex" />}
    <meta property="og:title" content={title} /><meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} /><meta property="og:site_name" content={siteName} />
    <meta property="og:type" content={post ? 'article' : 'website'} />
    <meta name="twitter:card" content={post?.image ? 'summary_large_image' : 'summary'} />
    <meta name="twitter:title" content={title} /><meta name="twitter:description" content={description} />
    {post?.image && <><meta property="og:image" content={new URL(post.image, site).href} /><meta name="twitter:image" content={new URL(post.image, site).href} /></>}
    {post && <meta property="article:published_time" content={post.date} />}
    <link rel="alternate" type="application/rss+xml" title="splasky — Blog" href="/feed.xml" />
    <link rel="stylesheet" href="/assets/site.css" /><link rel="stylesheet" href="/assets/highlight.css" />
    <link rel="stylesheet" href="/assets/katex.min.css" />
  </head><body>
    <a className="skip-link" href="#main">跳至內容</a>
    <header className="site-header"><a className="brand" href="/">{siteName}<span className="brand-dot">.</span></a>
      <nav aria-label="主選單"><a href="/" aria-current={section === 'blog' && !post && !noindex ? 'page' : undefined}>Blog</a><a href={thoughtsPath} aria-current={section === 'thoughts' ? 'page' : undefined}>Thoughts</a><a href={aboutPath} aria-current={section === 'about' ? 'page' : undefined}>About</a><a href="/feed.xml">RSS</a><a href={`https://github.com/${username}`}>GitHub <span className="external-arrow" aria-hidden="true">↗</span></a></nav>
    </header>
    <main id="main">{children}</main>
    <footer className="site-footer"><span>© {new Date().getUTCFullYear()} {siteName}</span><a href="/feed.xml">Subscribe via RSS ↗</a></footer>
  </body></html>;
}
async function page(route: string, element: React.ReactElement) {
  const target = path.join(output, decodeURIComponent(route), 'index.html');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, '<!DOCTYPE html>\n' + renderToStaticMarkup(element));
}
const description = 'Notes on software, hardware, and things learned along the way. 開發紀錄、技術筆記與生活隨想。';
const years = [...new Set(posts.map(p => p.date.slice(0, 4)))];
const listing = <Layout title={`${siteName} — Blog`} description={description} canonical={`${site}/`}>
  <section className="intro"><p className="eyebrow">NOTES & EXPLORATIONS</p><h1>Blog<span className="brand-dot">.</span></h1><p>開發紀錄、技術筆記與生活隨想。</p></section>
  <div className="archive">{posts.length ? years.map(year => <section className="year-group" key={year} aria-label={`${year} 年文章`}>
    <h2>{year}</h2><ul>{posts.filter(p => p.date.startsWith(year)).map(post => <li key={post.id}>
      <a href={postPath(post.id)}>{post.title}</a><span className="leader" aria-hidden="true" /><time dateTime={post.date}>{post.date.slice(5, 10)}</time>
    </li>)}</ul>
  </section>) : <p className="empty">尚無文章，敬請期待。</p>}</div>
</Layout>;
await page('/', listing);
await page(blogPath, listing);
const thoughtDate = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});
await page(thoughtsPath, <Layout title={`${siteName} — Thoughts`} description="日常隨想、開發片段與短筆記。" canonical={`${site}${thoughtsPath}`} section="thoughts">
  <section className="intro"><p className="eyebrow">SMALL NOTES, EVERYDAY MOMENTS</p><h1>Thoughts<span className="brand-dot">.</span></h1><p>日常隨想、開發片段與短筆記。</p></section>
  <div className="thoughts">{thoughts.length ? thoughts.map(thought => <article className="thought" key={thought.id} id={thoughtAnchor(thought.id)}>
    <div className="prose" dangerouslySetInnerHTML={{ __html: thought.html }} />
    {thought.attachment && <img className="thought-image" src={thought.attachment} alt="Thought 附圖" />}
    <footer><a className="thought-permalink" href={thoughtPath(thought.id)} aria-label={`分享 ${thoughtDate.format(new Date(thought.date))} 的短文`}><time dateTime={thought.date}>{thoughtDate.format(new Date(thought.date))}</time><span aria-hidden="true"> ↗</span></a></footer>
  </article>) : <p className="empty">尚無短文，敬請期待。</p>}</div>
</Layout>);
if (about) await page(aboutPath, <Layout title={`About ${siteName}`} description={`About ${siteName}`} canonical={`${site}${aboutPath}`} section="about">
  <article className="post about"><a className="back" href="/">← 回到文章</a><header className="post-header"><h1>About <span className="brand-dot">{siteName}</span></h1></header>
    <div className="prose" dangerouslySetInnerHTML={{ __html: about.html }} />
  </article>
</Layout>);
for (const post of posts) await page(postPath(post.id), <Layout title={`${post.title} — ${siteName}`} description={post.description} canonical={`${site}${postPath(post.id)}`} post={post}>
  <article className="post"><a className="back" href="/">← 所有文章</a><header className="post-header"><time dateTime={post.date}>{post.date.slice(0, 10)}</time><h1>{post.title}</h1></header>
    <div className="prose" dangerouslySetInnerHTML={{ __html: post.html }} />
    <section className="comments" aria-labelledby="comments-title">
      <h2 id="comments-title">留言</h2>
      <div className="disqus-thread" id="disqus_thread" data-shortname={disqusShortname} data-url={`${site}${postPath(post.id)}`} data-identifier={`public-${username}-${post.id}`} data-title={post.title}>
        <p className="disqus-status">留言板載入中…</p>
        <button className="disqus-retry" type="button" hidden>重新載入留言</button>
      </div>
      {disqusShortname && <script src="/assets/disqus.js" defer />}
    </section>
  </article>
</Layout>);
await writeFile(path.join(output, '404.html'), '<!DOCTYPE html>\n' + renderToStaticMarkup(<Layout title="找不到文章 — splasky" description="此頁面不存在。" canonical={`${site}/404.html`} noindex>
  <section className="intro"><p className="eyebrow">404</p><h1>找不到這個頁面。</h1><p>文章可能已移動或刪除。</p><a className="back" href="/">← 回到文章列表</a></section>
</Layout>));
const feed = buildFeed(posts, thoughts);
await writeFile(path.join(output, 'feed.xml'), feed);
await mkdir(path.join(output, 'splasky'), { recursive: true });
await writeFile(path.join(output, 'splasky/feed.xml'), feed);
await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site}/</loc></url><url><loc>${site}${thoughtsPath}</loc></url>${about ? `<url><loc>${site}${aboutPath}</loc></url>` : ''}${posts.map(p => `<url><loc>${site}${postPath(p.id)}</loc></url>`).join('')}</urlset>`);
await writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
await writeFile(path.join(output, '.nojekyll'), '');
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await writeFile(path.join(output, 'build-info.json'), JSON.stringify({ repository: repo, branch: contentBranch, commit, site, username, articles: posts.length, thoughts: thoughts.length, builtAt: new Date().toISOString() }, null, 2));
await validateSite(output);
console.log(`Validated and built ${posts.length} articles and ${thoughts.length} thoughts from ${repo}@${commit.slice(0, 12)} into dist/`);
