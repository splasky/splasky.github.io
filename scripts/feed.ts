import { postPath, thoughtPath, type Post, type Thought, site, siteName } from './content.ts';

const escapeXml = (value: string) => value.replace(/[<>&"']/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch]!);

type FeedEntry = { title: string; link: string; date: string; description: string; category: 'Blog' | 'Thought'; guid: string };

export function buildFeed(posts: Post[], thoughts: Thought[]): string {
  const entries: FeedEntry[] = [
    ...posts.map(post => ({ title: post.title, link: `${site}${postPath(post.id)}`, date: post.date, description: post.description || post.title, category: 'Blog' as const, guid: `${site}${postPath(post.id)}` })),
    ...thoughts.map(thought => ({ title: `Thought — ${thought.date.slice(0, 10)}`, link: `${site}${thoughtPath(thought.id)}`, date: thought.date, description: thought.description || 'Thought', category: 'Thought' as const, guid: `${site}${thoughtPath(thought.id)}` })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.guid.localeCompare(b.guid));
  const lastBuildDate = entries[0] ? new Date(entries[0].date).toUTCString() : new Date(0).toUTCString();
  const items = entries.map(entry => `<item><title>${escapeXml(entry.title)}</title><link>${escapeXml(entry.link)}</link><guid isPermaLink="true">${escapeXml(entry.guid)}</guid><pubDate>${lastBuildDateFor(entry.date)}</pubDate><category>${entry.category}</category><description>${escapeXml(entry.description)}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(siteName)} — Blog &amp; Thoughts</title><link>${site}/</link><description>${escapeXml('Blog 文章與 Thoughts 短文。')}</description><lastBuildDate>${lastBuildDate}</lastBuildDate>${items}</channel></rss>`;
}

function lastBuildDateFor(value: string): string {
  return new Date(value).toUTCString();
}
