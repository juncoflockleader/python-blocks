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

When the server sends the editor's page to a signed-in learner, it puts their account and synced work in the page (a JSON script, `#pb-account`), so the editor starts with them at once, with no extra request. Opened without the server (`pnpm dev`, `pnpm preview` and the browser tests), the page has no account, and the app runs on its own: work kept in that browser only. That is a development mode, not a way to deploy: the server is what keeps the app private. To work on the account features, run `pnpm build` and `pnpm serve` (the server reads `dist/` on every request, so a new build needs no restart).

## Deploy it

Any machine with Node 24 or later can run it: a small VPS, or a host such as Fly.io or Render with a persistent disk for `DATA_DIR`. Build the app, copy the repository (with `dist/`), and run `pnpm serve` (or `node server/main.ts`) under a service manager. Put HTTPS in front of it with a reverse proxy and set `TRUST_PROXY=1`. With Caddy:

```
blocks.example.org {
  reverse_proxy 127.0.0.1:8787
}
```

### On Fly.io

The repository has a [Dockerfile](../Dockerfile) and [fly.toml](../fly.toml) for Fly.io: one machine (shared CPU, 512 MB) in San Jose with a 1 GB volume, `pb_data`, mounted at `/data` for the database (Fly keeps daily snapshots of it for five days). The machine sleeps when nobody is using it and wakes on the next visit in a second or two. `CANONICAL_HOST` sends `www.pythonblocks.org` to `pythonblocks.org`, so sign-in cookies belong to one address. The first time:

```bash
fly apps create python-blocks
```

```bash
fly volumes create pb_data --app python-blocks --region sjc --size 1
```

```bash
fly deploy --ha=false
```

Then make the first admin on the machine (it asks for the password twice, without showing it; `set-password <username>` changes it the same way):

```bash
fly ssh console --app python-blocks --pty -C "sh -c 'cd /app && node server/cli.ts add-user <username> --name \"Your name\" --admin'"
```

After a change, `fly deploy` again. For the domain, `fly certs add pythonblocks.org` and `fly certs add www.pythonblocks.org`, then point the domain's DNS at the app: an `A` and an `AAAA` record for the bare domain to the addresses `fly ips list` shows, and a `CNAME` for `www` to `python-blocks.fly.dev`. `fly certs show pythonblocks.org` says when the certificate is ready. `fly logs` shows the server's log, and `fly ssh console` opens a shell on the machine (`/data/python-blocks.sqlite` is the database).

The server sets the cross-origin isolation headers the editor needs (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) itself, so the proxy needs no extra configuration. To back up the database while it runs, use SQLite's own backup (`sqlite3 data/python-blocks.sqlite ".backup backup.sqlite"`), or stop the server and copy the file.

## What is private

Before signing in, the server serves only the sign-in page (`/login`) and the files that page loads, read from `dist/login.html`. Every other page, script, picture, lesson and Python file needs a session: a page request is sent to `/login?next=…`, anything else gets 401. The admin page (`/admin`) and the admin API need the admin role.

- **Passwords** are stored as `scrypt` hashes (N 32768, r 8, p 1: 32 MB and a moment of work each) with their own random salt. Each hash records its cost, so a password hashed at an older cost still works and is hashed again at the current one when its owner next signs in. A wrong password and a missing username take the same time.
- **Sessions** are a random token in an `HttpOnly`, `SameSite=Lax` cookie that lasts 30 days from its last use; the database keeps only its SHA-256 hash. Changing or resetting a password, or turning an account off, ends the account's other sessions.
- **Guessing** is slowed: ten wrong passwords for one username, or thirty from one address, within 15 minutes, and sign-in waits.
- **Changes** to data are accepted only as JSON and only from the site's own pages (a request from another origin is refused), so another site cannot make a learner's browser change their work.

## Accounts, work and coins

| Part | How it works |
| --- | --- |
| Profile | A learner can change their display name and their password (their username is the admin's). Admins can rename, reset passwords (which signs the learner out everywhere), turn accounts off and on, and make admins. |
| Synced work | The editor keeps using the browser's storage; [sync.ts](../src/account/sync.ts) copies the keys in [SYNCED_KEYS](../src/account/shared.ts) to the account (the project in the editor and its title, the lesson position and the project kept beside a lesson, the level, the view, Academy progress, and which saved program is open) a moment after they change, and loads them when the learner signs in. The browser remembers whose work it holds and what has not reached the server; signing out clears it. A browser used before accounts gives its work to the first learner who signs in with nothing saved; otherwise its program is kept in My projects as “(from this browser)”. |
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
