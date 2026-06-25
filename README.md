# DoomChat II

Retro-themed IRC/BBS-style web chat with a terminal UI (xterm.js). Anonymous, accountless chat with tripcoded nicks, client-side encrypted private rooms, message boards, and a trivia bot.

## Privacy model

- **No P2P** — all traffic flows through the server over WebSocket
- **No accounts** — identity is nick + optional tripcode only
- **Tripcode secrets are never stored** — only the display name is saved in localStorage
- **Private rooms** use AES-256-GCM encryption in the browser; the server relays ciphertext only
- Client IPs are used only for lightweight abuse rate limiting and are not exposed to other users

## Quick start (local)

```bash
go run .
```

Open [http://localhost:8080](http://localhost:8080).

Environment variables (see [`.env.example`](.env.example)):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP/WebSocket listen port |
| `BASE_URL` | `http://localhost:8080` | Public URL for banners/links |
| `DATA_DIR` | `./data` | SQLite database directory |

## Commands

| Command | Description |
|---------|-------------|
| `/nick Name#secret` | Set tripcoded nick (`Name!hash`) |
| `/join #room` | Join a public room |
| `/join #room password` | Join encrypted room (derive key) |
| `/create private name pass` | Create password-encrypted room |
| `/part [#room]` | Leave a room |
| `/theme matrix` | Themes: matrix, amber, cobalt, snow, vintage, dracula, spawn |
| `/font Fira Code` | Fonts: Courier New, IBM Plex Mono, Fira Code, JetBrains Mono, Lucida Console |
| `/trivia` | Ask one random question (30s, answer revealed if unsolved) |
| `/trivia start` / `stop` | Continuous random trivia game in chat pane |
| `/list` | List public rooms and user counts |
| `/boards` | List message boards |
| `/board create Name` | Create a board |
| `/threads Board` | List threads |
| `/thread create Board Title` | New thread |
| `/posts <id>` | List posts in thread |
| `/post <id> body` | Reply to thread |
| `/logout` | Clear session |
| `/help` | Show commands |

## Architecture

- **Server:** Go single binary — WebSocket hub, rooms, sessions, SQLite boards, trivia
- **Client:** Static HTML/CSS/JS — dual xterm panes (chat 2/3, system 1/3)
- **Sessions:** Client UUID in localStorage; server restores nick/rooms on WS reconnect within 30s

## Deploy (Northflank — recommended)

Free **always-on** sandbox (2 services, no sleep). Good fit for WebSocket chat.

### 1. Sign up and connect GitHub

1. Go to [northflank.com](https://northflank.com) and create an account (Developer Sandbox).
2. **Account → VCS** → connect **GitHub** → authorize `ObiRonKenobi/DoomChatII`.

### 2. Create project and service

1. **Create project** (e.g. `doomchat`).
2. **Add service → Combined service** (build + deploy in one).
3. **Source:** GitHub → `ObiRonKenobi/DoomChatII` → branch `main`.
4. **Build:** Dockerfile → path `/Dockerfile`, context `/`.

### 3. Runtime settings

| Setting | Value |
|---------|--------|
| **Port** | `8080`, protocol **HTTP**, **public** |
| **Health check** | path `/health` |
| **Compute** | smallest sandbox plan (enough for chat MVP) |

**Environment variables:**

| Key | Value |
|-----|--------|
| `PORT` | `8080` |
| `DATA_DIR` | `/data` |
| `BASE_URL` | `https://YOUR-SERVICE-URL` (set after first deploy — see below) |

### 4. Persistent volume (message boards)

On the service → **Volumes**:

- Add volume (1 GB is plenty)
- **Container mount path:** `/data`

This keeps SQLite boards across restarts.

### 5. Deploy

Click **Create service** / **Deploy**. First build takes a few minutes.

### 6. Your public URL

Northflank assigns HTTPS automatically, e.g.:

```text
https://p01--doomchat--xxxxxx.code.run
```

Find it under **Ports & DNS** on the service page.

Then update `BASE_URL` to that URL and redeploy (or edit env var and restart).

WebSocket URL will be `wss://p01--doomchat--xxxxxx.code.run/ws` (same host, auto TLS).

### 7. Verify

```bash
curl https://YOUR-SERVICE-URL/health   # → ok
```

Open the URL in a browser, set a nick, chat in `#lobby`.

### Custom domain (optional)

**Account → Domains** → add your domain → link it to the public port on this service.

---

## Deploy (Fly.io — paid)

Fly.io no longer has a free tier for new accounts. Use only if you add a payment method (~$3–5+/month).

```bash
fly auth login
fly volumes create doomchat_data --region iad --size 1
fly deploy
```

## Project layout

```
main.go       Server entry, HTTP routes
hub.go        WebSocket hub and client registry
client.go     Per-connection message handling
room.go       Room management
session.go    Session persistence (in-memory TTL)
db.go         SQLite boards
boards.go     Board command handlers
trivia.go     Trivia bot
protocol.go   Wire message types
web/          Frontend (xterm.js)
trivia.json   Question bank
Dockerfile    Container build (Northflank, Railway, etc.)
fly.toml      Fly.io config (optional, paid)
```

## License

TBD
