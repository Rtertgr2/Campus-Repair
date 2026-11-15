<?php
declare(strict_types=1);
// PHP 7.4+ with pdo_mysql; serve from the same origin as the React app.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
date_default_timezone_set('Asia/Bangkok');

// Same values as the schema ENUM and src/lib/api.ts.
const STATUS_PENDING = 'รอแก้ไข';
const STATUS_CLOSED = 'ปิดงานแล้ว';
const REPAIR_ACTIONS = ['listIssues', 'createIssue', 'updateStatus'];
const ASSESSMENT_ACTIONS = ['listAssessments', 'submitAssessment'];

require __DIR__ . '/db.php';
require __DIR__ . '/photos.php';
require __DIR__ . '/lib/ratelimit.php';

// Photos written during this request; removed again if the request fails.
$GLOBALS['createdPhotos'] = [];

// Field caps (characters) so a form can never overflow the columns.
const CAP_TEXT = 2000; // free text: locationDetail, suggestion, staffNote
const CAP_NAME = 191;  // labels and names: zone, category, riskLevel, studentName
const CAP_CODE = 64;   // codes and ids: groupId, studentId, level
const MAX_REQUEST_BYTES = 7 * 1024 * 1024; // larger bodies are refused outright
const PHOTO_SCHEMA_HINT = ' — ต้องรัน `php db/migrate-photos.php --uploads=<โฟลเดอร์ uploads ของเว็บ>`'
    . ' ให้จบก่อน แล้วลองใหม่ (README หัวข้อ "รูปภาพ (uploads)")';

function respond(array $body, int $status = 200): void {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function fail(string $message, int $status = 400): void {
    respond(['ok' => false, 'error' => $message], $status);
}
function capped(string $value, int $limit): string {
    if ($limit <= 0) return $value;
    if (function_exists('mb_substr')) return mb_substr($value, 0, $limit, 'UTF-8');
    // No mbstring: cut on character boundaries so Thai text is never split mid-character.
    $chars = preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY);
    return $chars === false ? substr($value, 0, $limit) : implode('', array_slice($chars, 0, $limit));
}
function charLength(string $value): int {
    // VARCHAR(n) counts characters, so Thai text must be measured the same way.
    if (function_exists('mb_strlen')) return mb_strlen($value, 'UTF-8');
    if (!preg_match('/[^\x00-\x7F]/', $value)) return strlen($value);
    $chars = preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY);
    return $chars === false ? strlen($value) : count($chars);
}
function field(array $input, string $key, int $max = 20000, bool $required = false, int $cap = 0): string {
    $value = $input[$key] ?? '';
    if (!is_string($value)) fail('ข้อมูลไม่ถูกต้อง: ' . $key);
    if (charLength($value) > $max) fail('ข้อมูลไม่ถูกต้อง: ' . $key);
    $value = trim($value);
    if ($required && $value === '') fail('กรุณากรอกข้อมูล: ' . $key);
    return capped($value, $cap);
}
/**
 * Honeypot: real users never fill the hidden "website" field. Any value means a
 * bot, so the request is refused without saying why.
 */
function cr_reject_honeypot(array $input): void {
    $candidates = [$input['website'] ?? null];
    foreach (['issue', 'assessment'] as $key) {
        if (isset($input[$key]) && is_array($input[$key])) $candidates[] = $input[$key]['website'] ?? null;
    }
    foreach ($candidates as $value) {
        if (is_string($value) && trim($value) !== '') fail('ไม่สามารถดำเนินการได้', 400);
    }
}
/**
 * Validates a photo data URL, charges $dailyBytes of the caller's budget (0 = no
 * budget, used by staff actions) and stores it as a file; returns its path.
 */
