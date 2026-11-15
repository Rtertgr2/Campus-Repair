<?php
/**
 * ติดตั้ง/อัปเดตโครงสร้างฐานข้อมูลจาก api/schema.sql
 *
 * ใช้ได้ 2 ทาง
 *   เปิดเบราว์เซอร์ : http://localhost/campus-repair/api/install.php
 *   command line    : php api/install.php
 *
 * รันซ้ำได้ทุกครั้ง เพราะทุกคำสั่งเป็น CREATE TABLE IF NOT EXISTS
 * หลังติดตั้งสำเร็จจะเขียน api/storage/install.lock — ตัวติดตั้งจะไม่ยอมทำงานซ้ำ
 * ผ่านเบราว์เซอร์อีก (กันคนอื่นกดติดตั้งทับ) แต่ยังรันซ้ำได้ทาง command line
 * หรือเมื่อส่ง ?token=<install_token>
 */

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/photos.php';
require __DIR__ . '/lib/maintenance.php';

/**
 * ตัวติดตั้งทำงานได้เฉพาะ
 *   - command line (php api/install.php)
 *   - เรียกจากเครื่องเซิร์ฟเวอร์เอง (127.0.0.1 / ::1) และยังไม่ได้ตั้ง install_token
 *   - เรียกพร้อม ?token=<install_token> (ถ้าตั้ง token ไว้ ต้องส่งเสมอ)
 */
function cr_install_allowed()
{
    if (PHP_SAPI === 'cli') {
        return true;
    }

    $token = (string) cr_config('install_token', '');
    $supplied = isset($_GET['token']) ? (string) $_GET['token'] : '';

    if ($token !== '') {
        return $supplied !== '' && hash_equals($token, $supplied);
    }

    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    return $ip === '127.0.0.1' || $ip === '::1' || $ip === '::ffff:127.0.0.1';
}

/** เพิ่มคอลัมน์ที่ schema.sql รุ่นก่อนยังไม่มี (idempotent) */
function cr_install_migrate(PDO $db)
{
    $wanted = array(
        'room' => "VARCHAR(64) NOT NULL DEFAULT '' AFTER zone",
        'reporter_name' => "VARCHAR(191) NOT NULL DEFAULT '' AFTER suggestion",
        'reporter_contact' => "VARCHAR(64) NOT NULL DEFAULT '' AFTER reporter_name",
    );

    $added = array();
    foreach ($wanted as $column => $definition) {
        $check = $db->prepare(
            'SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?'
        );
        $check->execute(array('repair_jobs', $column));
        if ((int) $check->fetchColumn() > 0) {
            continue;
        }
        $db->exec('ALTER TABLE repair_jobs ADD COLUMN `' . $column . '` ' . $definition);
        $added[] = $column;
    }

    $indexCheck = $db->prepare(
        'SELECT COUNT(*) FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?'
    );
    $indexCheck->execute(array('repair_jobs', 'repair_jobs_due_idx'));
    if ((int) $indexCheck->fetchColumn() === 0) {
        $db->exec('ALTER TABLE repair_jobs ADD KEY repair_jobs_due_idx (due_date)');
        $added[] = 'index repair_jobs_due_idx';
    }

    return $added;
}

$isCli = PHP_SAPI === 'cli';
if (!$isCli) {
    header('Content-Type: text/plain; charset=utf-8');

    if (!cr_install_allowed()) {
        http_response_code(403);
        echo '403 — ปิดการเข้าถึงตัวติดตั้งเมื่อเรียกจากเครื่องอื่น' . PHP_EOL . PHP_EOL;
        echo 'วิธีที่อนุญาต:' . PHP_EOL;
        echo '  1) เปิดจากเครื่องเซิร์ฟเวอร์เอง (127.0.0.1) ขณะยังไม่ตั้ง install_token' . PHP_EOL;
        echo '  2) ตั้ง install_token ใน api/config.php แล้วเรียก api/install.php?token=<token>' . PHP_EOL;
        echo '  3) รันบน command line: php api/install.php' . PHP_EOL . PHP_EOL;
        echo 'หลังติดตั้งเสร็จควรลบไฟล์นี้' . PHP_EOL;
        exit;
    }

    if (cr_install_locked()) {
        http_response_code(403);
        echo '403 — ระบบนี้ติดตั้งเสร็จแล้ว (พบ api/storage/install.lock)' . PHP_EOL . PHP_EOL;
        echo 'ถ้าต้องการอัปเดตโครงสร้างตาราง:' . PHP_EOL;
        echo '  php api/install.php            (บน command line)' . PHP_EOL;
        echo '  หรือลบไฟล์ api/storage/install.lock แล้วเปิดหน้านี้ใหม่' . PHP_EOL;
        exit;
    }
}

