import { readFile, readdir, realpath, copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype, { type Options as RemarkRehypeOptions } from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import config from '../site.config.json' with { type: 'json' };

const origin = config.siteOrigin.replace(/\/$/, '');
if (!/^https?:\/\/[^/]+$/.test(origin)) throw new Error('siteOrigin must be an absolute origin without a path');
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(config.username)) throw new Error('username contains unsupported URL characters');
if (!/^[^/]+\/[^/]+$/.test(config.contentRepository)) throw new Error('contentRepository must be owner/repository');
export const site = origin;
export const username = config.username;
export const siteName = config.siteName || username;
export const repo = config.contentRepository;
export const contentBranch = config.contentBranch || 'main';
export const disqusShortname = config.disqusShortname || '';
export const legacyOrigins = config.legacyOrigins || [];
export const blogPath = `/${username}/blog/`;
export const thoughtsPath = `/${username}/thoughts/`;
export const aboutPath = `/${username}/about/`;
export const thoughtAnchor = (id: string) => `thought-${id}`;
export const thoughtPath = (id: string) => `${thoughtsPath}#${encodeURIComponent(thoughtAnchor(id))}`;
export const postPath = (id: string) => `${blogPath}${encodeURIComponent(id)}/`;
export const isVercel = (host: string) => /(^|\.)(vercel\.app|vercel\.com|vercel-scripts\.com|vercel-insights\.com|vercel-analytics\.com)$/.test(host);
export type VideoEmbed = { kind: 'youtube' | 'gdrive' | 'ipfs'; originalUrl: string; embedUrl: string };
export type Post = { id: string; title: string; date: string; markdown: string; html: string; description: string; image?: string; hasVideoEmbeds?: boolean };
export type Thought = Post & { attachment?: string };

const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']);
const driveHosts = new Set(['drive.google.com', 'www.drive.google.com']);
const ipfsGatewayHosts = new Set(['ipfs.io', 'dweb.link', 'w3s.link', 'nftstorage.link', 'cloudflare-ipfs.com']);

