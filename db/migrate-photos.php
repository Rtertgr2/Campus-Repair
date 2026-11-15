<?php
declare(strict_types=1);
/**
 * ย้ายรูป base64 จากคอลัมน์ *_photo_data_url ไปเป็นไฟล์ (รันครั้งเดียว)
 *
 *   php db/migrate-photos.php --dry-run --uploads=/path/to/site/uploads
 *   php db/migrate-photos.php --uploads=/path/to/site/uploads
 *   php db/migrate-photos.php --uploads=... --drop-blobs
 *
 * ฐานข้อมูลเก็บ path แบบ uploads/<ปี>/<เดือน>/<ไฟล์> และเว็บต้องเสิร์ฟที่ /uploads/...
 * โฟลเดอร์ปลายทางจึงต้องเป็น uploads ของเว็บที่ deploy จริง (มี index.html + api/index.php
 * อยู่ข้าง ๆ) สคริปต์จะตรวจให้ก่อนเขียน และจะไม่เขียนอะไรเลยถ้ายืนยันไม่ได้ เว้นแต่ใส่ --force
 *
 * ใช้ --limit=N เพื่อลองทีละส่วน, --force เพื่อยอมเขียนลงโฟลเดอร์ที่ยืนยันไม่ได้
 * ทำงานซ้ำได้: แถวที่ย้ายแล้วจะถูกข้าม ถ้ารันไม่จบให้รันใหม่ได้เลย
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../public/api/db.php';
require __DIR__ . '/../public/api/photos.php';

$options = getopt('', ['dry-run', 'drop-blobs', 'uploads:', 'limit:', 'force']);
$dryRun = isset($options['dry-run']);
$dropBlobs = isset($options['drop-blobs']);
$force = isset($options['force']);
$limit = isset($options['limit']) ? max(1, (int) $options['limit']) : 0;
$projectDir = dirname(__DIR__);
$explicitUploads = isset($options['uploads']) ? (string) $options['uploads'] : null;

/** Absolute, normalised path; resolves through the parent when $path does not exist yet. */
function normalizePath(string $path): string
{
    $path = str_replace('\\', '/', trim($path));
    if ($path === '') return '';
    if ($path[0] !== '/') {
        $path = rtrim(str_replace('\\', '/', (string) getcwd()), '/') . '/' . $path;
    }

    $real = realpath($path);
    if ($real !== false) return rtrim(str_replace('\\', '/', $real), '/');

    $parent = realpath(dirname($path));
    return $parent === false
        ? rtrim($path, '/')
        : rtrim(str_replace('\\', '/', $parent), '/') . '/' . basename($path);
}

function isInside(string $path, string $dir): bool
{
    return strpos(rtrim(normalizePath($path), '/') . '/', rtrim(normalizePath($dir), '/') . '/') === 0;
}

/** A folder is served only when it sits beside a deployed app (index.html + api/index.php). */
function deployedSiteRoot(string $uploadsDir): string
{
    $root = dirname($uploadsDir);
    return is_file($root . '/index.html') && is_file($root . '/api/index.php') ? $root : '';
}

function uploadsIsWritable(string $dir): bool
{
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) return false;
    $probe = rtrim($dir, '/') . '/.write-test-' . bin2hex(random_bytes(4));
    if (@file_put_contents($probe, 'ok') === false) return false;
    @unlink($probe);
    return true;
}

/**
 * Chooses and reports the destination folder. Exits with code 2 when the folder
 * cannot be shown to be the one the website serves.
 *
 * @return array{dir: string, served: bool, insideDist: bool}
 */
