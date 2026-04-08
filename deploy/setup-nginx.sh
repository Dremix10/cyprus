#!/usr/bin/env bash
set -euo pipefail

echo "Installing nginx..."
apt-get install -y nginx

echo "Setting up config..."
cp /home/dev/cyprus/deploy/nginx-cyprus.conf /etc/nginx/sites-available/cyprus
sed -i 's/YOUR_DOMAIN/165.245.175.45/' /etc/nginx/sites-available/cyprus
ln -sf /etc/nginx/sites-available/cyprus /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "Testing config..."
nginx -t

echo "Restarting nginx..."
systemctl restart nginx

echo "Done! Game at http://165.245.175.45 | Admin at http://165.245.175.45/admin"
