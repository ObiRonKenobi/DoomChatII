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
| `/theme matrix` | Themes: matrix, amber, cobalt, snow, vintage, dracula, spawn, merica |
| `/font Fira Code` | Fonts: Courier New, IBM Plex Mono, Fira Code, JetBrains Mono, Lucida Console |
| `/trivia` | Ask one random question (30s, answer revealed if unsolved) |
| `/trivia start` / `stop` | Continuous random trivia game in chat pane |
| `/rooms` | List public rooms with numbers |
| `/rooms <#>` | Switch to a room by its list number |
| `/list` | List public rooms and user counts |
| `/users` | List users in the current room (or `/users #room`) |
| `/brimley` | Toggle VISUAL AIDS MODE (larger, bolder text) |
| `/boards` | List message boards |
| `/board create Name` | Create a board |
| `/threads Board` | List threads |
| `/thread create Board Title` | New thread |
| `/posts <id>` | List posts in thread |
| `/post <id> body` | Reply to thread |
| `/logout` | Clear session |
| `/help` | Show commands |

## Architecture

- **Server:** Go single binary — WebSocket hub, rooms, sessions, SQLite boards + chat history, trivia
- **Client:** Static HTML/CSS/JS — dual xterm panes (chat 2/3, system 1/3)
- **Sessions:** Client UUID in localStorage; server restores nick/rooms on WS reconnect within 30s
- **History:** Chat and trivia messages persist in SQLite for 24 hours per room

## Deploy (Oracle Cloud Always Free)

**Cost:** $0 on Always Free tier. **URL:** `http://YOUR_PUBLIC_IP:8080` — no domain required.

> OCI signup may ask for a credit card for identity verification; stay within Always Free limits to avoid charges.

### 1. Create the VM

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
2. **Compute → Instances → Create instance**
3. **Ubuntu 22.04**, shape **VM.Standard.A1.Flex** (1 OCPU / 6 GB) or **E2.1.Micro** if A1 is unavailable
4. Assign a **public IPv4** and add your **SSH public key**
5. **Create** — note the public IP address

### 2. Open firewall ports

On the instance subnet **Security list**, add ingress rules:

| Source | Port | Purpose |
|--------|------|---------|
| Your IP (recommended) or `0.0.0.0/0` | 22 | SSH |
| `0.0.0.0/0` | 8080 | DoomChat (HTTP + WebSocket) |

If Ubuntu firewall is enabled on the VM: `sudo ufw allow 8080/tcp`

### 3. Install and run

SSH into the VM (replace with your username and IP):

```bash
ssh ubuntu@YOUR_PUBLIC_IP
```

On the VM:

```bash
git clone https://github.com/ObiRonKenobi/DoomChatII.git /opt/doomchat-ii
cd /opt/doomchat-ii
chmod +x deploy/*.sh
./deploy/setup-vm.sh

echo "BASE_URL=http://YOUR_PUBLIC_IP:8080" > .env
sudo docker compose up -d --build
```

Chat history is stored in a Docker volume (`doomchat_data`) mounted at `/data` inside the container — it survives container restarts and redeploys.

### 4. Use it

Open **http://YOUR_PUBLIC_IP:8080** in a browser.

```bash
curl http://YOUR_PUBLIC_IP:8080/health   # → ok
```

Hard-refresh after updates: **Ctrl+Shift+R** (desktop) or clear cache / reload (mobile).

### 5. Deploy updates

**On your dev machine** — push changes to GitHub:

```bash
cd /path/to/DoomChatII
# bump version in release.txt (line 1) and summarize changes
git add -A
git commit -m "Describe your changes"
git push origin main
```

**On the VM** — pull, rebuild, restart (does **not** delete chat history):

```bash
ssh ubuntu@YOUR_PUBLIC_IP
cd /opt/doomchat-ii
git pull
sudo docker compose build doomchat
sudo docker compose up -d
curl http://127.0.0.1:8080/health
```

New connects see a `[server]` update line in chat when the version in `release.txt` changes. Bump line 1 of `release.txt` before each publish.

### Optional later: HTTPS + domain

See [`deploy/`](deploy/) for Cloudflare tunnel scripts when you want `https://` and a custom domain. Not required for IP-only use.

## Project layout

```
main.go            Server entry, HTTP routes
hub.go             WebSocket hub and client registry
client.go          Per-connection message handling
room.go            Room management
session.go         Session persistence (in-memory TTL)
history.go         24h chat/trivia message log
db.go              SQLite schema
chat_db.go         Chat message persistence
boards.go          Board command handlers
trivia.go          Trivia bot
release.go         Version announcements
protocol.go        Wire message types
web/               Frontend (xterm.js)
trivia.json        Question bank
Dockerfile         Container build
docker-compose.yml VM / local deploy with persistent volume
deploy/            Oracle setup scripts
```

## License

TBD