function decideTarget(string $projectDir, ?string $explicit, bool $force, bool $dryRun): array
{
    if ($explicit !== null && trim($explicit) !== '') {
        $dir = $explicit;
        $source = '--uploads';
    } elseif (($env = getenv('UPLOADS_DIR')) !== false && trim($env) !== '') {
        $dir = $env;
        $source = 'UPLOADS_DIR';
    } else {
        $dir = $projectDir . '/public/uploads';
        $source = 'ค่าเริ่มต้นของโปรเจกต์ (public/uploads)';
    }

    $dir = normalizePath($dir);
    $siteRoot = deployedSiteRoot($dir);
    $insideDist = isInside($dir, $projectDir . '/dist');

    echo 'โฟลเดอร์ปลายทาง: ' . $dir . PHP_EOL;
    echo 'ที่มา: ' . $source . PHP_EOL;

    if ($siteRoot !== '') {
        echo 'การเสิร์ฟ: ยืนยันแล้ว — พบ index.html และ api/index.php ที่ ' . $siteRoot . PHP_EOL;
        echo '            path ที่บันทึกจะถูกเว็บเสิร์ฟที่ /uploads/<ปี>/<เดือน>/<ไฟล์>' . PHP_EOL;
        if (normalizePath($siteRoot . '/uploads') !== $dir) {
            echo 'คำเตือน: นี่ไม่ใช่โฟลเดอร์ uploads ที่ API ของเว็บนี้ใช้งาน (' . $siteRoot . '/uploads)' . PHP_EOL;
        }
    } else {
        echo 'การเสิร์ฟ: ยังยืนยันไม่ได้ — ไม่พบ index.html + api/index.php ข้างโฟลเดอร์นี้' . PHP_EOL;
    }

    if ($insideDist) {
        echo 'คำเตือน: โฟลเดอร์นี้อยู่ใน dist ซึ่งถูกล้างทุกครั้งที่ npm run build' . PHP_EOL;
    }

    if (basename($dir) !== 'uploads') {
        fwrite(STDERR, 'โฟลเดอร์ปลายทางต้องชื่อ "uploads" เพราะ URL ของรูปคือ /uploads/...' . PHP_EOL);
        exit(1);
    }

    if (!$dryRun && !uploadsIsWritable($dir)) {
        fwrite(STDERR, 'เขียนโฟลเดอร์ปลายทางไม่ได้: ' . $dir . ' (ตรวจสิทธิ์ของ web server)' . PHP_EOL);
        exit(1);
    }

    if ($siteRoot === '' && !$force) {
        if ($dryRun) {
            echo 'โหมดทดลอง: จะยังไม่ย้ายรูปจนกว่าจะระบุ --uploads ของเว็บจริง หรือเติม --force' . PHP_EOL;
            return ['dir' => $dir, 'served' => false, 'insideDist' => $insideDist];
        }
        fwrite(
            STDERR,
            PHP_EOL . 'หยุดก่อนเขียน: ยืนยันไม่ได้ว่าเว็บเสิร์ฟโฟลเดอร์นี้' . PHP_EOL
            . 'ถ้าเขียนลงที่นี่ path ในฐานข้อมูลจะชี้ไฟล์ที่เว็บไม่ได้เสิร์ฟ' . PHP_EOL
            . 'ระบุโฟลเดอร์ uploads ของเว็บที่ deploy จริง เช่น' . PHP_EOL
            . '  php db/migrate-photos.php --uploads=/opt/lampp/htdocs/campus-repair/uploads' . PHP_EOL
            . 'ถ้าแน่ใจ (เช่นจะคัดลอกไฟล์ไปเอง) เติม --force' . PHP_EOL
        );
        exit(2);
    }

    return ['dir' => $dir, 'served' => $siteRoot !== '', 'insideDist' => $insideDist];
}

$target = decideTarget($projectDir, $explicitUploads, $force, $dryRun);
putenv('UPLOADS_DIR=' . $target['dir']);

