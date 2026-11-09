# The Python Blocks server

The server ([server/](../server)) serves the app to signed-in learners and keeps their accounts, saved programs, synced work and coins. It is a small Node program with no dependencies beyond Node itself: HTTP from `node:http`, data in one SQLite file through `node:sqlite`, passwords hashed with `scrypt` from `node:crypto`. Node runs its TypeScript directly (type stripping), so there is nothing to compile for it.

There is no sign-up. An admin makes every account and hands out the username and password.

## Run it

```bash
pnpm build
```

```bash
ADMIN_USERNAME=teacher ADMIN_PASSWORD=choose-a-password pnpm serve
```

Then open http://127.0.0.1:8787, sign in as the admin, and add learners from **Admin** in the account menu (the round button with your initial in the top bar). The admin account is made the first time the server starts without one; after that the two variables are not needed.

| Setting | Default | What it does |
| --- | --- | --- |
| `PORT`, `HOST` | `8787`, `127.0.0.1` | Where the server listens. Use `HOST=0.0.0.0` to accept connections from other computers. |
| `DATA_DIR` | `data` | Folder for `python-blocks.sqlite`. Back this file up. |
| `DIST_DIR`, `CONTENT_DIR` | `dist`, `content` | The built app, and the lessons and units the coin rewards are read from. |
| `COOKIE_SECURE` | `auto` | Session cookies are `Secure` over HTTPS. `auto` decides per request; `true` or `false` forces it. |
| `TRUST_PROXY` | off | `1` behind a reverse proxy, so the client's address (for sign-in throttling) and HTTPS come from `X-Forwarded-For` and `X-Forwarded-Proto`. |
| `API_ONLY` | off | `1` to answer only `/api/`, with the pages and files served elsewhere (the Cloudflare Worker, below). |
| `SITE_ORIGIN` | none | The site's origin when its pages come from another host (`https://pythonblocks.org`): changes from them are accepted. |
| `PROXY_SECRET` | none | Every request but `/api/health` must carry it in `X-PB-Proxy`, so the API can be reached only through the proxy that knows it. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | none | Make the first admin when there is none. |

Accounts can also be managed on the command line, for the first admin or if the admin page is out of reach (the password comes from `PASSWORD`, or is asked for twice and not shown as you type):

```bash
pnpm accounts add-user ada --name "Ada"
```

```bash
pnpm accounts set-password ada
```

```bash
pnpm accounts list-users
```

```bash
pnpm accounts backup backup.sqlite
```

The backup is one whole file, safe to take while the server runs.

When the server sends the editor's page to a signed-in learner, it puts their account and synced work in the page (a JSON script, `#pb-account`), so the editor starts with them at once, with no extra request. Opened without the server (`pnpm dev`, `pnpm preview` and the browser tests), the page has no account, and the app runs on its own: work kept in that browser only. That is a development mode, not a way to deploy: the server is what keeps the app private. To work on the account features, run `pnpm build` and `pnpm serve` (the server reads `dist/` on every request, so a new build needs no restart).

## Deploy it

On one machine: any computer with Node 24 or later can run the whole thing. Build the app, copy the repository (with `dist/`), and run `pnpm serve` (or `node server/main.ts`) under a service manager, or use the [Dockerfile](../Dockerfile) with a persistent disk for `DATA_DIR`. Put HTTPS in front of it with a reverse proxy and set `TRUST_PROXY=1`. With Caddy:

```
blocks.example.org {
  reverse_proxy 127.0.0.1:8787
}
```

The server sets the cross-origin isolation headers the editor needs (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) itself, so the proxy needs no extra configuration.

### pythonblocks.org: Cloudflare and Linode

```
browser ─► pythonblocks.org (Cloudflare)
             ├─ the built app's files, served straight from Cloudflare (public/_headers adds the isolation headers)
             └─ Worker python-blocks (worker/index.ts), only for /, /login, /admin, /api/* and videos
                  ├─ /api/* ─► api.pythonblocks.org ─(Cloudflare Tunnel yaowan-play)─► Linode 127.0.0.1:8788
                  └─ pages: asks the backend who is signed in (/api/boot); signed out → /login,
                     signed in → the editor's page with #pb-account, as the server above does it
```

