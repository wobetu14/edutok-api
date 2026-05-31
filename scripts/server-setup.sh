#!/usr/bin/env bash
# EduTok EC2 provisioning script
# Run once as ubuntu user: bash server-setup.sh
set -e

###############################################################################
# 1. System packages
###############################################################################
echo "==> Updating system packages"
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y git curl unzip build-essential

###############################################################################
# 2. Node.js 20 via nvm
###############################################################################
echo "==> Installing Node.js 20 via nvm"
if [ ! -d "$HOME/.nvm" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi

export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"

nvm install 20
nvm use 20
nvm alias default 20

echo "Node: $(node -v)  npm: $(npm -v)"

###############################################################################
# 3. PM2
###############################################################################
echo "==> Installing PM2"
npm install -g pm2
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | sudo bash

###############################################################################
# 4. MySQL 8
###############################################################################
echo "==> Installing MySQL 8"
sudo apt-get install -y mysql-server

echo "==> Configuring MySQL"
# Secure defaults — change the root password below before running
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'RootPassword123!';"
sudo mysql -u root -pRootPassword123! -e "
  CREATE DATABASE IF NOT EXISTS edutok_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'edutok_user'@'localhost' IDENTIFIED BY 'EdutokDbPass123!';
  GRANT ALL PRIVILEGES ON edutok_db.* TO 'edutok_user'@'localhost';
  FLUSH PRIVILEGES;
"

echo "MySQL ready: database=edutok_db  user=edutok_user"

###############################################################################
# 5. Clone repos
###############################################################################
echo "==> Cloning repositories"
sudo mkdir -p /var/www
sudo chown ubuntu:ubuntu /var/www

# API
if [ ! -d /var/www/edutok-api ]; then
  git clone https://github.com/wobetu14/edutok-api.git /var/www/edutok-api
else
  echo "edutok-api already cloned, pulling latest"
  git -C /var/www/edutok-api pull origin master
fi

# Dashboard
if [ ! -d /var/www/edutok-dashboard ]; then
  git clone https://github.com/wobetu14/edutok-dashboard.git /var/www/edutok-dashboard
else
  echo "edutok-dashboard already cloned, pulling latest"
  git -C /var/www/edutok-dashboard pull origin master
fi

###############################################################################
# 6. API — .env + build + migrate + start
###############################################################################
echo "==> Configuring API"
cd /var/www/edutok-api

cat > .env <<'ENV'
NODE_ENV=production
PORT=3000

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL="mysql://edutok_user:EdutokDbPass123!@localhost:3306/edutok_db"

# ── JWT ───────────────────────────────────────────────────────────────────────
# Generate strong secrets: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET=REPLACE_WITH_STRONG_SECRET_64_CHARS
JWT_REFRESH_SECRET=REPLACE_WITH_DIFFERENT_STRONG_SECRET_64_CHARS
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Cloudinary ────────────────────────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=REPLACE_WITH_YOUR_CLOUD_NAME
CLOUDINARY_API_KEY=REPLACE_WITH_YOUR_API_KEY
CLOUDINARY_API_SECRET=REPLACE_WITH_YOUR_API_SECRET

# ── SMTP (nodemailer) ─────────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=REPLACE_WITH_YOUR_EMAIL
SMTP_PASS=REPLACE_WITH_YOUR_APP_PASSWORD
SMTP_FROM="EduTok <noreply@edutok.app>"

# ── CORS origin ───────────────────────────────────────────────────────────────
CLIENT_URL=http://edutok-dashboard
ENV

echo ".env written — fill in REPLACE_WITH_* values before starting"

npm install --include=dev
npm run build
npx prisma generate
npx prisma migrate deploy
npm run db:seed

pm2 start dist/server.js --name edutok-api
pm2 save

###############################################################################
# 7. Dashboard — .env + build
###############################################################################
echo "==> Building dashboard"
cd /var/www/edutok-dashboard

cat > .env.production <<'ENV'
VITE_API_URL=http://edutokapi/api
ENV

npm ci
npm run build        # outputs to /var/www/edutok-dashboard/dist

###############################################################################
# 8. Nginx configuration
###############################################################################
echo "==> Configuring nginx"

# ── edutokapi (API reverse proxy on port 3000) ────────────────────────────────
sudo tee /etc/nginx/sites-available/edutokapi > /dev/null <<'NGINX'
server {
    listen 80;
    server_name edutokapi;

    # Allow large file uploads (Cloudinary proxy through API)
    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
}
NGINX

# ── edutok-dashboard (static Vite build) ──────────────────────────────────────
sudo tee /etc/nginx/sites-available/edutok-dashboard > /dev/null <<'NGINX'
server {
    listen 80;
    server_name edutok-dashboard;

    root /var/www/edutok-dashboard/dist;
    index index.html;

    # Single-page application — route everything to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long-cache for hashed assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
}
NGINX

# Enable both sites
sudo ln -sf /etc/nginx/sites-available/edutokapi     /etc/nginx/sites-enabled/edutokapi
sudo ln -sf /etc/nginx/sites-available/edutok-dashboard /etc/nginx/sites-enabled/edutok-dashboard

# Remove default site to avoid conflicts
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx

###############################################################################
# Done
###############################################################################
echo ""
echo "======================================================="
echo " EduTok provisioning complete"
echo "======================================================="
echo " API:       http://edutokapi        (PM2: edutok-api)"
echo " Dashboard: http://edutok-dashboard (static via nginx)"
echo ""
echo " IMPORTANT: edit /var/www/edutok-api/.env and fill in:"
echo "   JWT_ACCESS_SECRET / JWT_REFRESH_SECRET"
echo "   CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET"
echo "   SMTP credentials"
echo " Then run:  pm2 restart edutok-api"
echo "======================================================="
pm2 status
