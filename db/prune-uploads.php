<?php
declare(strict_types=1);
/**
 * ลบไฟล์รูปที่ไม่ถูกอ้างถึงในฐานข้อมูล (ไฟล์กำพร้า)
 *
 *   php db/prune-uploads.php --dry-run
 *   php db/prune-uploads.php --uploads=/opt/lampp/htdocs/campus-repair/uploads
 *   php db/prune-uploads.php --min-age=600 --limit=100
 *
 * ไฟล์กำพร้าเกิดขึ้นได้จากคำขอที่ล้มกลางทาง แถวที่ถูกลบด้วยมือ หรือการย้ายข้อมูลซ้ำ
 * ไฟล์ที่ถูกอ้างถึง (ทั้งรูปและ thumbnail ของมัน) จะไม่ถูกแตะ และไฟล์ที่เพิ่งเขียน
 * ภายใน --min-age วินาที (ค่าเริ่มต้น 3600) จะถูกข้ามเพราะอาจเป็นคำขอที่ยังทำงานอยู่
 *
 * --dry-run  พิมพ์รายการที่จะลบโดยไม่ลบจริง (แนะนำให้รันก่อนทุกครั้ง)
 * --limit=N  ลบไม่เกิน N ไฟล์ต่อรอบ
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../public/api/db.php';
require __DIR__ . '/../public/api/photos.php';

$options = getopt('', ['dry-run', 'uploads:', 'min-age:', 'limit:']);
$dryRun = isset($options['dry-run']);
$uploads = isset($options['uploads']) ? rtrim((string) $options['uploads'], '/') : rtrim(uploadsDir(), '/');
$minAge = isset($options['min-age']) ? max(0, (int) $options['min-age']) : 3600;
$limit = isset($options['limit']) ? max(1, (int) $options['limit']) : 0;

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

if (!is_dir($uploads)) {
    fwrite(STDERR, 'ไม่พบโฟลเดอร์ uploads: ' . $uploads . PHP_EOL);
    exit(1);
}

$config = require __DIR__ . '/../public/api/config.php';
try {
    $db = openDatabase($config);
    $rows = $db->query(
        "SELECT before_photo_path AS path FROM repair_jobs WHERE before_photo_path <> ''
         UNION
         SELECT after_photo_path FROM repair_jobs WHERE after_photo_path <> ''"
    )->fetchAll();
} catch (Throwable $e) {
    fwrite(STDERR, 'อ่านฐานข้อมูลไม่ได้: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

// Thumbnails are derived names, so a referenced photo protects its "-thumb.jpg" too.
$referenced = [];
foreach ($rows as $row) {
    $path = (string) $row['path'];
    $referenced[$path] = true;
    $referenced[thumbName($path)] = true;
}

$now = time();
$found = [];
$totalFiles = 0;
$tooNew = 0;
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($uploads, FilesystemIterator::SKIP_DOTS)
);
foreach ($iterator as $file) {
    if (!$file->isFile()) continue;
    $name = $file->getFilename();
    if ($name === '' || $name[0] === '.') continue; // .htaccess and other dotfiles stay
    $totalFiles++;

    $relative = 'uploads/' . str_replace('\\', '/', substr($file->getPathname(), strlen($uploads) + 1));
    if (isset($referenced[$relative])) continue;
    if ($now - $file->getMTime() < $minAge) {
        $tooNew++;
        continue;
    }
    $found[] = ['absolute' => $file->getPathname(), 'relative' => $relative, 'bytes' => (int) $file->getSize()];
}

$targets = $limit > 0 ? array_slice($found, 0, $limit) : $found;
$bytes = array_sum(array_column($targets, 'bytes'));

echo 'โฟลเดอร์: ' . $uploads . ($dryRun ? ' (dry-run)' : '') . PHP_EOL;
echo 'ไฟล์ในโฟลเดอร์ ' . $totalFiles . ', path ที่ฐานข้อมูลอ้างถึง ' . count($referenced)
    . ', กำพร้า ' . count($found) . ' (' . formatBytes((float) array_sum(array_column($found, 'bytes'))) . ')'
    . ($tooNew > 0 ? ', ข้ามเพราะเพิ่งเขียน ' . $tooNew : '') . PHP_EOL;

if ($targets === []) {
    echo 'ไม่มีไฟล์ที่ต้องลบ' . PHP_EOL;
    exit(0);
}

echo ($dryRun ? 'จะลบ ' : 'ลบ ') . count($targets) . ' ไฟล์ (' . formatBytes((float) $bytes) . ')' . PHP_EOL;
foreach (array_slice($targets, 0, 20) as $target) {
    echo '  ' . ($dryRun ? '' : 'ลบแล้ว ') . $target['relative'] . PHP_EOL;
}
if (count($targets) > 20) {
    echo '  ... และอีก ' . (count($targets) - 20) . ' ไฟล์' . PHP_EOL;
}

if ($dryRun) {
    exit(0);
}

$deleted = 0;
$failed = 0;
foreach ($targets as $target) {
    if (@unlink($target['absolute'])) {
        $deleted++;
    } else {
        $failed++;
        fwrite(STDERR, 'ลบไม่ได้: ' . $target['relative'] . PHP_EOL);
    }
}

echo 'สรุป: ลบ ' . $deleted . ' ไฟล์ (' . formatBytes((float) $bytes) . '), ล้มเหลว ' . $failed . PHP_EOL;
exit($failed > 0 ? 1 : 0);
