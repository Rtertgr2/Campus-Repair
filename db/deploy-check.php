<?php
declare(strict_types=1);
/**
 * ตรวจความพร้อมของเซิร์ฟเวอร์ก่อน/หลัง deploy (อ่านอย่างเดียว ไม่แก้อะไร)
 *
 *   php db/deploy-check.php
 *   php db/deploy-check.php --uploads=/opt/lampp/htdocs/campus-repair/uploads
 *
 * ตรวจ: PHP + ส่วนขยาย, config, ต่อ MySQL ได้, ตาราง/คอลัมน์ครบ (repair_jobs,
 * staff_users, staff_sessions, zones, repair_job_events), บัญชีเจ้าหน้าที่,
 * โฟลเดอร์ uploads เขียนได้และอยู่ใต้รากเว็บ, GD (thumbnail), โฟลเดอร์นับ
 * rate limit, พื้นที่ดิสก์
 *
 * อ่านค่าฐานข้อมูล/STAFF_PIN จาก public/api/config.php (environment หรือ config.local.php)
 * exit 0 = ผ่านทุกข้อ (คำเตือนไม่ทำให้ exit ผิด), exit 1 = มีข้อที่ต้องแก้ก่อนใช้งาน
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../public/api/db.php';
require __DIR__ . '/../public/api/photos.php';
require __DIR__ . '/../public/api/lib/ratelimit.php';

$options = getopt('', ['uploads:']);
$uploads = isset($options['uploads']) ? rtrim((string) $options['uploads'], '/') : uploadsDir();
$config = require __DIR__ . '/../public/api/config.php';

$counts = ['pass' => 0, 'warn' => 0, 'fail' => 0];

function report(string $status, string $label, string $detail = ''): void
{
    global $counts;
    $counts[$status]++;
    $marks = ['pass' => 'PASS', 'warn' => 'WARN', 'fail' => 'FAIL'];
    echo $marks[$status] . '  ' . $label . ($detail === '' ? '' : ' — ' . $detail) . PHP_EOL;
}

/** Column rows of $table, or null when the table has not been imported. */
function columnsOf(PDO $db, string $table): ?array
{
    try {
        return $db->query('SHOW COLUMNS FROM ' . $table)->fetchAll();
    } catch (PDOException $e) {
        if ($e->getCode() !== '42S02') throw $e;
        return null;
    }
}

/** Empty string when $dir exists (or can be created) and a probe file can be written. */
function writeProbe(string $dir): string
{
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) return 'สร้างโฟลเดอร์ไม่ได้';
    $probe = rtrim($dir, '/') . '/.deploy-check-' . bin2hex(random_bytes(4));
    if (@file_put_contents($probe, 'ok') === false) return 'เขียนไฟล์ไม่ได้ (ตรวจสิทธิ์ของ web server)';
    @unlink($probe);
    return '';
}

function formatBytes(float $bytes): string
{
    $units = ['B', 'KB', 'MB', 'GB'];
    $i = 0;
    while ($bytes >= 1024 && $i < count($units) - 1) {
        $bytes /= 1024;
        $i++;
    }
    return round($bytes, 1) . ' ' . $units[$i];
}

echo 'Campus Repair deploy check' . PHP_EOL;
echo 'uploads: ' . $uploads . PHP_EOL . PHP_EOL;

// ---------------------------------------------------------------- PHP runtime
$phpOk = version_compare(PHP_VERSION, '8.0', '>=');
report($phpOk ? 'pass' : 'fail', 'PHP ' . PHP_VERSION, $phpOk ? '' : 'ต้องใช้ PHP 8.0 ขึ้นไป (โค้ดใช้ match)');
report(extension_loaded('pdo_mysql') ? 'pass' : 'fail', 'ส่วนขยาย pdo_mysql', extension_loaded('pdo_mysql') ? '' : 'ขาดไม่ได้ — API ต่อฐานข้อมูลไม่ได้');
report(
    extension_loaded('gd') ? 'pass' : 'warn',
    'ส่วนขยาย gd (thumbnail 480px)',
    extension_loaded('gd') ? '' : 'ไม่มี GD = เก็บรูปเต็มและข้าม thumbnail (ยังใช้งานได้)'
);
report(
    extension_loaded('mbstring') ? 'pass' : 'warn',
    'ส่วนขยาย mbstring',
    extension_loaded('mbstring') ? '' : 'ไม่มี = นับความยาวข้อความแบบ fallback ช้ากว่า'
);