try {
    $config = require __DIR__ . '/../public/api/config.php';
    $db = openDatabase($config);
} catch (Throwable $e) {
    fwrite(STDERR, 'เชื่อมต่อฐานข้อมูลไม่ได้: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

echo 'ฐานข้อมูล: ' . $config['database'] . ' @ ' . $config['host'] . PHP_EOL;
if (!function_exists('imagecreatefromstring')) {
    echo 'คำเตือน: ยังไม่ได้เปิดส่วนขยาย GD — thumbnail จะใช้ไฟล์เต็มแทน' . PHP_EOL;
}
if ($dryRun) {
    echo 'โหมดทดลอง (--dry-run): ไม่เขียนไฟล์และไม่แก้ฐานข้อมูล' . PHP_EOL;
}

$blobColumns = ['before' => 'before_photo_data_url', 'after' => 'after_photo_data_url'];

/** @return string[] */
function tableColumns(PDO $db, string $table): array
{
    return array_column($db->query('SHOW COLUMNS FROM ' . $table)->fetchAll(), 'Field');
}

try {
    $columns = tableColumns($db, 'repair_jobs');

    if (!in_array('before_photo_path', $columns, true)) {
        if ($dryRun) {
            echo 'จะเพิ่มคอลัมน์ before_photo_path, after_photo_path' . PHP_EOL;
        } else {
            $db->exec(
                "ALTER TABLE repair_jobs
                 ADD COLUMN before_photo_path VARCHAR(255) NOT NULL DEFAULT '' AFTER suggestion,
                 ADD COLUMN after_photo_path VARCHAR(255) NOT NULL DEFAULT '' AFTER before_photo_path"
            );
            echo 'เพิ่มคอลัมน์ before_photo_path, after_photo_path แล้ว' . PHP_EOL;
        }
    }

    // คอลัมน์เดิมต้องเป็น NULL ได้ เพื่อให้ API ใหม่ insert แถวโดยไม่ส่งคอลัมน์นี้
    foreach ($blobColumns as $column) {
        if (!in_array($column, $columns, true)) continue;
        if ($dryRun) {
            echo 'จะตั้ง ' . $column . ' ให้เป็น NULL ได้' . PHP_EOL;
            continue;
        }
        $db->exec('ALTER TABLE repair_jobs MODIFY ' . $column . ' MEDIUMTEXT NULL');
    }

    $present = [];
    foreach ($blobColumns as $prefix => $column) {
        if (in_array($column, $columns, true)) $present[$prefix] = $column;
    }
    if ($present === []) {
        echo 'ไม่พบคอลัมน์ base64 เดิม — ไม่มีอะไรต้องย้าย' . PHP_EOL;
        exit(0);
    }

    $sql = 'SELECT * FROM repair_jobs ORDER BY row_index';
    if ($limit > 0) $sql .= ' LIMIT ' . $limit;
    $rows = $db->query($sql)->fetchAll();

    $assign = $clear = [];
    if (!$dryRun) {
        foreach ($present as $prefix => $column) {
            $assign[$prefix] = $db->prepare(
                'UPDATE repair_jobs SET ' . $prefix . '_photo_path = ?, ' . $column . ' = NULL WHERE row_index = ?'
            );
            $clear[$prefix] = $db->prepare('UPDATE repair_jobs SET ' . $column . ' = NULL WHERE row_index = ?');
            // ค่า '' เดิมไม่มีความหมายแล้ว เก็บให้เป็น NULL ทั้งตาราง
            $db->exec('UPDATE repair_jobs SET ' . $column . " = NULL WHERE " . $column . " = ''");
        }
    }

    $moved = $cleared = $skipped = $failed = 0;
    $written = [];

    foreach ($rows as $row) {
        $rowIndex = (int) $row['row_index'];
        foreach ($present as $prefix => $column) {
            $blob = (string) ($row[$column] ?? '');
            if ($blob === '') continue;

            if (strpos($blob, 'data:image/') !== 0) {
                echo 'ข้ามแถว ' . $rowIndex . ' (' . $column . '): ข้อมูลไม่ใช่ data URL' . PHP_EOL;
                $skipped++;
                continue;
            }

            $existing = (string) ($row[$prefix . '_photo_path'] ?? '');
            if ($dryRun) {
                echo ($existing === '' ? 'จะย้าย ' : 'จะเคลียร์ ') . $column . ' ของแถว ' . $rowIndex . PHP_EOL;
                $existing === '' ? $moved++ : $cleared++;
                continue;
            }

            try {
                if ($existing !== '') {
                    // ย้ายไปแล้วในรอบก่อน เหลือแค่เคลียร์ blob เดิม
                    $clear[$prefix]->execute([$rowIndex]);
                    $cleared++;
                    continue;
                }
                $created = (string) ($row['created_date'] ?? '');
                $stamp = $created !== '' ? strtotime($created) : false;
                $subDir = date('Y/m', $stamp === false ? time() : $stamp);
                // การมีอยู่จริงของไฟล์ถูกตรวจครั้งเดียวตอนสรุปท้ายสคริปต์
                $stored = storePhoto($blob, $subDir);
                $assign[$prefix]->execute([$stored, $rowIndex]);
                $written[] = $stored;
                $moved++;
            } catch (Throwable $e) {
                $failed++;
                fwrite(STDERR, 'แถว ' . $rowIndex . ' (' . $column . ') ผิดพลาด: ' . $e->getMessage() . PHP_EOL);
            }
        }
    }

    if ($written !== []) {
        $missing = 0;
        foreach ($written as $relative) {
            if (!is_file(photoAbsolutePath($relative))) $missing++;
        }
        echo 'ตรวจไฟล์ที่ย้าย: ' . (count($written) - $missing) . '/' . count($written) . ' อยู่จริงใน ' . $target['dir'] . PHP_EOL;
        echo 'ตัวอย่าง path ในฐานข้อมูล: ' . $written[0] . PHP_EOL;
        echo 'เปิดตรวจบนเว็บที่ deploy: /' . $written[0] . PHP_EOL;
        if ($missing > 0) {
            fwrite(STDERR, 'มีไฟล์หาย ' . $missing . ' ไฟล์ — path ในฐานข้อมูลจะชี้ไฟล์ที่ไม่มีจริง' . PHP_EOL);
            exit(1);
        }
    }

    $dropList = array_values($present);
    if ($dropBlobs) {
        if ($dryRun) {
            echo 'จะลบคอลัมน์ ' . implode(', ', $dropList) . PHP_EOL;
        } elseif ($failed > 0) {
            echo 'ไม่ลบคอลัมน์เดิม เพราะยังมีแถวที่ย้ายไม่สำเร็จ' . PHP_EOL;
        } else {
            $db->exec('ALTER TABLE repair_jobs DROP COLUMN ' . implode(', DROP COLUMN ', $dropList));
            echo 'ลบคอลัมน์ ' . implode(', ', $dropList) . ' แล้ว' . PHP_EOL;
        }
    }

    echo PHP_EOL . 'สรุป: สแกน ' . count($rows) . ' แถว, ย้ายรูป ' . $moved
        . ', เคลียร์ blob ค้าง ' . $cleared . ', ข้าม ' . $skipped . ', ผิดพลาด ' . $failed . PHP_EOL;

    if ($moved > 0 && !$dryRun) {
        if ($target['served']) {
            echo 'รูปถูกเขียนลงโฟลเดอร์ที่เว็บเสิร์ฟแล้ว — ตรวจได้ที่ /uploads/ บนเว็บจริง' . PHP_EOL;
        } else {
            echo 'คำเตือน: โฟลเดอร์นี้ยังยืนยันไม่ได้ว่าเว็บเสิร์ฟ — ต้องคัดลอกโฟลเดอร์ uploads ไปที่เว็บจริงด้วย' . PHP_EOL;
        }
        if ($target['insideDist']) {
            echo 'คำเตือน: ไฟล์อยู่ใน dist ถ้า build ใหม่จะหาย — คัดลอกไปเว็บก่อน npm run build' . PHP_EOL;
        }
    }

    exit($failed > 0 ? 1 : 0);
} catch (Throwable $e) {
    fwrite(STDERR, 'ย้ายรูปไม่สำเร็จ: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
