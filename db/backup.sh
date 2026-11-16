#!/usr/bin/env bash
# Backup the Campus Repair database and uploads folder.
#
#   DB_HOST=127.0.0.1 DB_NAME=campus_repair DB_USER=root DB_PASSWORD='' \
#   UPLOADS_DIR=/opt/lampp/htdocs/campus-repair/uploads ./db/backup.sh ./backups
#
# Requires mysqldump and tar. Run from the project root.
set -euo pipefail

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-campus_repair}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
UPLOADS_DIR="${UPLOADS_DIR:-$(cd "$(dirname "$0")/.." && pwd)/public/uploads}"
OUT_DIR="${1:-./backups}"

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DB_FILE="$OUT_DIR/db-$STAMP.sql"
UPLOAD_FILE="$OUT_DIR/uploads-$STAMP.tar.gz"

DUMP_BIN="${MYSQLDUMP:-$(command -v mysqldump || command -v mariadb-dump || true)}"
if [[ -z "$DUMP_BIN" ]]; then
  echo "ไม่พบ mysqldump/mariadb-dump — ติดตั้ง MariaDB client หรือตั้ง MYSQLDUMP=/path/to/dump" >&2
  exit 1
fi

MYSQL_ARGS=(--host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --single-transaction --routines --triggers)
if [[ -n "$DB_PASSWORD" ]]; then
  MYSQL_ARGS+=("--password=$DB_PASSWORD")
fi

"$DUMP_BIN" "${MYSQL_ARGS[@]}" "$DB_NAME" > "$DB_FILE"
tar -czf "$UPLOAD_FILE" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"

echo "database: $DB_FILE"
echo "uploads:  $UPLOAD_FILE"
