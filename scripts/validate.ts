import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';
import { isVercel, site } from './content.ts';

export async function validateSite(output: string): Promise<void> {
  const files: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file); else files.push(file);
    }
  }
  await walk(output);
  for (const file of files.filter(f => f.endsWith('.html'))) {
    const html = await readFile(file, 'utf8');
    const document = parse(html);
    const urls: string[] = [];
    function visit(node: any) {
      if (node.tagName === 'script' || node.tagName === 'iframe') throw new Error(`Unexpected active content in ${file}`);
      for (const attr of node.attrs ?? []) {
        if (['src', 'href', 'poster', 'action'].includes(attr.name)) urls.push(attr.value);
        if (attr.name.startsWith('on')) throw new Error(`Inline event handler in ${file}`);
      }
      if (node.tagName === 'meta') {
        const attrs = Object.fromEntries(node.attrs.map((a: any) => [a.name, a.value]));
        if (attrs['http-equiv']?.toLowerCase() === 'refresh') throw new Error(`Redirect in ${file}`);
        if (/^(og:|twitter:)/.test(attrs.property ?? attrs.name ?? '') && /^https?:/.test(attrs.content ?? '')) urls.push(attrs.content);
      }
      for (const child of node.childNodes ?? []) visit(child);
    }
    visit(document);
    const route = '/' + path.relative(output, file).split(path.sep).map(encodeURIComponent).join('/');
    for (const value of urls) {
      const url = new URL(value, `${site}${route}`);
      if (isVercel(url.hostname)) throw new Error(`Vercel dependency in ${file}: ${value}`);
      if (url.origin !== site) continue;
      let target = path.resolve(output, '.' + decodeURIComponent(url.pathname));
      if (!target.startsWith(path.resolve(output) + path.sep) && target !== path.resolve(output)) throw new Error(`URL escapes output: ${value}`);
      try {
        if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
        await stat(target);
      } catch { throw new Error(`Broken local link in ${file}: ${value}`); }
    }
  }
  for (const file of files.filter(f => /\.(css|svg)$/.test(f))) {
    const body = await readFile(file, 'utf8');
    if (/(?:https?:)?\/\/[^\s"'<>)]*vercel(?:\.app|\.com|-(?:scripts|insights|analytics)\.com)/i.test(body)) {
      throw new Error(`Vercel dependency in asset: ${file}`);
    }
  }
}
