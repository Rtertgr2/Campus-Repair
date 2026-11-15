#!/usr/bin/env bash
#
# Campus Repair — เตรียม Ubuntu Server LTS (22.04/24.04)
# รันบนเซิร์ฟเวอร์:  sudo bash setup-ubuntu.sh
#
# ติดตั้ง Apache + mod_php, MariaDB, certbot, Node 20, rsync
# แล้วสร้างโฟลเดอร์เว็บ/ซอร์สและตั้งสิทธิ์ให้ www-data
#
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/campus-repair}"
SRC_DIR="${SRC_DIR:-/opt/campus-repair/src}"

export DEBIAN_FRONTEND=noninteractive

echo "==> ติดตั้งแพ็กเกจ"
sudo apt update
sudo apt install -y \
  apache2 mariadb-server rsync certbot \
  php php-mysql php-mbstring php-gd php-curl php-xml libapache2-mod-php

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  echo "==> ติดตั้ง Node.js 20 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

echo "==> เปิด Apache modules ที่ต้องใช้"
sudo a2enmod rewrite headers ssl
sudo systemctl enable --now apache2 mariadb

echo "==> สร้างโฟลเดอร์"
sudo mkdir -p "$APP_DIR/api/uploads" "$APP_DIR/api/storage" "$SRC_DIR"
sudo chown -R www-data:www-data "$APP_DIR"
sudo chmod 775 "$APP_DIR/api/uploads" "$APP_DIR/api/storage"

echo
echo "ติดตั้งแพ็กเกจเสร็จแล้ว"
echo "  เว็บ:   $APP_DIR"
echo "  ซอร์ส:  $SRC_DIR"
echo
echo "ขั้นต่อไป:"
echo "  1) สร้างฐานข้อมูล + user (ดู README.md หัวข้อ 2)"
echo "  2) คัดลอกโค้ดขึ้น $SRC_DIR แล้วรัน update-campus-repair.sh"
echo "  3) ตั้งค่า vhost จาก apache-campus-repair.conf"
