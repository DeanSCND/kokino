# Deployment Guide

> **Production Deployment Steps**
>
> **Last Updated:** 2026-01-26

---

## Overview

Kokino is designed for **localhost-first development** but can be deployed to a server for team use.

**Note:** Production deployment is not the primary use case. Most users run Kokino locally.

---

## Prerequisites

- Linux server (Ubuntu 22.04+ recommended)
- Node.js 20+
- SystemD or PM2 for process management
- nginx (optional, for reverse proxy)

---

## Deployment Steps

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should be 20.x
```

### 2. Clone and Install

```bash
cd /opt
sudo git clone https://github.com/yourusername/kokino.git
cd kokino
sudo npm install
```

### 3. Build UI

```bash
cd ui
npm run build  # → dist/
```

### 4. Configure Environment

**`broker/.env`:**
```bash
PORT=5050
NODE_ENV=production
DATABASE_PATH=/var/lib/kokino/kokino.db
```

**Create database directory:**
```bash
sudo mkdir -p /var/lib/kokino
sudo chown $USER:$USER /var/lib/kokino
```

### 5. Run with SystemD

**Create service file:** `/etc/systemd/system/kokino-broker.service`

```ini
[Unit]
Description=Kokino Broker
After=network.target

[Service]
Type=simple
User=kokino
WorkingDirectory=/opt/kokino/broker
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/kokino/broker/src/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

**Start service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable kokino-broker
sudo systemctl start kokino-broker

# Check status
sudo systemctl status kokino-broker
```

### 6. Serve UI with nginx

**nginx config:** `/etc/nginx/sites-available/kokino`

```nginx
server {
    listen 80;
    server_name kokino.example.com;

    # UI static files
    location / {
        root /opt/kokino/ui/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to broker
    location /api/ {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/kokino /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Monitoring

### Logs

```bash
# Broker logs
sudo journalctl -u kokino-broker -f

# nginx logs
sudo tail -f /var/log/nginx/access.log
```

### Health Checks

```bash
curl http://127.0.0.1:5050/health
curl http://127.0.0.1:5050/api/slo/status
```

---

## Backup

### Database Backup

```bash
# Automated daily backup
sudo crontab -e

0 2 * * * cp /var/lib/kokino/kokino.db /var/backups/kokino-$(date +\%Y\%m\%d).db
```

---

## Security Considerations

- **Authentication:** Not yet implemented (Phase 7 planned)
- **HTTPS:** Use Let's Encrypt with certbot
- **Firewall:** Restrict port 5050 to localhost only
- **Updates:** Monitor security advisories for dependencies

---

**For most users, run Kokino locally instead of deploying to a server.**
