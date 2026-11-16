<?php
declare(strict_types=1);
/**
 * Applies the current MySQL schema to a fresh or existing database.
 *
 *   php db/migrate.php
 *
 * Reads the connection from public/api/config.php (environment or config.local.php).
 * Safe to re-run: creates missing tables/columns/indexes and records the version
 * in schema_migrations.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../public/api/db.php';

$config = require __DIR__ . '/../public/api/config.php';
$db = openDatabase($config);

const SCHEMA_VERSION = '2026-11-16-staff-roles';
const STATUSES = ['รอแก้ไข', 'รับเรื่องแล้ว', 'กำลังซ่อม', 'รออะไหล่', 'ปิดงานแล้ว', 'ซ่อมไม่ได้', 'ยกเลิก'];

function hasColumn(PDO $db, string $table, string $column): bool
{
    $rows = $db->query('SHOW COLUMNS FROM `' . $table . '`')->fetchAll();
    return in_array($column, array_column($rows, 'Field'), true);
}

function addColumn(PDO $db, string $table, string $column, string $definition): void
{
    if (hasColumn($db, $table, $column)) return;
    $db->exec('ALTER TABLE `' . $table . '` ADD COLUMN `' . $column . '` ' . $definition);
    echo "  + {$table}.{$column}\n";
}

function hasIndex(PDO $db, string $table, string $index): bool
{
    $rows = $db->query('SHOW INDEX FROM `' . $table . '`')->fetchAll();
    return in_array($index, array_column($rows, 'Key_name'), true);
}

function addIndex(PDO $db, string $table, string $index, string $columns): void
{
    if (hasIndex($db, $table, $index)) return;
    $db->exec('ALTER TABLE `' . $table . '` ADD INDEX `' . $index . '` (' . $columns . ')');
    echo "  + index {$table}.{$index}\n";
}

function addForeign(PDO $db, string $table, string $name, string $sql): void
{
    try {
        $db->exec('ALTER TABLE `' . $table . '` ADD CONSTRAINT `' . $name . '` ' . $sql);
        echo "  + foreign key {$name}\n";
    } catch (PDOException $e) {
        // 1826 duplicate constraint, 1022 duplicate key, 1215 cannot add.
        if (!in_array($e->getCode(), ['42S21', '42000', 'HY000'], true)) throw $e;
    }
}

echo "Campus Repair migration\n";
$db->exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations ('
    . 'version VARCHAR(64) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);

$query = $db->prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
$query->execute([SCHEMA_VERSION]);
if ($query->fetchColumn() !== false) {
    echo "Already applied: " . SCHEMA_VERSION . "\n";
    exit(0);
}

// 1. Create everything that does not exist yet (staff, sessions, zones, events).
$schema = file_get_contents(__DIR__ . '/schema.sql');
if ($schema === false) {
    fwrite(STDERR, "Cannot read db/schema.sql\n");
    exit(1);
}
$db->exec($schema);
echo "  base schema checked\n";

// 2. Upgrade an existing repair_jobs table in place.
$db->exec('ALTER TABLE repair_jobs MODIFY status ENUM(\'' . implode("','", STATUSES) . '\') NOT NULL DEFAULT \'รอแก้ไข\'');
echo "  status ENUM updated\n";

addColumn($db, 'staff_users', 'role', "ENUM('admin','technician','viewer') NOT NULL DEFAULT 'admin' AFTER pin_hash");

addColumn($db, 'repair_jobs', 'reporter_name', "VARCHAR(191) NOT NULL DEFAULT '' AFTER suggestion");
addColumn($db, 'repair_jobs', 'reporter_phone', "VARCHAR(64) NOT NULL DEFAULT '' AFTER reporter_name");
addColumn($db, 'repair_jobs', 'reporter_email', "VARCHAR(191) NOT NULL DEFAULT '' AFTER reporter_phone");
addColumn($db, 'repair_jobs', 'assigned_staff_id', 'BIGINT UNSIGNED NULL AFTER after_photo_path');
addColumn($db, 'repair_jobs', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
addColumn($db, 'repair_jobs', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

addIndex($db, 'repair_jobs', 'idx_repair_status', 'status');
addIndex($db, 'repair_jobs', 'idx_repair_zone', 'zone');
addIndex($db, 'repair_jobs', 'idx_repair_due', 'due_date');
addIndex($db, 'repair_jobs', 'idx_repair_created', 'created_date');
addIndex($db, 'repair_jobs', 'idx_repair_assigned', 'assigned_staff_id');
addForeign($db, 'repair_jobs', 'fk_repair_assigned_staff', 'FOREIGN KEY (assigned_staff_id) REFERENCES staff_users(id) ON DELETE SET NULL');

$insert = $db->prepare('INSERT INTO schema_migrations (version) VALUES (?)');
$insert->execute([SCHEMA_VERSION]);
echo "Applied: " . SCHEMA_VERSION . "\n";
