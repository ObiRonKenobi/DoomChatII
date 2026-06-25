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

## Deploy (Oracle Cloud + Cloudflare — recommended)

**Cost:** $0 on OCI Always Free + $0 on Cloudflare (quick tunnel or named tunnel).  
**URL:** `https://random.trycloudflare.com` (quick) or `https://chat.yourdomain.com` (stable).

> **Oracle note:** OCI signup may ask for a credit card for identity verification; you are not charged if you stay within Always Free limits.  
> **Cloudflare note:** A free Cloudflare account does **not** require a credit card.

### Overview

```text
Browser ──HTTPS/WSS──► Cloudflare Tunnel ──► VM:8080 ──► DoomChat Docker
                              ▲
                         (outbound only;
                      no open port 8080 needed)
```

### Part A — Create Oracle Always Free VM

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
2. **Compute → Instances → Create instance**
3. **Name:** `doomchat`
4. **Image:** Ubuntu 22.04 (Always Free eligible)
5. **Shape:** `VM.Standard.A1.Flex` — 1 OCPU, 6 GB RAM (or 2/12 if capacity allows)
   - If **Out of capacity**, try another availability domain or region, or use `VM.Standard.E2.1.Micro` (AMD, slower)
6. **Networking:** assign a **public IPv4**
7. **SSH keys:** paste your public key (`~/.ssh/id_ed25519.pub`)
8. **Create**

**Security list (firewall):** allow **SSH (22)** from your IP. You do **not** need to open 8080 — Cloudflare connects outbound.

SSH in:

```bash
ssh ubuntu@YOUR_VM_PUBLIC_IP
```

### Part B — Install DoomChat on the VM

```bash
git clone https://github.com/ObiRonKenobi/DoomChatII.git /opt/doomchat-ii
cd /opt/doomchat-ii
chmod +x deploy/*.sh
./deploy/setup-vm.sh
curl -s http://127.0.0.1:8080/health   # → ok
```

### Part C — Cloudflare Tunnel (pick one)

#### Option 1: Quick tunnel (easiest, no domain)

No Cloudflare domain setup. Random free HTTPS URL.

```bash
cd /opt/doomchat-ii
./deploy/setup-cloudflared-quick.sh
sudo journalctl -u cloudflared-doomchat.service -n 30   # find https://....trycloudflare.com
```

Set `BASE_URL` and restart:

```bash
echo 'BASE_URL=https://YOUR-trycloudflare-URL' > .env
docker compose up -d
```

**Catch:** URL changes if the tunnel service restarts.

#### Option 2: Named tunnel (stable URL, needs a domain)

1. Create a **free Cloudflare account** at [dash.cloudflare.com](https://dash.cloudflare.com)
2. Add your domain (Cloudflare free plan)
3. On your **local machine** (with a browser): `cloudflared tunnel login`
4. Copy credentials to the VM: `scp -r ~/.cloudflared ubuntu@YOUR_VM_IP:~/.cloudflared`
5. On the VM: `./deploy/setup-cloudflared-named.sh chat.yourdomain.com`

### Updates

```bash
cd /opt/doomchat-ii && git pull && docker compose build && docker compose up -d
```

See [`deploy/`](deploy/) for setup scripts.

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
Dockerfile         Container build
docker-compose.yml Local / VM deploy
deploy/            Oracle + Cloudflare setup scripts
fly.toml           Fly.io config (optional, paid)
```

## License

TBD
