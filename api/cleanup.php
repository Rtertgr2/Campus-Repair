<?php
/**
 * ลบรูปที่ไม่มีอยู่ในฐานข้อมูลแล้ว (ไฟล์กำพร้าใน api/uploads)
 *
 * ใช้ได้ 2 ทาง
 *   command line : php api/cleanup.php
 *                   php api/cleanup.php --dry-run        (ดูว่าจะลบอะไร ไม่ลบจริง)
 *                   php api/cleanup.php --max-age=48     (ไฟล์ใหม่กว่า 48 ชม. ไม่แตะ)
 *   เปิดเบราว์เซอร์ (เฉพาะเครื่องเซิร์ฟเวอร์เอง):
 *                   http://localhost/campus-repair/api/cleanup.php?dryRun=1
 *
 * ใช้กับงานประจำ (Windows Task Scheduler) ได้ เช่นทุกสัปดาห์
 * รูปที่ฐานข้อมูลยังอ้างถึงจะไม่ถูกลบ และไฟล์ที่เพิ่งสร้างภายใน N ชั่วโมงจะถูกข้าม
 */

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/maintenance.php';

$isCli = PHP_SAPI === 'cli';

if (!$isCli) {
    header('Content-Type: application/json; charset=utf-8');

    $token = (string) cr_config('install_token', '');
    $supplied = isset($_GET['token']) ? (string) $_GET['token'] : '';
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    $loopback = $ip === '127.0.0.1' || $ip === '::1' || $ip === '::ffff:127.0.0.1';

    $allowed = $token !== '' ? ($supplied !== '' && hash_equals($token, $supplied)) : $loopback;
    if (!$allowed) {
        http_response_code(403);
        echo json_encode(array('ok' => false, 'error' => '403 — อนุญาตเฉพาะเครื่องเซิร์ฟเวอร์เอง'), JSON_UNESCAPED_UNICODE);
        exit;
    }
}

cr_bootstrap_runtime();

$dryRun = false;
$maxAge = 24;

if ($isCli) {
    foreach (array_slice($argv ?? array(), 1) as $arg) {
        if ($arg === '--dry-run' || $arg === '--dry') {
            $dryRun = true;
        } elseif (strpos($arg, '--max-age=') === 0) {
            $maxAge = (int) substr($arg, strlen('--max-age='));
        }
    }
} else {
    $dryRun = isset($_GET['dryRun']) && (string) $_GET['dryRun'] === '1';
    if (isset($_GET['maxAgeHours'])) {
        $maxAge = (int) $_GET['maxAgeHours'];
    }
}

try {
    $result = cr_cleanup_photos(cr_db(), $maxAge, $dryRun);
} catch (Throwable $e) {
    if ($isCli) {
        echo 'ERROR: ' . $e->getMessage() . PHP_EOL;
        exit(1);
    }
    echo json_encode(array('ok' => false, 'error' => $e->getMessage()), JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = array('ok' => true, 'result' => $result);

if ($isCli) {
    echo 'Campus Repair — photo cleanup' . PHP_EOL;
    echo 'ไฟล์ที่ตรวจ: ' . $result['scanned'] . PHP_EOL;
    echo 'เก็บไว้: ' . $result['kept'] . PHP_EOL;
    echo ($dryRun ? 'จะลบ (dry run): ' : 'ลบแล้ว: ') . count($result['deleted']) . PHP_EOL;
    foreach ($result['deleted'] as $name) {
        echo '  - ' . $name . PHP_EOL;
    }
    echo PHP_EOL . json_encode($payload, JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit(0);
}

echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
