# Static TinyMind reader for GitHub Pages

This project turns a TinyMind content repository into a static, domain-stable public reader. Articles and Thoughts are rendered into HTML and served by GitHub Pages, so readers do not need to visit the TinyMind/Vercel deployment. Blog article comments can continue using an existing Disqus forum.

## Fork setup

1. Fork this repository and edit [`site.config.json`](site.config.json):

   ```json
   {
     "siteOrigin": "https://YOUR-ACCOUNT.github.io",
     "username": "YOUR-TINYMIND-USERNAME",
     "siteName": "YOUR NAME",
     "contentRepository": "YOUR-ACCOUNT/tinymind-blog",
     "contentBranch": "main",
     "disqusShortname": "YOUR-DISQUS-SHORTNAME",
     "legacyOrigins": ["https://tinymind.me"]
   }
   ```

   `siteOrigin` is the final public origin, without a path or trailing slash. `username` controls the `/USERNAME/blog/`, `/USERNAME/thoughts/` and `/USERNAME/about/` paths and must match the TinyMind public username. `contentRepository` is the repository created by TinyMind and must contain `content/blog/*.md`, `content/about.md`, and optionally `content/thoughts.json`. Set `disqusShortname` to an empty string to disable comments. Add any old TinyMind/Vercel origins whose internal links should be rewritten to the local reader.

2. In the content repository, install [`automation/notify-blog.yml`](automation/notify-blog.yml) as `.github/workflows/notify-blog.yml`. Change its `SITE_REPOSITORY` value to `YOUR-ACCOUNT/YOUR-FORK-NAME`.

3. Create a fine-grained GitHub token with access to only the forked reader repository and `Contents: Read and write`. Save it as the content repository Actions secret `BLOG_PUBLISH_TOKEN`. The token is used only to send a `repository_dispatch`; it is never put into the website.

4. In the fork's **Settings → Pages**, select **GitHub Actions** as the source. Run **Publish blog** once. If the content repository is private, also create a read-only token and save it in the reader repository as `CONTENT_REPO_TOKEN`.

After that, pushing an article, Thought, or image change triggers a rebuild. The deployment workflow always checks out the configured repository and branch, validates the generated site, runs the browser checks, and publishes only after they pass. A failed run leaves the previous Pages deployment intact. The reader URL and generated article URLs remain stable when the TinyMind/Vercel domain changes.

## Content contract

Blog files use YAML frontmatter with a non-empty `title` and valid `date`; the filename is the article ID. Thoughts use an array in `content/thoughts.json` with unique string `id`, string `content`, ISO-compatible `timestamp`, and optional string `image`. Articles are sorted by date and rendered at `/<username>/blog/<id>/`; Thoughts are sorted newest first at `/<username>/thoughts/` with stable `#thought-<id>` links. Existing `public-<username>-<id>` Disqus identifiers are preserved.

GitHub-hosted images in the configured content repository are copied into the site. Vercel-hosted images are downloaded during the build; an unavailable image fails publication. Other external images remain external. Markdown supports GFM, math, syntax highlighting, tables and sanitized HTML. Unsafe protocols, scripts, iframes, path traversal, invalid metadata, duplicate IDs, broken local links and unintended Vercel dependencies fail validation. Project-local `.vscode/` links in existing notes are displayed as code text.

## Local build

Requires Node.js 20+, npm, Git and Python 3:

```sh
npm ci
git clone --depth 1 https://github.com/YOUR-ACCOUNT/tinymind-blog.git .content
npm run check
npm test
CONTENT_DIR=.content npm run build
npx playwright install --only-shell chromium
npm run test:browser
npm run preview
```

The build output is `dist/`; it includes the homepage, `/USERNAME/blog/`, article pages, `/USERNAME/thoughts/`, `/USERNAME/about/`, one combined RSS feed at `/feed.xml` (and `/USERNAME/feed.xml`), sitemap, robots.txt, a custom 404 and `build-info.json`. The feed contains both Blog and Thought items, each labeled with a `Blog` or `Thought` category. Set `CONTENT_DIR` to another checkout when testing a different source. The browser tests visit and reload every generated page at desktop and mobile widths, mock Disqus, block Vercel, verify images and links, and save screenshots under `test-results/`.

## Disqus

Article comments use the configured forum and the identifier `public-${username}-${articleID}`. This matches TinyMind's public article identifier, so changing the visible reader domain does not create a new thread. Disqus is loaded by the reader browser; if JavaScript or Disqus is blocked, the article remains readable and a retry button is shown. Thoughts intentionally do not have comments.

## Troubleshooting

Inspect the failed **Publish blog** or **Update public blog** run. Common fixes are a wrong `contentRepository`, a missing `BLOG_PUBLISH_TOKEN`, an expired token, or an image URL that no longer works. Restore the source file and rerun the workflow to recover deleted content. The generated `build-info.json` records the exact source commit used by each deployment.
