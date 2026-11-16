<?php
declare(strict_types=1);
// PHP 8.0+ with pdo_mysql; serve from the same origin as the React app.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
date_default_timezone_set('Asia/Bangkok');

// Same values as the schema ENUM and src/lib/api.ts.
const STATUS_PENDING = 'รอแก้ไข';
const STATUS_ACCEPTED = 'รับเรื่องแล้ว';
const STATUS_IN_PROGRESS = 'กำลังซ่อม';
const STATUS_WAITING_PARTS = 'รออะไหล่';
const STATUS_CLOSED = 'ปิดงานแล้ว';
const STATUS_UNREPAIRABLE = 'ซ่อมไม่ได้';
const STATUS_CANCELLED = 'ยกเลิก';
const STATUSES = [
    STATUS_PENDING, STATUS_ACCEPTED, STATUS_IN_PROGRESS, STATUS_WAITING_PARTS,
    STATUS_CLOSED, STATUS_UNREPAIRABLE, STATUS_CANCELLED,
];
const TERMINAL_STATUSES = [STATUS_CLOSED, STATUS_UNREPAIRABLE, STATUS_CANCELLED];

const PUBLIC_ACTIONS = ['listIssues', 'getStats', 'listZones', 'createIssue'];
const STAFF_ACTIONS = [
    'updateStatus', 'updateIssue', 'deleteIssue', 'listEvents',
    'getNotifications', 'listStaff', 'saveZone', 'deleteZone',
    'createStaff', 'updateStaff', 'resetStaffPin',
];
const STAFF_ROLES = ['admin', 'technician', 'viewer'];
const ROLE_ADMIN = 'admin';
const ROLE_TECHNICIAN = 'technician';
const ROLE_VIEWER = 'viewer';

require __DIR__ . '/db.php';
require __DIR__ . '/photos.php';
require __DIR__ . '/lib/ratelimit.php';

// Photos written during this request; removed again if the request fails.
$GLOBALS['createdPhotos'] = [];

// Field caps (characters) so a form can never overflow the columns.
const CAP_TEXT = 2000; // free text: locationDetail, suggestion, staffNote
const CAP_NAME = 191;  // labels and names: zone, category, riskLevel, reporterName
const CAP_CODE = 64;   // codes and ids: groupId, reporterPhone
const MAX_REQUEST_BYTES = 7 * 1024 * 1024; // larger bodies are refused outright
const MAX_PAGE_SIZE = 200;
const PHOTO_SCHEMA_HINT = ' — ต้องรัน `php db/migrate.php` ให้จบก่อน แล้วลองใหม่ (README หัวข้อ "ฐานข้อมูลและการย้ายข้อมูล")';

function respond(array $body, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function fail(string $message, int $status = 400): void
{
    respond(['ok' => false, 'error' => $message], $status);
}
function capped(string $value, int $limit): string
{
    if ($limit <= 0) return $value;
    if (function_exists('mb_substr')) return mb_substr($value, 0, $limit, 'UTF-8');
    $chars = preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY);
    return $chars === false ? substr($value, 0, $limit) : implode('', array_slice($chars, 0, $limit));
}
function charLength(string $value): int
{
    if (function_exists('mb_strlen')) return mb_strlen($value, 'UTF-8');
    if (!preg_match('/[^\x00-\x7F]/', $value)) return strlen($value);
    $chars = preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY);
    return $chars === false ? strlen($value) : count($chars);
}
function field(array $input, string $key, int $max = 20000, bool $required = false, int $cap = 0): string
{
    $value = $input[$key] ?? '';
    if (!is_string($value)) fail('ข้อมูลไม่ถูกต้อง: ' . $key);
    if (charLength($value) > $max) fail('ข้อมูลไม่ถูกต้อง: ' . $key);
    $value = trim($value);
    if ($required && $value === '') fail('กรุณากรอกข้อมูล: ' . $key);
    return capped($value, $cap);
}
function optionalEmail(array $input): string
{
    $email = field($input, 'reporterEmail', 191, false, CAP_NAME);
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        fail('อีเมลผู้แจ้งไม่ถูกต้อง');
    }
    return $email;
}
/**
 * Honeypot: real users never fill the hidden "website" field. Any value means a
 * bot, so the request is refused without saying why.
 */