**The frontend** is a Cloudflare Worker with the built app as its static files ([wrangler.jsonc](../wrangler.jsonc)). The Worker runs only for the pages, the API and the videos:

- `/api/*` goes to the backend with `X-PB-Proxy` (the Worker secret `PROXY_SECRET`) and the learner's address from `CF-Connecting-IP`.
- The editor and admin pages need a session.
- A video answers the byte ranges Safari asks for. Cloudflare's static files send the whole file even when a range is asked for.
- `www` goes to the bare domain.

The API stays at `pythonblocks.org/api`, on the same origin as the pages, so the app and its session cookie are the same as with the one-machine server.

**The backend** shares the arcade's Linode box (`~/creds/linode.ip`, SSH as root with `~/.ssh/id_ed25519`) with the game server and keeps to its own:

| What | Where |
| --- | --- |
| Node 24 | `/opt/node-24` (the game server keeps `/usr/bin/node`) |
| User | `pyblocks` |
| Code | `/opt/python-blocks` |
| Database | `/var/lib/python-blocks/python-blocks.sqlite` |
| Port | `127.0.0.1:8788` |
| Settings | `/etc/python-blocks.env` (`API_ONLY`, `SITE_ORIGIN`, `PROXY_SECRET`, …) |
| Service | `python-blocks.service` |

The box's firewall allows only SSH. The Cloudflare Tunnel `yaowan-play` brings `api.pythonblocks.org` to port 8788, beside the arcade's `play.yaowan.studio`. The files for the box are in [deploy/linode](../deploy/linode).

Deploy each half from this Mac:

```bash
pnpm deploy:frontend
```

```bash
pnpm deploy:backend
```

- **Frontend:** builds and runs `wrangler deploy`, with the token from `~/creds/cloudflare.worker.api`.
- **Backend:** copies `server/`, `content/`, `deploy/linode/` and the shared limits to the box, restarts the service and checks its health.

**Backups:** `python-blocks-backup.timer` runs every night. It copies the database with `node server/cli.ts backup` and keeps 7 days on the box and 30 in the R2 bucket `python-blocks` (`/etc/python-blocks-rclone.conf`). To restore one:

1. Stop `python-blocks`.
2. Put the unzipped file at `/var/lib/python-blocks/python-blocks.sqlite`, owned by `pyblocks`.
3. Start the service.

**Accounts:** make or change them on the box. Each command asks for the password twice, without showing it.

```bash
ssh -t root@$(cat ~/creds/linode.ip) "cd /opt/python-blocks && sudo -u pyblocks sh -c 'set -a; . /etc/python-blocks.env; /opt/node-24/bin/node server/cli.ts add-user <username> --name \"Your name\" --admin'"
```

**Setting it up again:**

1. Run [deploy/linode/setup.sh](../deploy/linode/setup.sh) on the box as root.
2. Write the two settings files from their `.example`s. A new `PROXY_SECRET` (`openssl rand -hex 32`, kept in `~/creds/python-blocks.proxy.secret`) goes in `/etc/python-blocks.env` and in the Worker:

   ```bash
   npx wrangler secret put PROXY_SECRET
   ```

3. Add `api.pythonblocks.org` → `http://localhost:8788` to the tunnel's public hostnames.
4. Run both deploys.

## What is private

Before signing in, the one-machine server serves only the sign-in page (`/login`) and the files that page loads, read from `dist/login.html`. Every other page, script, picture, lesson and Python file needs a session: a page request is sent to `/login?next=…`, anything else gets 401. The admin page (`/admin`) and the admin API need the admin role.

On pythonblocks.org the Worker keeps the pages behind sign-in in the same way: the editor, and the admin page for admins only. The built files themselves (scripts, lessons, pictures, Pyodide) are public, served from Cloudflare's cache. Accounts, saved programs, synced work and coins are only in the API, which needs a session.

