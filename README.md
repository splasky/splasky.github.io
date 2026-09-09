# splasky Blog

Static public reader for [splasky.github.io](https://splasky.github.io). TinyMind remains the editor; the reader builds directly from `splasky/tinymind-blog`, never through Vercel. Article text mentioning an old hostname is preserved.

## Local development

Requires Node.js 20+ (CI uses 22), npm, Git, and Python 3 for the preview server.

```sh
npm ci
git clone --depth 1 https://github.com/splasky/tinymind-blog.git .content
npm run check
npm test
npm run build
npm run preview
```

Open http://localhost:4173. To build from another checkout, use `CONTENT_DIR=/absolute/path npm run build`. Rebuild after changes; the preview serves the generated `dist/` directory.

For desktop/mobile browser checks, run `npx playwright install --only-shell chromium` then `npm run test:browser`. The test starts a local server if needed, blocks Vercel, visits and reloads every article, checks images and horizontal overflow, and saves screenshots under `test-results/`.

The build reads `content/blog/*.md` using YAML frontmatter (`title`, `date`) and the filename as the article ID. It produces `/`, `/splasky/blog/`, `/splasky/blog/<ID>/`, `/feed.xml`, `/splasky/feed.xml`, sitemap and 404 pages. Unicode IDs use encoded public URLs and literal filenames. Invalid metadata, missing assets, broken local links and remaining Vercel dependencies stop publication. Empty article directories are valid. Each build starts fresh, so deleted articles disappear.

GitHub-hosted images in the content repository are copied at build time. Vercel images are downloaded into local assets; unavailable images fail the build. Other external images stay external. Raw HTML in Markdown is omitted, matching the reader's Markdown-oriented content model. Scripts, iframes and unsafe URL protocols are not supported. GFM, math and syntax highlighting render during the build with local CSS and fonts.

Project-local `.vscode/` links in existing development notes are displayed as code text because those files belong to the described project, not this blog. Other broken local links fail validation. Heading IDs are generated for article anchors.

## Automatic publication

`.github/workflows/pages.yml` builds and validates on website pushes, manual runs and `blog-content-updated` repository dispatches. Successful builds deploy through GitHub Pages; failed builds leave the current site intact. `build-info.json` records the exact content commit. The publication concurrency group serializes deployments and fetches the latest content when each run starts. GitHub may coalesce pending runs; every run rebuilds the current source rather than trusting an event's older SHA.

For changes saved through TinyMind to trigger publication:

1. Create a **fine-grained personal access token** owned by `splasky`, with access to **only `splasky.github.io`**, repository permission **Contents: Read and write**, and an appropriate expiry. Metadata read access is automatic. Do not use a broad account token.
2. Store it as the Actions secret **`BLOG_PUBLISH_TOKEN` in `splasky/tinymind-blog`**, not in this repository or source code.
3. Install `automation/notify-blog.yml` as `.github/workflows/notify-blog.yml` in the content repo. A content/assets push then dispatches a rebuild. It can also be run manually for verification.
4. Set this repository's **Settings → Pages → Source** to **GitHub Actions**. Run **Publish blog** once and verify the deployed `build-info.json` and article pages.

Token creation: https://github.com/settings/personal-access-tokens/new

Content repo secrets: https://github.com/splasky/tinymind-blog/settings/secrets/actions

Workflows run without runtime credentials in the public output. Renew the dispatch token before expiry; a missing/expired token produces a failed **Update public blog** run. The website's **Publish blog → Run workflow** remains available without that cross-repository token. Deployment typically takes minutes, not real time.

## Scope and recovery

The reader includes articles and Thoughts, without TinyMind login, editing or About. Blog articles include Disqus comments using the existing public `splasky` forum and stable identifiers `public-splasky-<article ID>`, so changing the visible domain keeps the same threads. Disqus is loaded in the reader browser and is unavailable when JavaScript or the forum is blocked; article reading remains available.

Thoughts are read from `content/thoughts.json` (`id`, `content`, `timestamp`, optional `image`), sorted newest first, and published in full at `/splasky/thoughts/` with stable `#thought-<id>` links. Dates display in Asia/Taipei. Missing or empty Thoughts data produces an empty state; malformed JSON, invalid entries or duplicate IDs stop publication. Markdown and images use the same rendering and mirroring as articles. The content workflow watches Thoughts edits as well as articles and assets. RSS remains the article feed.

TinyMind can move domains without changing this site's content source or reader URLs. This does not disable the original Vercel deployment or erase historical public URLs.

If a publication fails, inspect the failed Actions step and fix the source, then rerun publication. Restore deleted content or revert the faulty site commit to publish a previous version. The original redirect is retained in Git history (`e878977`) if a complete rollback is needed.
