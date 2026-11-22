# tatenda nyemudzo.dev

A personal website for apps and downloads, experiments and ideas, music, photography, and a blog. Built with Astro in static mode. Photography includes 26 supplied Kariba photographs; the other collections are empty. Public site: https://tatendanyemudzo.com/, served by Caddy on Ubuntu through Cloudflare Tunnel.

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
| Experiment or idea | `src/content/experiments/` | `experiment.md` | `/experiments/your-file-name/` |
| Song | `src/content/music/` | `song.md` | `/music/your-file-name/` |
| Photograph | `src/content/photography/` | `photograph.md` | `/photography/your-file-name/` |
| Blog post | `src/content/blog/` | `post.md` | `/blog/your-file-name/` |

Fill in the properties and Markdown body. Use lowercase filenames with hyphens. The file's name determines its URL, so keep it stable once shared. Subfolders are supported.

Set **`published: true`** when an entry is ready. Omitted or false means it is excluded from the home count, lists, and generated detail routes, even in development. A future `date` also holds an entry out until a build on or after that date. Publication happens at build time; the website does not run a scheduler. Rebuild to include or remove entries.

Apps need at least one labelled HTTPS download URL. Songs need an artist and HTTPS listening URL. Blog posts require a publication date. Dates display consistently in UTC. Content metadata is validated during the build.

### Experiments and ideas

Use `/experiments/` for research, concepts and unfinished projects. Copy `content-templates/experiment.md` into `src/content/experiments/` and choose a required `stage`: `researching`, `concept`, `prototype`, or `in-development`. The stage is shown on the list and individual page; it is separate from `published`, which controls whether an entry appears at all.

The template prompts you to explain the idea, motivation, work so far, open questions and next step. A demo is optional. Optional `repositoryUrl` and `demoUrl` must use HTTPS. An optional `visual` requires an image path and meaningful `alt` text for a sketch or screenshot. Start with `published: false`; set it to true when ready to share, then build and deploy. A future optional `date` holds the entry until a later build.

The section starts empty. GitHub projects will be selected and described separately; the site does not automatically import repositories.