// --------------------------------------------------------------------- config
report('pass', 'config', $config['username'] . '@' . $config['host'] . ':' . $config['port'] . '/' . $config['database']);
$localConfig = __DIR__ . '/../public/api/config.local.php';
$hasLocalConfig = is_file($localConfig);
report($hasLocalConfig ? 'pass' : 'warn', 'public/api/config.local.php', $hasLocalConfig ? '' : 'ไม่พบ — ใช้ค่าจาก environment เท่านั้น');

// -------------------------------------------------------------------- database
$db = null;
try {
    $db = openDatabase($config);
    report('pass', 'เชื่อมต่อ MySQL ได้');
} catch (Throwable $e) {
    report('fail', 'เชื่อมต่อ MySQL ไม่ได้', $e->getMessage());
}

$pin = (string) ($config['staff_pin'] ?? '');
$staffCount = null;
if ($db !== null) {
    try {
        $staffCount = (int) $db->query('SELECT COUNT(*) FROM staff_users')->fetchColumn();
    } catch (Throwable $e) {
        $staffCount = null;
    }
}
if ($staffCount !== null && $staffCount > 0) {
    report('pass', 'บัญชีเจ้าหน้าที่', $staffCount . ' บัญชี');
} elseif (!preg_match('/^[0-9]{4,}$/D', $pin)) {
    report('fail', 'STAFF_PIN', $pin === '' ? 'ยังไม่มีบัญชีเจ้าหน้าที่ — ตั้ง STAFF_PIN หรือรัน php db/create-staff.php' : 'ต้องเป็นตัวเลขอย่างน้อย 4 หลัก');
} else {
    report('pass', 'STAFF_PIN (' . strlen($pin) . ' หลัก) — ใช้สร้างบัญชีเริ่มต้นเมื่อล็อกอินครั้งแรก');
}