function photoField(array $input, string $key, string $ip = '', int $dailyBytes = 0): string {
    try {
        // Read up to the request cap so storePhoto() can explain the photo limit itself.
        $dataUrl = field($input, $key, MAX_REQUEST_BYTES);
        if ($dataUrl !== '' && !uploadQuotaReserve($ip, photoBytes($dataUrl), $dailyBytes)) {
            header('Retry-After: ' . secondsUntilTomorrow());
            fail('อัปโหลดรูปครบโควตาวันนี้แล้ว กรุณาแจ้งซ่อมโดยไม่แนบรูป หรือลองใหม่พรุ่งนี้', 429);
        }
        $path = storePhoto($dataUrl);
        if ($path !== '') $GLOBALS['createdPhotos'][] = $path;
        return $path;
    } catch (InvalidArgumentException $e) {
        fail($e->getMessage());
    } catch (Throwable $e) {
        error_log('Campus Repair upload: ' . $e->getMessage());
        fail('บันทึกไฟล์รูปไม่สำเร็จ กรุณาตรวจสิทธิ์เขียนโฟลเดอร์ uploads', 500);
    }
    return '';
}
/** Column rows of $table, or a 503 saying db/schema.sql has not been imported. */
function tableColumns(PDO $db, string $table): array {
    try {
        return $db->query('SHOW COLUMNS FROM ' . $table)->fetchAll();
    } catch (PDOException $e) {
        if ($e->getCode() !== '42S02') throw $e;
        fail('ยังไม่มีตาราง ' . $table . ' — นำเข้า db/schema.sql ก่อนใช้งาน', 503);
    }
}

/**
 * Refuses repair-job actions while repair_jobs still has the pre-migration photo
 * columns, so users see the migration hint instead of a plain 500.
 */
function requirePhotoSchema(PDO $db): void {
    $rows = tableColumns($db, 'repair_jobs');

    $missing = array_diff(['before_photo_path', 'after_photo_path'], array_column($rows, 'Field'));
    $blobs = ['before_photo_data_url', 'after_photo_data_url'];
    $stuck = array_filter($rows, fn(array $row) => in_array($row['Field'], $blobs, true) && $row['Null'] === 'NO');

    $problem = match (true) {
        $missing !== [] => 'ยังไม่มีคอลัมน์ ' . implode(', ', $missing),
        $stuck !== [] => 'คอลัมน์เดิม ' . reset($stuck)['Field'] . ' ยังเป็น NOT NULL',
        default => '',
    };
    if ($problem !== '') fail($problem . PHOTO_SCHEMA_HINT, 503);
}

