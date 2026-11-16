<?php
declare(strict_types=1);
/**
 * Creates or resets a staff account.
 *
 *   php db/create-staff.php --name="สมชาย" --pin=1234 --role=technician
 *   php db/create-staff.php --name="ผู้ดูแล" --pin=1234 --role=admin
 *   php db/create-staff.php --list
 *
 * Reads the connection from public/api/config.php. Run db/migrate.php first.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../public/api/db.php';

$options = getopt('', ['name:', 'pin:', 'role:', 'list']);
$config = require __DIR__ . '/../public/api/config.php';
$db = openDatabase($config);

try {
    $db->query('SELECT 1 FROM staff_users LIMIT 1');
} catch (PDOException $e) {
    if ($e->getCode() === '42S02') {
        fwrite(STDERR, "ยังไม่มีตาราง staff_users — รัน php db/migrate.php ก่อน\n");
        exit(1);
    }
    throw $e;
}

if (isset($options['list'])) {
    $rows = $db->query('SELECT id, name, role, active, failed_attempts, locked_until FROM staff_users ORDER BY id')->fetchAll();
    foreach ($rows as $row) {
        echo sprintf(
            "#%d %s [%s] (active=%s, failed=%d%s)\n",
            $row['id'],
            $row['name'],
            $row['role'],
            $row['active'] ? 'yes' : 'no',
            $row['failed_attempts'],
            $row['locked_until'] ? ', locked until ' . $row['locked_until'] : ''
        );
    }
    exit(0);
}

$name = trim((string) ($options['name'] ?? ''));
$pin = (string) ($options['pin'] ?? '');
$role = (string) ($options['role'] ?? '');
if ($name === '' || strlen($name) > 191) {
    fwrite(STDERR, "ต้องระบุ --name=\"ชื่อเจ้าหน้าที่\" (ไม่เกิน 191 ตัวอักษร)\n");
    exit(1);
}
if (!preg_match('/^[0-9]{4,}$/D', $pin)) {
    fwrite(STDERR, "ต้องระบุ --pin=ตัวเลขอย่างน้อย 4 หลัก\n");
    exit(1);
}
$roles = ['admin', 'technician', 'viewer'];
if ($role !== '' && !in_array($role, $roles, true)) {
    fwrite(STDERR, "--role ต้องเป็น admin, technician หรือ viewer\n");
    exit(1);
}

$query = $db->prepare(
    'INSERT INTO staff_users (name, pin_hash, role, active) VALUES (?, ?, ?, 1) '
    . 'ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), active = 1, failed_attempts = 0, locked_until = NULL, '
    . 'role = IF(? = \'\', role, VALUES(role))'
);
$query->execute([$name, password_hash($pin, PASSWORD_DEFAULT), $role !== '' ? $role : 'technician', $role]);
echo "บันทึกบัญชีเจ้าหน้าที่ \"{$name}\" แล้ว" . ($role !== '' ? " (role={$role})" : "") . "\n";
