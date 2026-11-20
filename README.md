# tatenda nyemudzo.dev

A personal website for apps and downloads, music, photography, and a blog. Built with Astro in static mode. Photography includes 26 supplied Kariba photographs; the other collections are empty. The site has not been publicly deployed.

## Run locally

Use Node.js 22.23.4 or newer, as required by the patched Astro version. A pinned Node runtime is also included as development tooling, so `npm run` commands use the supported version consistently. Install development dependencies when building; they are not part of the static website output.

```sh
npm ci
npm run dev
```

Open the local address printed by Astro, normally `http://127.0.0.1:4321`.

```sh
npm run check    # Astro and TypeScript diagnostics
npm run build    # Static files in dist/
npm run preview  # Serve the production build locally
npm test         # Build and test an isolated copy, including content fixtures
```

## Add content

Copy one of the files in `content-templates/` to its matching collection:

| Content | Folder | Template | Resulting URL |
| --- | --- | --- | --- |
| App | `src/content/apps/` | `app.md` | `/apps/your-file-name/` |
| Song | `src/content/music/` | `song.md` | `/music/your-file-name/` |
| Photograph | `src/content/photography/` | `photograph.md` | `/photography/your-file-name/` |
| Blog post | `src/content/blog/` | `post.md` | `/blog/your-file-name/` |

Fill in the properties and Markdown body. Use lowercase filenames with hyphens. The file's name determines its URL, so keep it stable once shared. Subfolders are supported.

Set **`published: true`** when an entry is ready. Omitted or false means it is excluded from the home count, lists, and generated detail routes, even in development. A future `date` also holds an entry out until a build on or after that date. Publication happens at build time; the website does not run a scheduler. Rebuild to include or remove entries.

Apps need at least one labelled HTTPS download URL. Songs need an artist and HTTPS listening URL. Blog posts require a publication date. Dates display consistently in UTC. Content metadata is validated during the build.

For a photo, put the original in `src/assets/photos/`, then reference it relative to the Markdown file (the template's example assumes a file directly inside `src/content/photography/`). Add accurate alternative text. Astro produces smaller WebP images and responsive sources; the original is not copied as a public download. The source repository still contains it, so check the original's metadata before making the repository public. The optional caption appears below the full photograph.

### If uploaded photos do not appear

The gallery reads published Markdown entries in `src/content/photography/`. Saving photos in a Desktop folder, `public/`, or even `src/assets/photos/` alone does not create gallery entries. Each photograph needs both an image and a matching content file:

1. Copy one source image into `src/assets/photos/`; different size exports of the same photograph only need one entry.
2. Copy `content-templates/photograph.md` into `src/content/photography/` with a unique filename.
3. Fill in its title, description, image path, and alternative text, and set `published: true`. Leave `date` out if the capture/publication date is unknown; future dates keep entries hidden.
4. Open `/photography/` on the local dev server and refresh. For `npm run preview` or a public static host, run `npm run build` again first and deploy the updated `dist/` when applicable.

The supplied Kariba collection follows this pattern: `src/content/photography/kariba-dsc-1422.md` references `../../assets/photos/kariba/dsc-1422.webp`. Its individual page is `/photography/kariba-dsc-1422/`. The Desktop source folder is not watched or read by the site. `http://127.0.0.1:4321` is a local preview on your computer.

Draft filtering is an editorial convenience, not encryption or an access-control system. Only keep website content in `src/content/` and review the output before publishing. The private Obsidian vault is outside this project and is not read by the build. Markdown is trusted author content; do not accept unreviewed Markdown or HTML from strangers.

## Change the design

- `src/site.ts`: display name, section names, descriptions, and links.
- `src/styles/global.css`: colour and type tokens, layout, responsive styles.
- `src/layouts/Base.astro`: shared navigation, metadata, and footer.
- `src/components/EntryList.astro`: collection entry layouts.
- `src/pages/index.astro`: home composition.
- `src/pages/[section]/index.astro`: section lists and empty states.
- `src/pages/[section]/[...id].astro`: individual content pages.
- `src/content.config.ts`: required content fields.

Content and templates are separate, so a visual redesign does not require rewriting entries. Fonts are served locally; there are no runtime scripts, tracking requests, streaming embeds, database, or server adapter in this version. Sentient is by Indian Type Foundry, obtained from Fontshare. Its unmodified webfont and license are included; see `public/fonts/FFL.txt`.

## Hosting later

`npm run build` creates `dist/`, which can be served by a static host. No hosting account or domain has been configured. The display name is not assumed to be an owned domain.

Set `SITE_URL=https://your-real-domain.example` in the build environment once you choose a domain; canonical and Open Graph URLs will then be generated. Set `BASE_PATH=/your-subdirectory/` if hosting below the domain root. See `.env.example`. In CI these should be actual build environment variables; the Astro config reads `process.env`.

The included `_headers` supplies security headers on hosts that support that format, such as Cloudflare Pages. Other hosts need equivalent configuration. The policy intentionally blocks scripts and embeds; update it deliberately if a future feature needs them. Header behaviour must be verified on the selected host before public launch.

Keep large app installers on a suitable release/download host and link to them from the app's metadata. Do not put installers in Git or assume the website host supports their size. Cloudflare Pages has a 25 MiB per-file asset limit. No real app downloads have been supplied or verified yet.

## Project memory

Read `AGENTS.md` first. The feature, decisions, and project memory are in the shared Obsidian vault at `/Users/michaelnyemudzo/Obsidian/Coding/Projects/codingclub/`. Those notes are not website content.