For a photo, put the original in `src/assets/photos/`, then reference it relative to the Markdown file (the template's example assumes a file directly inside `src/content/photography/`). Add accurate alternative text. Astro produces smaller WebP images and responsive sources; the original is not copied as a public download. The source repository still contains it, so check the original's metadata before making the repository public. The optional caption appears below the full photograph.

### If uploaded photos do not appear

The gallery reads published Markdown entries in `src/content/photography/`. Saving photos in a Desktop folder, `public/`, or even `src/assets/photos/` alone does not create gallery entries. Each photograph needs both an image and a matching content file:

1. Copy one source image into `src/assets/photos/`; different size exports of the same photograph only need one entry.
2. Copy `content-templates/photograph.md` into `src/content/photography/` with a unique filename.
3. Fill in its title, description, image path, and alternative text, and set `published: true`. Leave `date` out if the capture/publication date is unknown; future dates keep entries hidden.
4. Open `/photography/` on the local dev server and refresh. For `npm run preview` or a public static host, run `npm run build` again first and deploy the updated `dist/` when applicable.

The supplied Kariba collection follows this pattern: `src/content/photography/kariba-dsc-1422.md` references `../../assets/photos/kariba/dsc-1422.webp`. Its individual page is `/photography/kariba-dsc-1422/`. The Desktop source folder is not watched or read by the site. `http://127.0.0.1:4321` is a local preview on your computer.

Draft filtering is an editorial convenience, not encryption or an access-control system. Only keep website content in `src/content/` and review the output before publishing. The private Obsidian vault is outside this project and is not read by the build. Markdown is trusted author content; do not accept unreviewed Markdown or HTML from strangers.

## Write a post from your Mac

Press **Control + Option + Command + P** to open **New site post**. Write a title and your post, optionally attach photographs and describe each one, then click **Publish post** (or press **Command + Return**). The composer rebuilds the website and opens your new Blog post. It works even when the Astro development server is stopped. An already-running dev server also sees the new content.

To install or reinstall the Mac Quick Action after cloning or moving this repository:

```sh
npm run install-shortcut
```

The installer creates `~/Library/Services/New site post.workflow` and configures Control + Option + Command + P for that service, preserving other services. If macOS has not refreshed the shortcut, open **System Settings → Keyboard → Keyboard Shortcuts → Services**, enable **New site post**, and assign that key combination. You can also run it from an app's **Services** menu, double-click `tools/New site post.command`, or run:

```sh
npm run write-post
```

Publication currently updates the **local site only**. Each post gets a date and a unique Blog URL. The title and text are saved as structured plain text, so HTML and Markdown typed in this composer display as writing. Existing hand-written Markdown posts continue to work. Optional photographs appear below the post, in attachment order; they do not create separate Photography entries.

Attach up to eight still JPG, PNG, WebP or AVIF photographs, up to 15 MB and 60 megapixels each. The tool rotates images according to their orientation, makes WebP copies with a maximum dimension of 2400px, and strips metadata from those copies. Astro then creates responsive website images. Selected originals are unchanged. Export HEIC photos as JPG first.

The form keeps your writing and attachments after an error; retrying the same successfully published submission returns the existing post. A failed build removes the new entry/photos and preserves the previous static output. Build errors are recorded in `.local-composer/last-build.log`. Unpublished writing is held in the open browser tab: keep it open until publishing succeeds, or copy your writing before closing it. Drafts are not saved across browser restarts.

The composer listens on `127.0.0.1` with a private session token. Its tools and `.local-composer/` state are outside `dist/`, and are not part of the public website. It does not commit, push, or deploy changes. After a computer restart, the shortcut starts it again automatically. To make it publish to your Ubuntu server later, connect a separate deployment step that uploads the completed static build.

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

## Hosting

The prepared Ubuntu installer is `tools/hosting/Install Caddy on Ubuntu.command`. It targets the confirmed server `muudzo@192.168.2.28`; open it in Mac Terminal, press Return when ready, then enter the Ubuntu account's SSH/sudo passwords directly. The connection starts after Return so it does not wait unattended at a password prompt. It uses Caddy's official stable Ubuntu repository, stops if another service occupies ports 80/443, and preserves an existing Caddy installation/configuration. A new installation is checked with `caddy version`, configuration validation, systemd status, and a local HTTP request. The local result/log are in ignored `.local-composer/caddy-install.exit` and `caddy-install.log`; `caddy-install.phase` records the launch stage and `caddy-install.ssh.log` holds SSH connection diagnostics. This installs the web server; website upload, a domain, DNS and firewall configuration still require their own setup.

The initial Caddy checks on 2026-11-20 found an existing active installation. The website was subsequently deployed to `/var/www/tatendanyemudzo.com`; Caddy serves it over local HTTP on port 80, and Cloudflare Tunnel provides the public connection. The homepage, gallery and a real photo asset were publicly verified on 2026-11-21.

`npm run build` creates `dist/`. Use `npm run deploy:ubuntu` to build with the production domain and upload to the configured server. A Git push alone does not update Ubuntu.

Set `SITE_URL=https://your-real-domain.example` in the build environment once you choose a domain; canonical and Open Graph URLs will then be generated. Set `BASE_PATH=/your-subdirectory/` if hosting below the domain root. See `.env.example`. In CI these should be actual build environment variables; the Astro config reads `process.env`.

The included `_headers` supplies security headers on hosts that support that format, such as Cloudflare Pages. Other hosts need equivalent configuration. The policy intentionally blocks scripts and embeds; update it deliberately if a future feature needs them. Header behaviour must be verified on the selected host before public launch.

Keep large app installers on a suitable release/download host and link to them from the app's metadata. Do not put installers in Git or assume the website host supports their size. Cloudflare Pages has a 25 MiB per-file asset limit. No real app downloads have been supplied or verified yet.

## Deploy to Ubuntu (`tatendanyemudzo.com`)

The production deployer is `tools/hosting/Deploy Website to Ubuntu.command` (or run `npm run deploy:ubuntu`). It builds the site with `SITE_URL=https://tatendanyemudzo.com`, packages the static build, and connects to `muudzo@192.168.2.28` via native Terminal:

1. Double-click `tools/hosting/Deploy Website to Ubuntu.command` or run `npm run deploy:ubuntu`.
2. Press Return when prompted, then enter the Ubuntu account password and sudo password.
3. The deployment script uploads the build to `/var/www/tatendanyemudzo.com`, configures Caddy (`/etc/caddy/Caddyfile`), reloads Caddy, checks local HTTP response, and installs or verifies `cloudflared`.

### Cloudflare Tunnel for public routing

To connect `tatendanyemudzo.com` publicly without opening router ports:
1. In Cloudflare Zero Trust (Networks → Tunnels), create a tunnel (e.g. `tatenda-site`).
2. Run the provided tunnel connector command on Ubuntu: `sudo cloudflared service install <TUNNEL_TOKEN>`.
3. Under Routes → Published application, map `tatendanyemudzo.com` to `http://127.0.0.1:80`, with HTTP Host Header `tatendanyemudzo.com`.
4. The root DNS record is a Proxied CNAME named `@` targeting the actual Tunnel ID followed by `.cfargotunnel.com`. Use the full target, not just the UUID. Port 8080 is occupied by another service.

## Project memory

Read `AGENTS.md` first. The feature, decisions, and project memory are in the shared Obsidian vault at `/Users/michaelnyemudzo/Obsidian/Coding/Projects/codingclub/`. Those notes are not website content.

### Private phone publishing

The writer is developed on `feature/009-phone-publishing`. Production setup requires clean,
validated `main`, pushed to GitHub. Run `npm run setup:writer` on the Mac and follow the native
Terminal prompts. SSH/sudo use the Ubuntu password; the separate publishing password must contain
14–256 characters. Enter passwords only in Terminal. A repository-specific writable deploy key
is registered through the authenticated GitHub CLI; its private key stays on Ubuntu.

The writer runs as `tatenda-writer` on loopback port 3210. Caddy routes `/write/` through the
existing Cloudflare Tunnel. Owner credentials and sessions live outside the repository under
`/var/lib/tatenda-writer`. Public pages remain static. Phone publication commits content to GitHub
before activating its build. Feature code still follows the branch-and-merge workflow.

Future laptop deployments use `npm run deploy:ubuntu` from clean, pushed `main`; the launcher
fetches phone posts first. Commit/push local composer posts before deploying. Server deployment
and phone publication share a lock, and stale source is rejected.

To disable the private editor while retaining the latest public site and all content, run on Ubuntu:

```sh
sudo bash /opt/tatenda-writer/current/tools/hosting/rollback-writer.sh
```

Setup keeps configuration backups in `/var/backups/tatenda-writer.*` and previous public output
under `/var/www/tatendanyemudzo.com/previous-*`. Do not delete private state or GitHub content
when reverting a code checkpoint. Inspect service failures with `sudo journalctl -u tatenda-writer`.
