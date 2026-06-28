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
| `/list` | List public rooms and user counts |
| `/users` | List users in the current room (or `/users #room`) |
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

## Deploy (Oracle Cloud — public IP)

**Cost:** $0 (Always Free VM). **URL:** `http://YOUR_PUBLIC_IP:8080` (no domain or Cloudflare needed to start).

> OCI signup may ask for a credit card for identity verification; stay within Always Free limits to avoid charges.

### 1. Create the VM

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
2. **Compute → Instances → Create instance**
3. **Ubuntu 22.04**, shape **VM.Standard.A1.Flex** (1 OCPU / 6 GB) or **E2.1.Micro** if out of capacity
4. Assign a **public IPv4**, paste your **SSH public key**
5. **Create** — note the public IP (e.g. `129.146.x.x`)

### 2. Open firewall ports

On the instance’s subnet **Security list**, add ingress rules:

| Source | Port | Purpose |
|--------|------|---------|
| `YOUR_IP/32` | 22 | SSH |
| `0.0.0.0/0` | 8080 | DoomChat (HTTP + WebSocket) |

For testing you can use `0.0.0.0/0` on 8080; tighten to your IP later if you prefer.

Also check **Ubuntu firewall** on the VM if enabled: `sudo ufw allow 8080/tcp`

### 3. Install and run

**From your home machine**, SSH into the VM (use your key if you created one during setup):

```bash
ssh -i ~/.ssh/doomchat_oci ubuntu@YOUR_PUBLIC_IP
```

Example: `ssh -i ~/.ssh/doomchat_oci ubuntu@150.136.168.78`

If you get `Permission denied (publickey)`, check the key path and permissions:

```bash
chmod 600 ~/.ssh/doomchat_oci
```

**On the VM**, clone and start the app:

```bash
git clone https://github.com/ObiRonKenobi/DoomChatII.git /opt/doomchat-ii
cd /opt/doomchat-ii
chmod +x deploy/*.sh
./deploy/setup-vm.sh

echo "BASE_URL=http://YOUR_PUBLIC_IP:8080" > .env
sudo docker compose up -d --build
```

Exit the VM when done: `exit`

### 4. Use it

Open in browser: **http://YOUR_PUBLIC_IP:8080**

WebSocket connects automatically as `ws://YOUR_PUBLIC_IP:8080/ws`.

```bash
curl http://YOUR_PUBLIC_IP:8080/health   # → ok
```

Hard-refresh after updates: **Ctrl+Shift+R** (desktop) or clear cache / reload (mobile).

### 5. Deploy updates (publish a new version)

Run these steps whenever you push changes to GitHub and want them live on the VM.

**A. On your home machine** (optional — only if you changed code locally and need to push first):

```bash
cd ~/Projects/DoomChatII
# edit release.txt — bump version on line 1, update bullet list
git add -A
git commit -m "Describe your changes"
git push origin main
```

**B. SSH into the VM** (from your home machine):

```bash
ssh -i ~/.ssh/doomchat_oci ubuntu@YOUR_PUBLIC_IP
```

**C. On the VM**, pull, rebuild, and restart:

```bash
cd /opt/doomchat-ii
git pull
sudo docker compose build doomchat
sudo docker compose up -d
```

**D. Verify** (still on the VM):

```bash
sudo docker compose ps
curl http://127.0.0.1:8080/health
```

You should see the container **Up (healthy)** and `curl` should print `ok`.

**E. Exit SSH and reload the app in your browser:**

```bash
exit
```

Open **http://YOUR_PUBLIC_IP:8080** and hard-refresh. New connects show the `[server]` release notes in the SYSTEM pane (once per version).

**Notes:**

- Before each publish, bump the version on **line 1** of [`release.txt`](release.txt) and edit the bullet list. The server announces it on connect and reminds users to reload.
- Chat messages live in SQLite on the Docker `/data` volume — they survive restarts and keep their original 24-hour expiry.
- If SSH times out, your home IP may have changed; update the Oracle security list ingress rule for port **22**.

### Optional later: HTTPS + domain

Add Cloudflare (quick or named tunnel) when you want `https://` — see [`deploy/`](deploy/) scripts. Not required for IP-only testing.

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
