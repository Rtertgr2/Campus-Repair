#!/usr/bin/env bash
#
# Campus Repair — build + deploy บนเซิร์ฟเวอร์
#
# ใช้หลังคัดลอกซอร์สไปที่ $SRC_DIR แล้ว (ดู sync-from-windows.sh)
#   sudo bash /opt/campus-repair/src/ops/linux/update-campus-repair.sh
#
# ค่าเริ่มต้น:
#   SRC_DIR=/opt/campus-repair/src  APP_DIR=/var/www/campus-repair  BASE_PATH=/campus-repair/
#
# สคริปต์นี้ "ไม่ทับ" api/config.php, api/uploads, api/storage ของจริง
#
set -euo pipefail

SRC_DIR="${SRC_DIR:-/opt/campus-repair/src}"
APP_DIR="${APP_DIR:-/var/www/campus-repair}"
BASE_PATH="${BASE_PATH:-/campus-repair/}"

if [ ! -f "$SRC_DIR/package.json" ]; then
  echo "ไม่พบซอร์สที่ $SRC_DIR (ต้องมี package.json)" >&2
  exit 1
fi

echo "==> npm ci"
cd "$SRC_DIR"
npm ci

echo "==> build (VITE_BASE_PATH=$BASE_PATH)"
VITE_BASE_PATH="$BASE_PATH" npm run build

echo "==> คัดลอกไฟล์ static ไป $APP_DIR"
# --delete ลบไฟล์เก่าที่ไม่มีใน dist แต่ต้องเก็บ api/ ไว้
rsync -a --delete --exclude 'api/' "$SRC_DIR/dist/" "$APP_DIR/"

echo "==> คัดลอก backend (ไม่ทับ config/uploads/storage)"
rsync -a "$SRC_DIR/api/" "$APP_DIR/api/" \
  --exclude 'config.php' \
  --exclude 'uploads/' \
  --exclude 'storage/'

echo "==> อัปเดต schema (ถ้ามีการเปลี่ยนแปลง)"
if [ -f "$APP_DIR/api/install.php" ]; then
  php "$APP_DIR/api/install.php"
  # ตัวติดตั้งไม่ควรอยู่ใน web root — เก็บไว้เฉพาะ source
  rm -f "$APP_DIR/api/install.php"
fi

echo "==> ตั้งสิทธิ์"
chown -R www-data:www-data "$APP_DIR"
chmod 775 "$APP_DIR/api/uploads" "$APP_DIR/api/storage"

echo "==> reload Apache"
systemctl reload apache2

echo "เสร็จ: https://<โดเมน>${BASE_PATH}"