/** assessments has no photo columns, but a missing table is still a deploy mistake. */
function requireAssessmentSchema(PDO $db): void {
    tableColumns($db, 'assessments');
}
function verifyPin(array $input, array $config): void {
    $expected = (string) $config['staff_pin'];
    if (!preg_match('/^[0-9]{6,}$/D', $expected)) fail('กรุณาตั้ง STAFF_PIN อย่างน้อย 6 หลักบนเซิร์ฟเวอร์', 503);
    if (!hash_equals($expected, field($input, 'pin', 128))) fail('รหัส PIN ไม่ถูกต้อง', 403);
}
function issue(PDO $db, int $id): array {
    $query = $db->prepare('SELECT * FROM repair_jobs WHERE row_index = ?');
    $query->execute([$id]);
    $row = $query->fetch();
    if (!$row) fail('ไม่พบรายการที่ต้องการอัปเดต', 404);
    return issueRow($row);
}
function displayDate(?string $date): string {
    return $date ? (new DateTimeImmutable($date))->format('d/m/Y') : '';
}
function issueRow(array $row): array {
    $beforePath = (string) ($row['before_photo_path'] ?? '');
    $afterPath = (string) ($row['after_photo_path'] ?? '');
    return [
        'rowIndex' => (int) $row['row_index'],
        'id' => 'GW-' . str_pad((string) $row['row_index'], 3, '0', STR_PAD_LEFT),
        'createdDate' => displayDate($row['created_date']), 'dueDate' => displayDate($row['due_date']),
        'groupId' => $row['group_id'], 'zone' => $row['zone'], 'category' => $row['category'],
        'riskLevel' => $row['risk_level'], 'locationDetail' => $row['location_detail'],
        'suggestion' => $row['suggestion'],
        'beforePhoto' => $beforePath, 'beforePhotoThumb' => thumbOf($beforePath),
        'status' => $row['status'], 'closedDate' => displayDate($row['closed_date']),
        'afterPhoto' => $afterPath, 'afterPhotoThumb' => thumbOf($afterPath),
        'staffNote' => $row['staff_note'],
    ];
}
function percent(int $value, int $total): int {
    return $total > 0 ? (int) round(100 * $value / $total) : 0;
}
function assessmentRow(array $row): array {
    $correct = (int) $row['knowledge_correct'];
    $total = (int) $row['knowledge_total'];
    $points = (int) $row['awareness_points'];
    $max = (int) $row['awareness_max'];
    return [
        'id' => 'A-' . str_pad((string) $row['row_index'], 3, '0', STR_PAD_LEFT),
        'timestamp' => (new DateTimeImmutable($row['created_at'], new DateTimeZone('UTC')))->format(DATE_ATOM),
        'studentId' => $row['student_id'], 'studentName' => $row['student_name'],
        'level' => $row['level'], 'groupId' => $row['group_id'],
        'knowledgeCorrect' => $correct, 'knowledgeTotal' => $total,
        'knowledgePercent' => percent($correct, $total),
        'awarenessPoints' => $points, 'awarenessMax' => $max,
        'awarenessPercent' => percent($points, $max),
    ];
}
function score(array $input, string $key, int $min, int $max): int {
    $value = $input[$key] ?? null;
    if (!is_int($value) || $value < $min || $value > $max) fail('คะแนนไม่ถูกต้อง: ' . $key);
    return $value;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: POST');
        fail('กรุณาเรียก API ด้วย POST', 405);
    }
    // No cross-origin requests. Vite development uses the same-origin proxy.
    if (!empty($_SERVER['HTTP_ORIGIN'])) {
        $origin = parse_url($_SERVER['HTTP_ORIGIN']);
        $originHost = ($origin['host'] ?? '') . (isset($origin['port']) ? ':' . $origin['port'] : '');
        if (strcasecmp($originHost, $_SERVER['HTTP_HOST'] ?? '') !== 0) fail('Origin ไม่ได้รับอนุญาต', 403);
    }
    $raw = (string) file_get_contents('php://input', false, null, 0, 7 * 1024 * 1024 + 1);
    if (strlen($raw) > MAX_REQUEST_BYTES) fail('ข้อมูลหรือรูปภาพมีขนาดใหญ่เกินไป', 413);
    try { $input = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { fail('JSON ไม่ถูกต้อง'); }
    if (!is_array($input)) fail('ข้อมูลไม่ถูกต้อง');
    $action = field($input, 'action', 50, true);
    $config = require __DIR__ . '/config.php';
    // The PIN lives in config, so a staff login still works while MySQL is down.
    if ($action === 'verifyPin') {
        verifyPin($input, $config);
        respond(['ok' => true]);
    }
    if (!in_array($action, [...REPAIR_ACTIONS, ...ASSESSMENT_ACTIONS], true)) {
        fail('ไม่รู้จักคำสั่ง');
    }
    // Public write actions: honeypot first, then the per-IP limit.
    $clientIp = clientIp($config['trusted_proxies'] ?? []);
    if ($action === 'createIssue' || $action === 'submitAssessment') {
        cr_reject_honeypot($input);
        rateLimitCleanup();
        if (!rateLimitHit($action, $clientIp)) {
            header('Retry-After: 60');
            fail('ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่', 429);
        }
    }
    if ($action === 'updateStatus') verifyPin($input, $config);
    $db = openDatabase($config);
    // Missing tables or columns would otherwise surface as a generic 500.
    if (in_array($action, REPAIR_ACTIONS, true)) requirePhotoSchema($db);
    if (in_array($action, ASSESSMENT_ACTIONS, true)) requireAssessmentSchema($db);
    if ($action === 'listIssues') {
        $rows = $db->query('SELECT * FROM repair_jobs ORDER BY row_index')->fetchAll();
        respond(['ok' => true, 'issues' => array_map('issueRow', $rows)]);
    }
    if ($action === 'createIssue') {
        $item = $input['issue'] ?? null;
        if (!is_array($item)) fail('ข้อมูลรายการไม่ถูกต้อง');
        $today = new DateTimeImmutable('today');
        $values = [$today->format('Y-m-d'), $today->modify('+30 days')->format('Y-m-d'),
            field($item, 'groupId', 100, true, CAP_CODE), field($item, 'zone', 255, true, CAP_NAME),
            field($item, 'category', 255, false, CAP_NAME), field($item, 'riskLevel', 100, false, CAP_NAME),
            field($item, 'locationDetail', 20000, false, CAP_TEXT), field($item, 'suggestion', 20000, false, CAP_TEXT),
            photoField($item, 'beforePhotoDataUrl', $clientIp, (int) ($config['upload_daily_bytes'] ?? 0)), ''];
        $query = $db->prepare('INSERT INTO repair_jobs (created_date,due_date,group_id,zone,category,risk_level,location_detail,suggestion,before_photo_path,staff_note) VALUES (?,?,?,?,?,?,?,?,?,?)');
        $query->execute($values);
        respond(['ok' => true, 'issue' => issue($db, (int) $db->lastInsertId())]);
    }
    if ($action === 'updateStatus') {
        $id = filter_var($input['rowIndex'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($id === false) fail('rowIndex ไม่ถูกต้อง');
        $status = field($input, 'status', 100, true);
        if (!in_array($status, [STATUS_PENDING, STATUS_CLOSED], true)) fail('สถานะไม่ถูกต้อง');
        if ($status === STATUS_CLOSED) {
            $photo = photoField($input, 'afterPhotoDataUrl');
            // Closing again with a new photo replaces the old file on disk too.
            $previous = (string) (issue($db, $id)['afterPhoto'] ?? '');
            $query = $db->prepare("UPDATE repair_jobs SET status=?,closed_date=?,staff_note=?,after_photo_path=COALESCE(NULLIF(?,''),after_photo_path) WHERE row_index=?");
            $query->execute([$status, date('Y-m-d'), field($input, 'staffNote', 20000, false, CAP_TEXT), $photo, $id]);
            if ($photo !== '' && $previous !== '' && $previous !== $photo) discardPhoto($previous);
        } else {
            $query = $db->prepare('UPDATE repair_jobs SET status=?,closed_date=NULL WHERE row_index=?');
            $query->execute([$status, $id]);
        }
        respond(['ok' => true, 'issue' => issue($db, $id)]);
    }
    if ($action === 'listAssessments') {
        $rows = $db->query('SELECT * FROM assessments ORDER BY row_index')->fetchAll();
        respond(['ok' => true, 'assessments' => array_map('assessmentRow', $rows)]);
    }
    if ($action === 'submitAssessment') {
        $item = $input['assessment'] ?? null;
        if (!is_array($item)) fail('ข้อมูลแบบประเมินไม่ถูกต้อง');
        $total = score($item, 'knowledgeTotal', 1, 10000);
        $max = score($item, 'awarenessMax', 1, 10000);
        $query = $db->prepare('INSERT INTO assessments (student_id,student_name,level,group_id,knowledge_correct,knowledge_total,awareness_points,awareness_max) VALUES (?,?,?,?,?,?,?,?)');
        $query->execute([field($item, 'studentId', 100, true, CAP_CODE), field($item, 'studentName', 255, true, CAP_NAME),
            field($item, 'level', 100, false, CAP_CODE), field($item, 'groupId', 100, true, CAP_CODE),
            score($item, 'knowledgeCorrect', 0, $total), $total, score($item, 'awarenessPoints', 0, $max), $max]);
        $query = $db->prepare('SELECT * FROM assessments WHERE row_index=?');
        $query->execute([$db->lastInsertId()]);
        respond(['ok' => true, 'assessment' => assessmentRow($query->fetch())]);
    }
} catch (Throwable $e) {
    foreach ($GLOBALS['createdPhotos'] as $photo) discardPhoto($photo);
    error_log('Campus Repair API: ' . $e->getMessage());
    fail('เชื่อมต่อหรือบันทึกฐานข้อมูลไม่ได้ กรุณาตรวจ config, นำเข้า db/schema.sql และดู PHP error log', 500);
}