cr_bootstrap_runtime();

$config = cr_config('db');
echo 'Campus Repair — database installer' . PHP_EOL;
echo 'host: ' . $config['host'] . ':' . $config['port'] . PHP_EOL;
echo 'database: ' . $config['name'] . PHP_EOL;
echo 'user: ' . $config['user'] . PHP_EOL . PHP_EOL;

try {
    $db = cr_db();
} catch (Throwable $e) {
    echo 'ERROR: ' . $e->getMessage() . PHP_EOL;
    if ($isCli) {
        exit(1);
    }
    exit;
}

$schemaPath = __DIR__ . '/schema.sql';
$sql = @file_get_contents($schemaPath);
if ($sql === false) {
    echo 'ERROR: อ่านไฟล์ api/schema.sql ไม่ได้' . PHP_EOL;
    if ($isCli) {
        exit(1);
    }
    exit;
}

// ตัด comment แล้วแยกเป็นคำสั่ง (ไฟล์นี้ไม่มี ; อยู่ในสตริง)
$sql = preg_replace('/^\s*--.*$/m', '', $sql);
$parts = preg_split('/;\s*(\r?\n|$)/', $sql);
$statements = array();
foreach ((array) $parts as $part) {
    $part = trim($part);
    if ($part !== '') {
        $statements[] = $part;
    }
}

try {
    foreach ($statements as $statement) {
        $db->exec($statement);
    }
    echo 'OK: applied ' . count($statements) . ' statements' . PHP_EOL;

    $migrated = cr_install_migrate($db);
    echo $migrated
        ? 'OK: เพิ่มของใหม่ให้ฐานข้อมูลเดิม — ' . implode(', ', $migrated) . PHP_EOL
        : 'OK: โครงสร้างตารางเป็นรุ่นล่าสุดอยู่แล้ว' . PHP_EOL;
} catch (Throwable $e) {
    echo 'ERROR: ' . $e->getMessage() . PHP_EOL;
    if ($isCli) {
        exit(1);
    }
    exit;
}

if (!is_dir(CR_APP_DIR . '/uploads')) {
    @mkdir(CR_APP_DIR . '/uploads', 0775, true);
}
echo is_writable(CR_APP_DIR . '/uploads')
    ? 'OK: api/uploads เขียนได้' . PHP_EOL
    : 'WARNING: api/uploads เขียนไม่ได้ — รูปจะอัปโหลดไม่สำเร็จ' . PHP_EOL;

echo cr_gd_available()
    ? 'OK: gd เปิดอยู่ — รูปจะถูกย่อ/แปลงเป็น WebP ให้' . PHP_EOL
    : 'NOTE: gd ปิดอยู่ — รูปจะถูกเก็บตามที่เบราว์เซอร์ส่งมา' . PHP_EOL;

if (cr_write_install_lock()) {
    echo 'OK: เขียน api/storage/install.lock (ล็อกตัวติดตั้งแล้ว)' . PHP_EOL;
}

$warnings = cr_health_warnings();
if ($warnings) {
    echo PHP_EOL . 'คำแนะนำหลังติดตั้ง:' . PHP_EOL;
    foreach ($warnings as $warning) {
        echo '  - ' . $warning['message'] . PHP_EOL;
    }
}

echo PHP_EOL . 'เสร็จแล้ว — หลังติดตั้งสำเร็จควรลบหรือจำกัดการเข้าถึงไฟล์นี้' . PHP_EOL;
