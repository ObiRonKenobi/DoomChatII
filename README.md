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

## Deploy (Fly.io)

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly auth login
fly launch --no-deploy   # or use included fly.toml
fly volumes create doomchat_data --size 1
fly deploy
```

The app listens on `$PORT`, serves static files and `/ws` on the same port, and stores SQLite data on `/data`.

### Railway (fallback)

Use the same `Dockerfile`, set `PORT` and mount a volume at `/data`.

### Replit (demo only)

```bash
go run .
```

Not recommended for production — free tier sleeps on idle.

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
Dockerfile    Container build
fly.toml      Fly.io config
```

## License

TBD