function cr_reject_honeypot(array $input): void
{
    $candidates = [$input['website'] ?? null];
    if (isset($input['issue']) && is_array($input['issue'])) $candidates[] = $input['issue']['website'] ?? null;
    foreach ($candidates as $value) {
        if (is_string($value) && trim($value) !== '') fail('ไม่สามารถดำเนินการได้', 400);
    }
}
/**
 * Validates a photo data URL, charges $dailyBytes of the caller's budget (0 = no
 * budget, used by staff actions) and stores it as a file; returns its path.
 */
function photoField(array $input, string $key, string $ip = '', int $dailyBytes = 0): string
{
    try {
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
/** Column rows of $table, or a 503 saying db/migrate.php has not been run. */
function tableColumns(PDO $db, string $table): array
{
    try {
        return $db->query('SHOW COLUMNS FROM ' . $table)->fetchAll();
    } catch (PDOException $e) {
        if ($e->getCode() !== '42S02') throw $e;
        fail('ยังไม่มีตาราง ' . $table . PHOTO_SCHEMA_HINT, 503);
    }
}
/** Refuses requests while the database still has the old single-table schema. */
function requireSchema(PDO $db): void
{
    $rows = tableColumns($db, 'repair_jobs');
    $columns = array_column($rows, 'Field');
    $required = [
        'before_photo_path', 'after_photo_path', 'reporter_name', 'reporter_phone',
        'reporter_email', 'assigned_staff_id', 'status',
    ];
    $missing = array_values(array_diff($required, $columns));
    if ($missing !== []) fail('ยังไม่มีคอลัมน์ ' . implode(', ', $missing) . PHOTO_SCHEMA_HINT, 503);

    foreach (['staff_users', 'staff_sessions', 'zones', 'repair_job_events'] as $table) {
        tableColumns($db, $table);
    }
    $staffColumns = array_column(tableColumns($db, 'staff_users'), 'Field');
    if (!in_array('role', $staffColumns, true)) {
        fail('ยังไม่มีคอลัมน์ staff_users.role' . PHOTO_SCHEMA_HINT, 503);
    }
}
function displayDate(?string $date): string
{
    return $date ? (new DateTimeImmutable($date))->format('d/m/Y') : '';
}
function issueRow(array $row, bool $includeContact): array
{
    $beforePath = (string) ($row['before_photo_path'] ?? '');
    $afterPath = (string) ($row['after_photo_path'] ?? '');
    return [
        'rowIndex' => (int) $row['row_index'],
        'id' => 'GW-' . str_pad((string) $row['row_index'], 3, '0', STR_PAD_LEFT),
        'createdDate' => displayDate($row['created_date']), 'dueDate' => displayDate($row['due_date']),
        'groupId' => $row['group_id'], 'zone' => $row['zone'], 'category' => $row['category'],
        'riskLevel' => $row['risk_level'], 'locationDetail' => $row['location_detail'],
        'suggestion' => $row['suggestion'],
        'reporterName' => $includeContact ? (string) ($row['reporter_name'] ?? '') : '',
        'reporterPhone' => $includeContact ? (string) ($row['reporter_phone'] ?? '') : '',
        'reporterEmail' => $includeContact ? (string) ($row['reporter_email'] ?? '') : '',
        'beforePhoto' => $beforePath, 'beforePhotoThumb' => thumbOf($beforePath),
        'status' => $row['status'], 'closedDate' => displayDate($row['closed_date']),
        'afterPhoto' => $afterPath, 'afterPhotoThumb' => thumbOf($afterPath),
        'assignedStaffId' => $row['assigned_staff_id'] !== null ? (int) $row['assigned_staff_id'] : null,
        'assignedStaffName' => (string) ($row['assigned_staff_name'] ?? ''),
        'staffNote' => $row['staff_note'],
    ];
}
function issueQuery(): string
{
    return 'SELECT r.*, s.name AS assigned_staff_name FROM repair_jobs r '
        . 'LEFT JOIN staff_users s ON s.id = r.assigned_staff_id';
}
function issue(PDO $db, int $id, bool $includeContact = true): array
{
    $query = $db->prepare(issueQuery() . ' WHERE r.row_index = ?');
    $query->execute([$id]);
    $row = $query->fetch();
    if (!$row) fail('ไม่พบรายการที่ต้องการ', 404);
    return issueRow($row, $includeContact);
}
function logEvent(
    PDO $db,
    int $jobId,
    ?int $staffId,
    string $staffName,
    string $action,
    string $fromStatus,
    string $toStatus,
    string $note
): void {
    $query = $db->prepare(
        'INSERT INTO repair_job_events (job_row_index,staff_id,staff_name,action,from_status,to_status,note) VALUES (?,?,?,?,?,?,?)'
    );
    $query->execute([$jobId, $staffId, $staffName, $action, $fromStatus, $toStatus, $note]);
}
function ensureDefaultStaff(PDO $db, array $config): void
{
    $count = (int) $db->query('SELECT COUNT(*) FROM staff_users')->fetchColumn();
    if ($count > 0) return;

    $pin = (string) ($config['staff_pin'] ?? '');
    if (!preg_match('/^[0-9]{4,}$/D', $pin)) {
        fail('ยังไม่มีบัญชีเจ้าหน้าที่ และ STAFF_PIN ไม่ถูกต้อง — ตั้ง STAFF_PIN อย่างน้อย 4 หลัก หรือรัน php db/create-staff.php', 503);
    }
    $name = trim((string) ($config['staff_name'] ?? '')) ?: 'เจ้าหน้าที่';
    $query = $db->prepare('INSERT INTO staff_users (name,pin_hash,role) VALUES (?,?,?)');
    $query->execute([$name, password_hash($pin, PASSWORD_DEFAULT), ROLE_ADMIN]);
}
function loginStaff(PDO $db, array $input, array $config): array
{
    ensureDefaultStaff($db, $config);
    $name = field($input, 'staffName', 191, true, CAP_NAME);
    $pin = field($input, 'pin', 128, true);

    $query = $db->prepare('SELECT * FROM staff_users WHERE name = ? LIMIT 1');
    $query->execute([$name]);
    $staff = $query->fetch();
    if (!$staff || !(int) $staff['active']) fail('ชื่อหรือ PIN ไม่ถูกต้อง', 403);
    if ($staff['locked_until'] !== null && strtotime((string) $staff['locked_until']) > time()) {
        fail('บัญชีถูกล็อกชั่วคราวจากการลองผิดหลายครั้ง กรุณาลองใหม่ภายหลัง', 429);
    }
    if (!password_verify($pin, (string) $staff['pin_hash'])) {
        $failed = (int) $staff['failed_attempts'] + 1;
        $lockedUntil = $failed >= 5 ? date('Y-m-d H:i:s', time() + 15 * 60) : null;
        $update = $db->prepare('UPDATE staff_users SET failed_attempts=?, locked_until=? WHERE id=?');
        $update->execute([$failed, $lockedUntil, $staff['id']]);
        fail($lockedUntil !== null ? 'ลองผิดหลายครั้ง บัญชีถูกล็อก 15 นาที' : 'ชื่อหรือ PIN ไม่ถูกต้อง', 403);
    }

    $db->prepare('UPDATE staff_users SET failed_attempts=0, locked_until=NULL WHERE id=?')->execute([$staff['id']]);
    $token = bin2hex(random_bytes(32));
    $insert = $db->prepare('INSERT INTO staff_sessions (token_hash,staff_id,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 12 HOUR))');
    $insert->execute([hash('sha256', $token), $staff['id']]);
    return [
        'token' => $token,
        'staff' => [
            'id' => (int) $staff['id'],
            'name' => $staff['name'],
            'role' => $staff['role'] ?? ROLE_TECHNICIAN,
        ],
    ];
}
function requireStaff(PDO $db, array $input): array
{
    $token = field($input, 'token', 128);
    if ($token === '') fail('กรุณาเข้าสู่ระบบเจ้าหน้าที่', 401);
    $query = $db->prepare(
        'SELECT u.id, u.name, u.role FROM staff_sessions s JOIN staff_users u ON u.id = s.staff_id '
        . 'WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.active = 1 LIMIT 1'
    );
    $query->execute([hash('sha256', $token)]);
    $row = $query->fetch();
    if (!$row) fail('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'role' => $row['role'] ?? ROLE_TECHNICIAN,
    ];
}
function requireEditor(array $staff): void
{
    if (!in_array($staff['role'], [ROLE_ADMIN, ROLE_TECHNICIAN], true)) {
        fail('บัญชีนี้เป็นแบบอ่านอย่างเดียว ไม่สามารถแก้ไขงานได้', 403);
    }
}
function requireAdmin(array $staff): void
{
    if ($staff['role'] !== ROLE_ADMIN) fail('เฉพาะผู้ดูแลระบบเท่านั้น', 403);
}
function logoutStaff(PDO $db, array $input): void
{
    $token = field($input, 'token', 128);
    if ($token === '') return;
    $db->prepare('DELETE FROM staff_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
}
function staffIdOrNull(PDO $db, array $input, string $key): ?int
{
    if (!array_key_exists($key, $input)) return null;
    $raw = $input[$key];
    if ($raw === null || $raw === '' || (int) $raw === 0) return null;
    $id = filter_var($raw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) fail('ผู้รับผิดชอบไม่ถูกต้อง');
    $query = $db->prepare('SELECT id FROM staff_users WHERE id = ? AND active = 1');
    $query->execute([$id]);
    if ($query->fetchColumn() === false) fail('ไม่พบเจ้าหน้าที่ที่เลือก');
    return (int) $id;
}
function listIssues(PDO $db, array $input): array
{
    $includeContact = false;
    if (isset($input['token']) && is_string($input['token']) && trim($input['token']) !== '') {
        requireStaff($db, $input);
        $includeContact = true;
    }

    $page = max(1, (int) ($input['page'] ?? 1));
    $pageSize = min(MAX_PAGE_SIZE, max(1, (int) ($input['pageSize'] ?? 20)));
    $status = field($input, 'status', 100);
    $zone = field($input, 'zone', 255, false, CAP_NAME);
    $search = field($input, 'search', 100);
    $assigned = $input['assignedStaffId'] ?? null;

    $where = [];
    $params = [];
    if ($status !== '') {
        if (!in_array($status, STATUSES, true)) fail('สถานะไม่ถูกต้อง');
        $where[] = 'r.status = ?';
        $params[] = $status;
    }
    if ($zone !== '') {
        $where[] = 'r.zone = ?';
        $params[] = $zone;
    }
    if ($search !== '') {
        $like = '%' . $search . '%';
        $where[] = '(r.zone LIKE ? OR r.category LIKE ? OR r.location_detail LIKE ? OR r.reporter_name LIKE ? OR CONCAT("GW-", LPAD(r.row_index, 3, "0")) LIKE ?)';
        array_push($params, $like, $like, $like, $like, $like);
    }
    if ($assigned !== null && $assigned !== '') {
        $where[] = 'r.assigned_staff_id = ?';
        $params[] = (int) $assigned;
    }
    $whereSql = $where === [] ? '' : ' WHERE ' . implode(' AND ', $where);

    $count = $db->prepare('SELECT COUNT(*) FROM repair_jobs r' . $whereSql);
    $count->execute($params);
    $total = (int) $count->fetchColumn();

    $query = $db->prepare(issueQuery() . $whereSql . ' ORDER BY r.created_at DESC, r.row_index DESC LIMIT ? OFFSET ?');
    $position = 1;
    foreach ($params as $param) $query->bindValue($position++, $param, PDO::PARAM_STR);
    $query->bindValue($position++, $pageSize, PDO::PARAM_INT);
    $query->bindValue($position, ($page - 1) * $pageSize, PDO::PARAM_INT);
    $query->execute();

    $issues = array_map(
        fn(array $row) => issueRow($row, $includeContact),
        $query->fetchAll()
    );
    return ['issues' => $issues, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize];
}
function getStats(PDO $db): array
{
    $terminal = "'" . implode("','", TERMINAL_STATUSES) . "'";
    $row = $db->query(
        "SELECT COUNT(*) AS total, "
        . "COALESCE(SUM(status IN ($terminal)), 0) AS closed, "
        . "COALESCE(SUM(status NOT IN ($terminal)), 0) AS pending, "
        . "COUNT(DISTINCT group_id) AS groups, "
        . "COALESCE(SUM(status NOT IN ($terminal) AND due_date <= DATE_ADD(CURDATE(), INTERVAL 3 DAY)), 0) AS dueSoon "
        . 'FROM repair_jobs'
    )->fetch();
    return [
        'total' => (int) $row['total'],
        'closed' => (int) $row['closed'],
        'pending' => (int) $row['pending'],
        'groups' => (int) $row['groups'],
        'dueSoon' => (int) $row['dueSoon'],
    ];
}
function getNotifications(PDO $db): array
{
    $terminal = "'" . implode("','", TERMINAL_STATUSES) . "'";
    $rows = $db->query(
        "SELECT row_index, zone, due_date, status, assigned_staff_id, DATEDIFF(due_date, CURDATE()) AS days_left "
        . "FROM repair_jobs WHERE status NOT IN ($terminal) AND due_date <= DATE_ADD(CURDATE(), INTERVAL 3 DAY) "
        . 'ORDER BY due_date ASC, row_index ASC LIMIT 50'
    )->fetchAll();
    $items = array_map(fn(array $row) => [
        'id' => 'GW-' . str_pad((string) $row['row_index'], 3, '0', STR_PAD_LEFT),
        'rowIndex' => (int) $row['row_index'],
        'zone' => $row['zone'],
        'dueDate' => displayDate($row['due_date']),
        'status' => $row['status'],
        'daysLeft' => (int) $row['days_left'],
        'kind' => (int) $row['days_left'] < 0 ? 'overdue' : 'due',
    ], $rows);

    $unassigned = (int) $db->query(
        "SELECT COUNT(*) FROM repair_jobs WHERE status NOT IN ($terminal) AND assigned_staff_id IS NULL"
    )->fetchColumn();
    return ['items' => $items, 'count' => count($items), 'unassigned' => $unassigned];
}
function listZones(PDO $db): array
{
    $rows = $db->query('SELECT id, group_id, name, detail, active, sort_order FROM zones ORDER BY sort_order, name')->fetchAll();
    return array_map(fn(array $row) => [
        'id' => (int) $row['id'],
        'groupId' => $row['group_id'],
        'name' => $row['name'],
        'detail' => $row['detail'],
        'active' => (bool) $row['active'],
        'sortOrder' => (int) $row['sort_order'],
    ], $rows);
}
function saveZone(PDO $db, array $input): array
{
    $id = isset($input['id']) && $input['id'] !== '' ? (int) $input['id'] : 0;
    $groupId = field($input, 'groupId', 64, true, CAP_CODE);
    $name = field($input, 'name', 191, true, CAP_NAME);
    $detail = field($input, 'detail', 255, false, CAP_NAME);
    $active = isset($input['active']) && !$input['active'] ? 0 : 1;
    $sortOrder = (int) ($input['sortOrder'] ?? 0);

    try {
        if ($id > 0) {
            $query = $db->prepare('UPDATE zones SET group_id=?, name=?, detail=?, active=?, sort_order=? WHERE id=?');
            $query->execute([$groupId, $name, $detail, $active, $sortOrder, $id]);
        } else {
            $query = $db->prepare('INSERT INTO zones (group_id, name, detail, active, sort_order) VALUES (?,?,?,?,?)');
            $query->execute([$groupId, $name, $detail, $active, $sortOrder]);
            $id = (int) $db->lastInsertId();
        }
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail('รหัสอาคาร/พื้นที่นี้มีอยู่แล้ว');
        throw $e;
    }
    $query = $db->prepare('SELECT id, group_id, name, detail, active, sort_order FROM zones WHERE id=?');
    $query->execute([$id]);
    $row = $query->fetch();
    return [
        'id' => (int) $row['id'], 'groupId' => $row['group_id'], 'name' => $row['name'],
        'detail' => $row['detail'], 'active' => (bool) $row['active'], 'sortOrder' => (int) $row['sort_order'],
    ];
}
function updateStatus(PDO $db, array $input, array $staff, array $config): array
{
    $id = filter_var($input['rowIndex'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) fail('rowIndex ไม่ถูกต้อง');
    $status = field($input, 'status', 100, true);
    if (!in_array($status, STATUSES, true)) fail('สถานะไม่ถูกต้อง');
    $current = issue($db, $id, true);
    $closed = in_array($status, TERMINAL_STATUSES, true);
    $note = array_key_exists('staffNote', $input) ? field($input, 'staffNote', 20000, false, CAP_TEXT) : $current['staffNote'];
    $photo = photoField($input, 'afterPhotoDataUrl');
    $assignedProvided = array_key_exists('assignedStaffId', $input);
    $assignedId = $assignedProvided ? staffIdOrNull($db, $input, 'assignedStaffId') : null;

    $sql = 'UPDATE repair_jobs SET status=?, closed_date=?, staff_note=?, after_photo_path=COALESCE(NULLIF(?,\'\'), after_photo_path)';
    $params = [$status, $closed ? date('Y-m-d') : null, $note, $photo];
    if ($assignedProvided) {
        $sql .= ', assigned_staff_id=?';
        $params[] = $assignedId;
    }
    $sql .= ' WHERE row_index=?';
    $params[] = $id;
    $db->prepare($sql)->execute($params);

    if ($photo !== '' && $current['afterPhoto'] !== '' && $current['afterPhoto'] !== $photo) {
        discardPhoto($current['afterPhoto']);
    }
    logEvent($db, $id, $staff['id'], $staff['name'], 'status', $current['status'], $status, $note);
    return issue($db, $id, true);
}
function updateIssue(PDO $db, array $input, array $staff): array
{
    $item = $input['issue'] ?? null;
    if (!is_array($item)) fail('ข้อมูลรายการไม่ถูกต้อง');
    $id = filter_var($item['rowIndex'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) fail('rowIndex ไม่ถูกต้อง');
    $current = issue($db, $id, true);

    $groupId = field($item, 'groupId', 100, true, CAP_CODE);
    $zone = field($item, 'zone', 255, true, CAP_NAME);
    $category = field($item, 'category', 255, false, CAP_NAME);
    $risk = field($item, 'riskLevel', 100, false, CAP_NAME);
    $location = field($item, 'locationDetail', 20000, false, CAP_TEXT);
    $suggestion = field($item, 'suggestion', 20000, false, CAP_TEXT);
    $reporterName = field($item, 'reporterName', 191, false, CAP_NAME);
    $reporterPhone = field($item, 'reporterPhone', 64, false, CAP_CODE);
    $reporterEmail = optionalEmail($item);
    $assignedProvided = array_key_exists('assignedStaffId', $item);
    $assignedId = $assignedProvided ? staffIdOrNull($db, $item, 'assignedStaffId') : null;

    $sql = 'UPDATE repair_jobs SET group_id=?, zone=?, category=?, risk_level=?, location_detail=?, suggestion=?, reporter_name=?, reporter_phone=?, reporter_email=?';
    $params = [$groupId, $zone, $category, $risk, $location, $suggestion, $reporterName, $reporterPhone, $reporterEmail];
    if ($assignedProvided) {
        $sql .= ', assigned_staff_id=?';
        $params[] = $assignedId;
    }
    $sql .= ' WHERE row_index=?';
    $params[] = $id;
    $db->prepare($sql)->execute($params);

    logEvent($db, $id, $staff['id'], $staff['name'], 'edit', $current['status'], $current['status'], 'แก้ไขรายละเอียดงาน');
    return issue($db, $id, true);
}
function deleteIssue(PDO $db, array $input, array $staff): void
{
    $id = filter_var($input['rowIndex'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) fail('rowIndex ไม่ถูกต้อง');
    $current = issue($db, $id, true);
    logEvent($db, $id, $staff['id'], $staff['name'], 'delete', $current['status'], '', 'ลบรายการแจ้งซ่อม');
    $db->prepare('DELETE FROM repair_jobs WHERE row_index=?')->execute([$id]);
    discardPhoto($current['beforePhoto']);
    discardPhoto($current['afterPhoto']);
}
function listEvents(PDO $db, array $input): array
{
    $id = filter_var($input['rowIndex'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) fail('rowIndex ไม่ถูกต้อง');
    $query = $db->prepare('SELECT * FROM repair_job_events WHERE job_row_index=? ORDER BY id DESC LIMIT 100');
    $query->execute([$id]);
    return array_map(fn(array $row) => [
        'id' => (int) $row['id'],
        'action' => $row['action'],
        'fromStatus' => $row['from_status'],
        'toStatus' => $row['to_status'],
        'note' => $row['note'],
        'staffName' => $row['staff_name'],
        'createdAt' => (new DateTimeImmutable($row['created_at'], new DateTimeZone('UTC')))->format(DATE_ATOM),
    ], $query->fetchAll());
}
function staffSummary(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'role' => $row['role'] ?? ROLE_TECHNICIAN,
        'active' => (bool) $row['active'],
        'failedAttempts' => (int) ($row['failed_attempts'] ?? 0),
        'lockedUntil' => $row['locked_until'] ?? null,
    ];
}
function staffById(PDO $db, int $id): array
{
    $query = $db->prepare('SELECT * FROM staff_users WHERE id = ? LIMIT 1');
    $query->execute([$id]);
    $row = $query->fetch();
    if (!$row) fail('ไม่พบบัญชีเจ้าหน้าที่', 404);
    return $row;
}
function countOtherActiveAdmins(PDO $db, int $exceptId): int
{
    $query = $db->prepare("SELECT COUNT(*) FROM staff_users WHERE active = 1 AND role = 'admin' AND id <> ?");
    $query->execute([$exceptId]);
    return (int) $query->fetchColumn();
}
function validRole(string $role): bool
{
    return in_array($role, STAFF_ROLES, true);
}
function createStaff(PDO $db, array $input): array
{
    $name = field($input, 'name', 191, true, CAP_NAME);
    $pin = field($input, 'pin', 128, true);
    $role = field($input, 'role', 20, false) ?: ROLE_TECHNICIAN;
    if (!validRole($role)) fail('บทบาทไม่ถูกต้อง');
    if (!preg_match('/^[0-9]{4,}$/D', $pin)) fail('PIN ต้องเป็นตัวเลขอย่างน้อย 4 หลัก');

    try {
        $query = $db->prepare('INSERT INTO staff_users (name,pin_hash,role,active) VALUES (?,?,?,1)');
        $query->execute([$name, password_hash($pin, PASSWORD_DEFAULT), $role]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail('ชื่อเจ้าหน้าที่นี้มีอยู่แล้ว');
        throw $e;
    }
    return staffSummary(staffById($db, (int) $db->lastInsertId()));
}
function updateStaff(PDO $db, array $input, array $actor): array
{
    $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) fail('id ไม่ถูกต้อง');
    $current = staffById($db, $id);
    $name = array_key_exists('name', $input) ? field($input, 'name', 191, true, CAP_NAME) : $current['name'];
    $role = array_key_exists('role', $input) ? field($input, 'role', 20, true) : ($current['role'] ?? ROLE_TECHNICIAN);
    if (!validRole($role)) fail('บทบาทไม่ถูกต้อง');
    $active = array_key_exists('active', $input)
        ? filter_var($input['active'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
        : (bool) $current['active'];
    if ($active === null) fail('สถานะบัญชีไม่ถูกต้อง');

    if ($id === (int) $actor['id'] && !$active) fail('ปิดใช้งานบัญชีของตัวเองไม่ได้');
    if ((bool) $current['active'] && ($current['role'] ?? '') === ROLE_ADMIN && (!$active || $role !== ROLE_ADMIN)) {
        if (countOtherActiveAdmins($db, $id) === 0) fail('ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อยหนึ่งบัญชี');
    }

    try {
        $query = $db->prepare('UPDATE staff_users SET name=?, role=?, active=? WHERE id=?');
        $query->execute([$name, $role, $active ? 1 : 0, $id]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail('ชื่อเจ้าหน้าที่นี้มีอยู่แล้ว');
        throw $e;
    }
    if (!$active) $db->prepare('DELETE FROM staff_sessions WHERE staff_id=?')->execute([$id]);
    return staffSummary(staffById($db, $id));
}
function resetStaffPin(PDO $db, array $input, array $actor): array
{
    $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) fail('id ไม่ถูกต้อง');
    $staff = staffById($db, $id);
    $pin = field($input, 'pin', 128, true);
    if (!preg_match('/^[0-9]{4,}$/D', $pin)) fail('PIN ต้องเป็นตัวเลขอย่างน้อย 4 หลัก');

    $query = $db->prepare('UPDATE staff_users SET pin_hash=?, failed_attempts=0, locked_until=NULL WHERE id=?');
    $query->execute([password_hash($pin, PASSWORD_DEFAULT), $id]);
    if ($id !== (int) $actor['id']) {
        $db->prepare('DELETE FROM staff_sessions WHERE staff_id=?')->execute([$id]);
    }
    return staffSummary(staffById($db, $id));
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
    $raw = (string) file_get_contents('php://input', false, null, 0, MAX_REQUEST_BYTES + 1);
    if (strlen($raw) > MAX_REQUEST_BYTES) fail('ข้อมูลหรือรูปภาพมีขนาดใหญ่เกินไป', 413);
    try {
        $input = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        fail('JSON ไม่ถูกต้อง');
    }
    if (!is_array($input)) fail('ข้อมูลไม่ถูกต้อง');

    $action = field($input, 'action', 50, true);
    $config = require __DIR__ . '/config.php';
    $clientIp = clientIp($config['trusted_proxies'] ?? []);
    $db = openDatabase($config);
    requireSchema($db);

    if ($action === 'loginStaff') {
        rateLimitCleanup();
        if (!rateLimitHit('staffLogin', $clientIp)) {
            header('Retry-After: 60');
            fail('เข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่', 429);
        }
        respond(['ok' => true, ...loginStaff($db, $input, $config)]);
    }
    if ($action === 'logoutStaff') {
        logoutStaff($db, $input);
        respond(['ok' => true]);
    }
    if (!in_array($action, [...PUBLIC_ACTIONS, ...STAFF_ACTIONS], true)) {
        fail('ไม่รู้จักคำสั่ง');
    }

    if ($action === 'createIssue') {
        cr_reject_honeypot($input);
        rateLimitCleanup();
        if (!rateLimitHit($action, $clientIp)) {
            header('Retry-After: 60');
            fail('ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่', 429);
        }
        $item = $input['issue'] ?? null;
        if (!is_array($item)) fail('ข้อมูลรายการไม่ถูกต้อง');
        $today = new DateTimeImmutable('today');
        $values = [
            $today->format('Y-m-d'), $today->modify('+30 days')->format('Y-m-d'),
            field($item, 'groupId', 100, true, CAP_CODE), field($item, 'zone', 255, true, CAP_NAME),
            field($item, 'category', 255, false, CAP_NAME), field($item, 'riskLevel', 100, false, CAP_NAME),
            field($item, 'locationDetail', 20000, false, CAP_TEXT), field($item, 'suggestion', 20000, false, CAP_TEXT),
            field($item, 'reporterName', 191, false, CAP_NAME), field($item, 'reporterPhone', 64, false, CAP_CODE),
            optionalEmail($item),
            photoField($item, 'beforePhotoDataUrl', $clientIp, (int) ($config['upload_daily_bytes'] ?? 0)), '',
        ];
        $query = $db->prepare(
            'INSERT INTO repair_jobs (created_date,due_date,group_id,zone,category,risk_level,location_detail,suggestion,reporter_name,reporter_phone,reporter_email,before_photo_path,staff_note) '
            . 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
        );
        $query->execute($values);
        $id = (int) $db->lastInsertId();
        logEvent($db, $id, null, $values[8] !== '' ? $values[8] : 'ผู้แจ้ง', 'create', '', STATUS_PENDING, '');
        respond(['ok' => true, 'issue' => issue($db, $id, false)]);
    }

    if ($action === 'listIssues') {
        respond(['ok' => true, ...listIssues($db, $input)]);
    }
    if ($action === 'getStats') {
        respond(['ok' => true, 'stats' => getStats($db)]);
    }
    if ($action === 'listZones') {
        respond(['ok' => true, 'zones' => listZones($db)]);
    }

    $staff = requireStaff($db, $input);
    $adminActions = ['deleteIssue', 'saveZone', 'deleteZone', 'createStaff', 'updateStaff', 'resetStaffPin'];
    if (in_array($action, $adminActions, true)) requireAdmin($staff);
    if (in_array($action, ['updateStatus', 'updateIssue'], true)) requireEditor($staff);

    if ($action === 'updateStatus') {
        respond(['ok' => true, 'issue' => updateStatus($db, $input, $staff, $config)]);
    }
    if ($action === 'updateIssue') {
        respond(['ok' => true, 'issue' => updateIssue($db, $input, $staff)]);
    }
    if ($action === 'deleteIssue') {
        deleteIssue($db, $input, $staff);
        respond(['ok' => true]);
    }
    if ($action === 'listEvents') {
        respond(['ok' => true, 'events' => listEvents($db, $input)]);
    }
    if ($action === 'getNotifications') {
        respond(['ok' => true, ...getNotifications($db)]);
    }
    if ($action === 'listStaff') {
        $rows = $db->query('SELECT * FROM staff_users ORDER BY active DESC, name')->fetchAll();
        respond(['ok' => true, 'staff' => array_map('staffSummary', $rows)]);
    }
    if ($action === 'createStaff') {
        respond(['ok' => true, 'staff' => createStaff($db, $input)]);
    }
    if ($action === 'updateStaff') {
        respond(['ok' => true, 'staff' => updateStaff($db, $input, $staff)]);
    }
    if ($action === 'resetStaffPin') {
        respond(['ok' => true, 'staff' => resetStaffPin($db, $input, $staff)]);
    }
    if ($action === 'saveZone') {
        respond(['ok' => true, 'zone' => saveZone($db, $input)]);
    }
    if ($action === 'deleteZone') {
        $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($id === false) fail('id ไม่ถูกต้อง');
        $db->prepare('UPDATE zones SET active=0 WHERE id=?')->execute([$id]);
        respond(['ok' => true]);
    }
} catch (Throwable $e) {
    foreach ($GLOBALS['createdPhotos'] as $photo) discardPhoto($photo);
    $requestId = bin2hex(random_bytes(6));
    error_log('Campus Repair API [' . $requestId . ']: ' . $e->getMessage());
    fail('เชื่อมต่อหรือบันทึกฐานข้อมูลไม่ได้ (รหัสอ้างอิง ' . $requestId . ') กรุณาตรวจ config, รัน db/migrate.php และดู PHP error log', 500);
}
