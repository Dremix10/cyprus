# Cyprus (Tichu) - Deployment Guide

Instructions for deploying on a Digital Ocean droplet that already has other projects running.

## What This Is

A multiplayer Tichu card game. Full-stack TypeScript app:
- **Frontend**: React + Vite (served as static files in production)
- **Backend**: Express + Socket.IO (WebSockets, must be long-running process)
- **No database** — in-memory game state with optional file-based game logs

The Express server serves both the API/WebSocket endpoint AND the static client build on a single port (3001).

## Prerequisites

- Docker and Docker Compose installed
- Nginx installed (for reverse proxy)
- A domain/subdomain pointed to this droplet's IP (e.g. `tichu.yourdomain.com`)
- Git access to https://github.com/Dremix10/cyprus.git

## Step 1: Clone and Build

```bash
cd /opt  # or wherever you keep projects
git clone https://github.com/Dremix10/cyprus.git
cd cyprus
docker compose up -d --build
```

Verify it's running:
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok"}
```

## Step 2: Nginx Reverse Proxy

Copy the provided nginx config:
```bash
sudo cp deploy/nginx-cyprus.conf /etc/nginx/sites-available/cyprus
sudo ln -s /etc/nginx/sites-available/cyprus /etc/nginx/sites-enabled/
```

Edit the config to set your domain:
```bash
sudo sed -i 's/YOUR_DOMAIN/tichu.yourdomain.com/' /etc/nginx/sites-available/cyprus
```

Test and reload:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Step 3: SSL with Certbot

```bash
sudo certbot --nginx -d tichu.yourdomain.com
```

Certbot will auto-modify the nginx config to add SSL and redirect HTTP to HTTPS.

## Step 4: Verify

- Visit `https://tichu.yourdomain.com` in a browser
- The game lobby should load
- Open browser dev tools > Network tab, filter by "WS" — you should see an active WebSocket connection

## Updating (After New Pushes)

```bash
cd /opt/cyprus
git pull
docker compose up -d --build
```

That's it. Docker rebuilds the image and restarts the container. Active games will be interrupted, but rooms auto-cleanup anyway.

## Troubleshooting

| Problem | Check |
|---------|-------|
| 502 Bad Gateway | `docker compose logs cyprus` — is the container running? |
| WebSocket fails | Nginx config must have `Upgrade` and `Connection` headers — see `deploy/nginx-cyprus.conf` |
| Can't connect | Firewall: `sudo ufw allow 80,443/tcp` |
| Container won't start | `docker compose logs --tail 50 cyprus` |

## Architecture Notes

- Port 3001 is only exposed to localhost (Nginx proxies external traffic)
- Game data volume persists across container restarts
- The `restart: unless-stopped` policy means it auto-starts after droplet reboot
- No env vars needed beyond what's in docker-compose.yml
