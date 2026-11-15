#!/usr/bin/env bash
#
# Campus Repair — ส่งซอร์สจากเครื่อง Windows (Git Bash) ไปเซิร์ฟเวอร์ Linux
#
# ต้องมี rsync + ssh ใน Git Bash (หรือใช้ scp/WinSCP แทน)
#
#   SERVER=admin@repair.school.ac.th bash ops/linux/sync-from-windows.sh
#
# แล้วไปรันบนเซิร์ฟเวอร์:
#   sudo bash /opt/campus-repair/src/ops/linux/update-campus-repair.sh
#
# ตัวแปร: SERVER (บังคับ), DEST (ค่าเริ่มต้น /opt/campus-repair/src)
#
set -euo pipefail

SERVER="${SERVER:?ตั้ง SERVER=user@host ก่อนรัน}"
DEST="${DEST:-/opt/campus-repair/src}"

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'deploy' \
  --exclude '.tools' \
  --exclude '.freebuff' \
  ./ "$SERVER:$DEST/"

echo "ซอร์สขึ้นเซิร์ฟเวอร์แล้ว: $SERVER:$DEST"
echo "ขั้นต่อไป: ssh $SERVER 'sudo bash $DEST/ops/linux/update-campus-repair.sh'"