- **Passwords** are stored as `scrypt` hashes (N 32768, r 8, p 1: 32 MB and a moment of work each) with their own random salt. Each hash records its cost, so a password hashed at an older cost still works and is hashed again at the current one when its owner next signs in. A wrong password and a missing username take the same time.
- **Sessions** are a random token in an `HttpOnly`, `SameSite=Lax` cookie that lasts 30 days from its last use; the database keeps only its SHA-256 hash. Changing or resetting a password, or turning an account off, ends the account's other sessions.
- **Guessing** is slowed: ten wrong passwords for one username, or thirty from one address, within 15 minutes, and sign-in waits.
- **Changes** to data are accepted only as JSON and only from the site's own pages (a request from another origin is refused), so another site cannot make a learner's browser change their work.

## Accounts, work and coins

| Part | How it works |
| --- | --- |
| Profile | A learner can change their display name and their password (their username is the admin's). Admins can rename, reset passwords (which signs the learner out everywhere), turn accounts off and on, and make admins. |
| Synced work | The editor keeps using the browser's storage; [sync.ts](../src/account/sync.ts) copies the keys in [SYNCED_KEYS](../src/account/shared.ts) to the account (the project in the editor and its title, the lesson position and the project kept beside a lesson, the level, the view, Academy progress, which saved program is open, and Quick tools: where the panel sits, whether it is minimized and the favourite blocks) a moment after they change, and loads them when the learner signs in. The browser remembers whose work it holds and what has not reached the server; signing out clears it. A browser used before accounts gives its work to the first learner who signs in with nothing saved; otherwise its program is kept in My projects as “(from this browser)”. |
| My projects | The project in the editor is saved as a program as the learner works, once they change it (opening an example or a project from a file does not save anything by itself). Lesson and Academy work stays lesson work while the lesson is open; a finished guided build or lesson game is saved like any program. **My projects** in the account menu lists them, opens, renames and deletes them, and starts a new one. In **More actions**, **Save project** saves the project to My projects at once (the first time, or while it is still called “My project”, it asks for a name first), and **Open project** opens My projects; **Import project** and **Export project** open and download project files, as before accounts (without the server, only these two show). Up to 200 programs of 16 MB each. |
| Coins | A ledger of entries (`coins` table): a balance is their sum. Finishing something earns its award once: a lesson 100, a guided build 30, an Academy unit 30 and its mastery star 20, a chapter's big project 100 (one table in [rewards.ts](../server/rewards.ts), read against the lessons and units in `content/`). The editor sends `lesson:<id>`, `build:<id>`, `unit:<id>` or `mastery:<id>` when the learner finishes or masters it; the server checks the award exists and has not been earned. Admins can give or take coins with a note the learner sees. The shop will add purchases as negative entries and refunds as positive ones. |

## API

All under `/api`, as JSON. Every route but sign-in, sign-out and `health` needs a session.

| Route | Does |
| --- | --- |
| `POST /login`, `POST /logout` | Sign in with `{username, password}` (sets the session cookie); sign out. |
| `GET /me`, `PATCH /me`, `POST /me/password` | The learner and their coins; change the display name; change the password (`{current, next}`). |
| `GET /data`, `PUT /data` | The synced keys; set or delete some (`{values: {key: text or null}}`). |
| `GET /projects`, `POST /projects`, `GET/PUT/DELETE /projects/:id` | Saved programs: list, save new (`{title, data}`), open, change, delete. |
| `GET /coins`, `POST /awards` | The balance, the latest entries and the awards earned; earn an award (`{award}`). |
| `GET/POST /admin/users`, `GET/PATCH /admin/users/:id`, `POST /admin/users/:id/coins` | Admin: list and add accounts; a learner's coins, awards, programs and Academy progress; rename, reset the password, turn off or on, change the role; give or take coins. |

The [server tests](../tests/unit/server.test.ts) cover each of these on a fresh database, and the [browser test](../tests/e2e/accounts.spec.ts) runs the real server: an admin adds a learner, whose program, lesson work and coins follow them to a second browser, who signs out leaving nothing behind, and who cannot sign in once their account is turned off.