if ($db !== null) {
    $rows = columnsOf($db, 'repair_jobs');
    if ($rows === null) {
        report('fail', 'ตาราง repair_jobs', 'ยังไม่มี — รัน php db/migrate.php');
    } else {
        report('pass', 'ตาราง repair_jobs');
        $columns = array_column($rows, 'Field');
        $missing = array_diff([
            'before_photo_path', 'after_photo_path', 'reporter_name', 'reporter_phone',
            'reporter_email', 'assigned_staff_id',
        ], $columns);
        report(
            $missing === [] ? 'pass' : 'fail',
            'คอลัมน์รูปและข้อมูลผู้แจ้ง',
            $missing === [] ? '' : 'ขาด ' . implode(', ', $missing) . ' — รัน php db/migrate.php'
        );

        $notNull = [];
        foreach ($rows as $row) {
            $isBlob = in_array($row['Field'], ['before_photo_data_url', 'after_photo_data_url'], true);
            if ($isBlob && $row['Null'] === 'NO') $notNull[] = $row['Field'];
        }
        report(
            $notNull === [] ? 'pass' : 'fail',
            'คอลัมน์ base64 เดิมเป็น NULL ได้',
            $notNull === [] ? '' : implode(', ', $notNull) . ' ยังเป็น NOT NULL — รัน php db/migrate-photos.php'
        );

        foreach ($rows as $row) {
            if ($row['Field'] !== 'status') continue;
            $missingStatuses = array_filter(
                ['รับเรื่องแล้ว', 'กำลังซ่อม', 'รออะไหล่', 'ซ่อมไม่ได้', 'ยกเลิก'],
                fn(string $status) => strpos((string) $row['Type'], $status) === false
            );
            report(
                $missingStatuses === [] ? 'pass' : 'fail',
                'สถานะงานครบทุกขั้น',
                $missingStatuses === [] ? '' : 'ขาด ' . implode(', ', $missingStatuses) . ' — รัน php db/migrate.php'
            );
        }
    }

    foreach (['staff_users', 'staff_sessions', 'zones', 'repair_job_events'] as $table) {
        report(
            columnsOf($db, $table) === null ? 'fail' : 'pass',
            'ตาราง ' . $table,
            columnsOf($db, $table) === null ? 'ยังไม่มี — รัน php db/migrate.php' : ''
        );
    }

    $staffColumns = columnsOf($db, 'staff_users');
    if ($staffColumns !== null) {
        $hasRole = in_array('role', array_column($staffColumns, 'Field'), true);
        report($hasRole ? 'pass' : 'fail', 'บทบาทเจ้าหน้าที่', $hasRole ? '' : 'ขาดคอลัมน์ role — รัน php db/migrate.php');
        if ($hasRole && $staffCount !== null && $staffCount > 0) {
            $adminCount = (int) $db->query("SELECT COUNT(*) FROM staff_users WHERE active = 1 AND role = 'admin'")->fetchColumn();
            report(
                $adminCount > 0 ? 'pass' : 'fail',
                'ผู้ดูแลระบบที่ใช้งานอยู่',
                $adminCount > 0 ? $adminCount . ' บัญชี' : 'ต้องมีอย่างน้อย 1 บัญชี — ตั้ง role=admin ให้บัญชีที่ใช้งาน'
            );
        }
    }

    $zoneColumns = columnsOf($db, 'zones');
    if ($zoneColumns !== null) {
        $zoneCount = (int) $db->query('SELECT COUNT(*) FROM zones WHERE active = 1')->fetchColumn();
        report($zoneCount > 0 ? 'pass' : 'warn', 'อาคาร/พื้นที่ใช้งาน', $zoneCount . ' รายการ');
    }
}

// --------------------------------------------------------------------- uploads
$writable = writeProbe($uploads);
report($writable === '' ? 'pass' : 'fail', 'uploads เขียนไฟล์ได้', $writable === '' ? $uploads : $writable);

$siteRoot = dirname($uploads);
$apiBeside = is_file($siteRoot . '/api/index.php');
report(
    $apiBeside ? 'pass' : 'warn',
    'uploads อยู่ใต้รากเว็บ (มี api/index.php อยู่ข้าง ๆ)',
    $apiBeside
        ? $siteRoot . (is_file($siteRoot . '/index.html') ? '' : ' (ยังไม่มี index.html — คัดลอกจาก dist)')
        : 'ไม่พบ api/index.php ข้างโฟลเดอร์ uploads — ตั้ง UPLOADS_DIR หรือคัดลอก uploads ไปที่รากเว็บ'
);

$rateDir = writeProbe(RATE_LIMIT_DIR);
report(
    $rateDir === '' ? 'pass' : 'warn',
    'ที่เก็บตัวนับ rate limit',
    $rateDir === '' ? (realpath(RATE_LIMIT_DIR) ?: RATE_LIMIT_DIR) : $rateDir . ' (เพดานจะถูกข้ามเมื่อเขียนไม่ได้)'
);

$free = @disk_free_space($uploads);
report(
    $free === false ? 'warn' : ($free >= 512 * 1024 * 1024 ? 'pass' : 'warn'),
    'พื้นที่ดิสก์เหลือ',
    $free === false ? 'อ่านค่าไม่ได้' : formatBytes((float) $free) . ($free >= 512 * 1024 * 1024 ? '' : ' — ต่ำกว่า 512 MB รูปใหม่อาจเขียนไม่ได้')
);

echo PHP_EOL . 'สรุป: ผ่าน ' . $counts['pass'] . ', เตือน ' . $counts['warn'] . ', ต้องแก้ ' . $counts['fail'] . PHP_EOL;
exit($counts['fail'] > 0 ? 1 : 0);
