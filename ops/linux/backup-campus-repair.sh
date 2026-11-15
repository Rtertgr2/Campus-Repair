#!/usr/bin/env bash
#
# Campus Repair — สำรองข้อมูลรายวัน (DB + รูป) ไป NAS
#
# ติดตั้ง:
#   sudo install -m 755 ops/linux/backup-campus-repair.sh /usr/local/bin/campus-repair-backup.sh
#   sudo mkdir -p /etc/campus-repair
#   sudo tee /etc/campus-repair/backup.cnf >/dev/null <<'EOF'
#   [client]
#   user=campus
#   password=เปลี่ยนเป็นรหัสจริง
#   EOF
#   sudo chmod 600 /etc/campus-repair/backup.cnf
#
# cron (รันเป็น root):
#   0 2 * * * /usr/local/bin/campus-repair-backup.sh >> /var/log/campus-repair-backup.log 2>&1
#
# ปรับค่าได้ด้วย env: DB_NAME, MYSQL_CNF, BACKUP_DIR, APP_DIR, KEEP_DAYS
#
set -euo pipefail

DB_NAME="${DB_NAME:-campus_repair}"
MYSQL_CNF="${MYSQL_CNF:-/etc/campus-repair/backup.cnf}"
BACKUP_DIR="${BACKUP_DIR:-/mnt/nas/campus-repair}"
APP_DIR="${APP_DIR:-/var/www/campus-repair}"
KEEP_DAYS="${KEEP_DAYS:-14}"

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/$STAMP"

if [ ! -f "$MYSQL_CNF" ]; then
  echo "ไม่พบ $MYSQL_CNF — สร้างไฟล์ตามตัวอย่างในหัวไฟล์ก่อน" >&2
  exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
  echo "ไม่พบ $BACKUP_DIR — ตรวจว่า mount NAS อยู่หรือยัง" >&2
  exit 1
fi

mkdir -p "$DEST"

echo "[$(date -Is)] backup -> $DEST"
mysqldump --defaults-extra-file="$MYSQL_CNF" \
  --single-transaction --quick --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip > "$DEST/db.sql.gz"

tar czf "$DEST/uploads.tar.gz" -C "$APP_DIR/api" uploads

# เก็บเฉพาะรอบล่าสุด KEEP_DAYS วัน
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +

echo "[$(date -Is)] เสร็จ: $(du -sh "$DEST" | cut -f1) (เก็บ $KEEP_DAYS วัน)"