export function parseVideoUrl(value: string): VideoEmbed | null {
  const originalUrl = value.trim();
  if (!originalUrl || /[\s<>"']/u.test(originalUrl)) return null;
  if (originalUrl.toLowerCase().startsWith('ipfs://')) {
    const path = originalUrl.slice(7).replace(/^\/+/, '');
    const match = path.match(/^((?:Qm[A-HJ-NP-Za-km-z1-9]{44})|(?:bafy|bafk)[a-z2-7]{20,})(?:\/(.*))?$/u);
    if (!match) return null;
    const suffix = match[2] ? `/${match[2].split('/').map(encodeURIComponent).join('/')}` : '';
    return { kind: 'ipfs', originalUrl, embedUrl: `https://ipfs.io/ipfs/${match[1]}${suffix}` };
  }
  let url: URL;
  try { url = new URL(originalUrl); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (youtubeHosts.has(host)) {
    let id = '';
    if (host.includes('youtu.be')) id = url.pathname.slice(1).split('/')[0];
    else if (url.pathname === '/watch') id = url.searchParams.get('v') ?? '';
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] ?? '';
    if (!/^[A-Za-z0-9_-]{11}$/u.test(id)) return null;
    return { kind: 'youtube', originalUrl, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (driveHosts.has(host)) {
    const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,})\/(?:view|preview)?$/u);
    if (!match) return null;
    return { kind: 'gdrive', originalUrl, embedUrl: `https://drive.google.com/file/d/${match[1]}/preview` };
  }
  if (ipfsGatewayHosts.has(host)) {
    const match = url.pathname.match(/^\/ipfs\/((?:Qm[A-HJ-NP-Za-km-z1-9]{44})|(?:bafy|bafk)[a-z2-7]{20,})(?:\/[^\s]*)?$/u);
    if (!match) return null;
    return { kind: 'ipfs', originalUrl, embedUrl: url.href };
  }
  return null;
}

function standaloneVideo(node: any): VideoEmbed | null {
  if (node.type === 'paragraph' && node.children?.length === 1) {
    const child = node.children[0];
    if (child.type === 'text') return parseVideoUrl(child.value);
    if (child.type === 'link') return parseVideoUrl(child.url);
  }
  return null;
}

function remarkVideoEmbeds(enabled: boolean) {
  return () => (tree: any) => {
    if (enabled) visit(tree, 'paragraph', (node: any, index: number | undefined, parent: any) => {
      if (!parent || index === undefined) return;
      const video = standaloneVideo(node);
      if (video) parent.children[index] = { type: 'videoEmbed', data: video };
    });
  };
}

export async function readAbout(source: string): Promise<Post | null> {
  try {
    const markdown = await readFile(path.join(source, 'content/about.md'), 'utf8');
    return { id: 'about', title: `About ${siteName}`, date: new Date(0).toISOString(), markdown, html: '', description: '' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function readThoughts(source: string): Promise<Thought[]> {
  let raw: string;
  try {
    raw = await readFile(path.join(source, 'content/thoughts.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const entries: unknown = JSON.parse(raw);
  if (!Array.isArray(entries)) throw new Error('thoughts.json must contain an array');
  const ids = new Set<string>();
  return entries.map((entry): Thought => {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || /[\x00-\x20]/.test(entry.id)
      || typeof entry.content !== 'string' || typeof entry.timestamp !== 'string'
      || Number.isNaN(Date.parse(entry.timestamp)) || (entry.image !== undefined && typeof entry.image !== 'string')) {
      throw new Error('Invalid thought: expected id, content, timestamp and optional image');
    }
    if (ids.has(entry.id)) throw new Error(`Duplicate thought ID: ${entry.id}`);
    ids.add(entry.id);
    return {
      id: entry.id, title: 'Thought', date: new Date(entry.timestamp).toISOString(),
      markdown: entry.content, html: '', description: '', attachment: entry.image || undefined,
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export async function readPosts(source: string): Promise<Post[]> {
  const files = await readdir(path.join(source, 'content/blog'), { withFileTypes: true });
  const posts: Post[] = [];
  for (const file of files) {
    if (!file.name.endsWith('.md')) continue;
    if (!file.isFile()) throw new Error(`Unsupported article entry: ${file.name}`);
    const id = file.name.slice(0, -3);
    const { data, content } = matter(await readFile(path.join(source, 'content/blog', file.name), 'utf8'));
    if (!id || id === '.' || id === '..' || /[\\\x00-\x1f]/.test(id)) throw new Error(`Invalid article ID: ${file.name}`);
    const date = new Date(data.date);
    if (!data.date || Number.isNaN(date.getTime()) || typeof data.title !== 'string' || !data.title.trim()) {
      throw new Error(`Missing or invalid title/date: ${file.name}`);
    }
    posts.push({ id, title: data.title.trim(), date: date.toISOString(), markdown: content, html: '', description: '' });
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

// Resolve only files inside the checkout, including after following symlinks.
export async function safeFile(source: string, relative: string): Promise<string> {
  const root = await realpath(source);
  const file = await realpath(path.resolve(root, relative));
  if (!file.startsWith(root + path.sep)) throw new Error(`Asset escapes content repository: ${relative}`);
  return file;
}

export function rewriteLink(href: string, id: string, ids: Set<string>): string {
  const url = new URL(href, `${site}${postPath(id)}`);
  const knownBlog = url.origin === site || legacyOrigins.includes(url.origin) || isVercel(url.hostname);
  if (!knownBlog) return href;
  const decoded = decodeURIComponent(url.pathname);
  const prefix = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^/${prefix}/thoughts/?$`).test(decoded)) return thoughtsPath + url.search + url.hash;
  if (new RegExp(`^/${prefix}/about/?$`).test(decoded)) return aboutPath + url.search + url.hash;
  if (new RegExp(`^/${prefix}/blog/?$`).test(decoded) || (url.origin === site && decoded === '/')) return '/' + url.search + url.hash;
  const match = decoded.match(new RegExp(`^/${prefix}/blog/([^/]+)/?$`));
  const markdownID = !href.startsWith('http') && href.split(/[?#]/)[0].endsWith('.md')
    ? path.posix.basename(decoded, '.md') : undefined;
  const target = match?.[1] ?? markdownID;
  if (target) {
    if (!ids.has(target)) throw new Error(`Broken article link in ${id}: ${href}`);
    return postPath(target) + url.search + url.hash;
  }
  if (isVercel(url.hostname)) throw new Error(`Unmapped Vercel link in ${id}: ${href}`);
  return href;
}

export function assetResolver(source: string, output: string) {
  const cache = new Map<string, Promise<string>>();
  async function resolveAsset(src: string, id: string): Promise<string> {
    if (/^(data:|javascript:)/i.test(src)) throw new Error(`Unsupported image URL in ${id}`);
    const url = new URL(src, `${site}${postPath(id)}`);
    const segments = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    let relative: string | undefined;
    if (url.hostname === 'raw.githubusercontent.com' && segments.slice(0, 2).join('/') === repo) {
      relative = segments.slice(3).join('/');
    } else if (url.hostname === 'github.com' && segments.slice(0, 2).join('/') === repo && ['blob', 'raw'].includes(segments[2])) {
      relative = segments.slice(4).join('/');
    } else if (url.origin === site) {
      const rawPath = decodeURIComponent(src.split(/[?#]/)[0]);
      relative = rawPath.startsWith('/') ? rawPath.slice(1)
        : rawPath.startsWith('assets/') ? rawPath : path.posix.join('content/blog', rawPath);
    }
    if (relative !== undefined) {
      const file = await safeFile(source, relative);
      const bytes = await readFile(file);
      const name = createHash('sha256').update(bytes).digest('hex').slice(0, 24) + path.extname(file).toLowerCase();
      await mkdir(path.join(output, 'assets/content'), { recursive: true });
      await copyFile(file, path.join(output, 'assets/content', name));
      return `/assets/content/${name}`;
    }
    if (isVercel(url.hostname)) {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Cannot mirror image (${response.status}): ${src}`);
      const mime = response.headers.get('content-type')?.split(';')[0];
      const extension = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg' } as Record<string, string>)[mime ?? ''];
      if (!extension) throw new Error(`Not an image: ${src}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const name = createHash('sha256').update(bytes).digest('hex').slice(0, 24) + extension;
      await mkdir(path.join(output, 'assets/content'), { recursive: true });
      await writeFile(path.join(output, 'assets/content', name), bytes);
      return `/assets/content/${name}`;
    }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error(`Unsupported image protocol: ${src}`);
    // TinyMind supports GitHub blob image links as well as raw links.
    if (url.hostname === 'github.com' && segments[2] === 'blob') {
      return `https://raw.githubusercontent.com/${segments.slice(0, 2).join('/')}/${segments.slice(3).map(encodeURIComponent).join('/')}`;
    }
    return url.href;
  }
  return (src: string, id: string) => {
    const key = `${id}:${src}`;
    if (!cache.has(key)) cache.set(key, resolveAsset(src, id));
    return cache.get(key)!;
  };
}

export async function renderPost(post: Post, ids: Set<string>, asset: ReturnType<typeof assetResolver>, enableVideoEmbeds = false): Promise<void> {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkVideoEmbeds(enableVideoEmbeds));
  const tree = processor.parse(post.markdown) as Root;
  await processor.run(tree);
  const definitions = new Map<string, string>();
  visit(tree, 'definition', node => { definitions.set(node.identifier, node.url); });
  // Expand references so a single definition can safely serve both a link and an image.
  visit(tree, (node, index, parent) => {
    if ((node.type === 'imageReference' || node.type === 'linkReference') && parent && index !== undefined) {
      const url = definitions.get(node.identifier);
      if (url) parent.children[index] = node.type === 'imageReference'
        ? { type: 'image', url, alt: node.alt }
        : { type: 'link', url, children: node.children };
    }
  });
  const jobs: Promise<void>[] = [];
  // These are paths in the author's development project, not downloadable blog files.
  visit(tree, 'link', (node, index, parent) => {
    if (/^(?:\.\/)?\.vscode\//.test(node.url) && parent && index !== undefined) {
      console.warn(`${post.id}: rendering project file reference as text: ${node.url}`);
      parent.children[index] = { type: 'inlineCode', value: node.children.map(child => 'value' in child ? child.value : '').join('') || node.url };
    }
  });
  const text: string[] = [];
  visit(tree, node => {
    if (node.type === 'link') node.url = rewriteLink(node.url, post.id, ids);
    if (node.type === 'image') jobs.push(asset(node.url, post.id).then(url => { node.url = url; }));
    if (node.type === 'text') text.push(node.value);
  });
  await Promise.all(jobs);
  visit(tree, 'image', node => { post.image ??= node.url; });
  post.description = text.join(' ').replace(/\s+/g, ' ').trim().slice(0, 160) || post.title;
  post.hasVideoEmbeds = enableVideoEmbeds && Boolean((tree as any).children.some((node: any) => node.type === 'videoEmbed'));
  type RemarkHandler = Exclude<NonNullable<RemarkRehypeOptions['handlers']>[keyof NonNullable<RemarkRehypeOptions['handlers']>], undefined>;
  const videoEmbedHandler = ((_state: Parameters<RemarkHandler>[0], node: any): ReturnType<RemarkHandler> => {
    const video = node.data as VideoEmbed;
    const source = video.kind === 'youtube' ? 'YouTube' : video.kind === 'gdrive' ? 'Google Drive' : 'IPFS';
    return {
      type: 'element', tagName: 'div', properties: {
        className: ['video-embed'], 'data-video-kind': video.kind,
        'data-embed-url': video.embedUrl, 'data-original-url': video.originalUrl,
      }, children: [
        { type: 'element', tagName: 'button', properties: { className: ['video-embed-load'], type: 'button', ariaLabel: `載入 ${source} 影片` }, children: [] },
      ],
    };
  });
  const renderer = unified().use(remarkRehype, {
    handlers: { videoEmbed: videoEmbedHandler } as RemarkRehypeOptions['handlers'],
  }).use(rehypeSanitize, {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'button'],
    attributes: {
      ...defaultSchema.attributes,
      div: [...(defaultSchema.attributes?.div ?? []), ['className', 'video-embed'], 'data-video-kind', 'data-embed-url', 'data-original-url'],
      button: ['className', 'type', 'ariaLabel'],
      p: [...(defaultSchema.attributes?.p ?? []), 'className'],
      code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./, 'math-inline', 'math-display']],
    },
  }).use(rehypeSlug).use(rehypeKatex).use(rehypeHighlight).use(rehypeStringify);
  post.html = renderer.stringify(await renderer.run(tree));
}
