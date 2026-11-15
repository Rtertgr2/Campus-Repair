<?php
/**
 * งานซ่อม — listIssues / createIssue / updateStatus / verifyPin / exportIssues
 * ผลลัพธ์ใช้ key แบบ RawIssue ใน src/lib/api.ts (beforePhotoUrl / afterPhotoUrl)
 *
 * เพิ่มความสามารถ:
 *   - วันครบกำหนดตามความเร่งด่วน (SLA): สูง 3 วัน / ปานกลาง 7 วัน / ต่ำ 30 วัน
 *   - ค้นหา + กรอง + แบ่งหน้า (cr_list_issues)
 *   - สรุปรายการ (cr_issue_stats)
 *   - ประวัติการเปลี่ยนสถานะ (status_history)
 *   - ข้อมูลผู้แจ้ง (ชื่อ/ช่องทางติดต่อ/ห้อง)
 */

define('CR_STATUS_PENDING', 'รอแก้ไข');
define('CR_STATUS_CLOSED', 'ปิดงานแล้ว');

/** คอลัมน์ที่ส่งให้ frontend — วันที่เป็น dd/mm/yyyy */
define('CR_ISSUE_SELECT', "
    row_index AS rowIndex,
    id,
    DATE_FORMAT(created_date, '%d/%m/%Y') AS createdDate,
    DATE_FORMAT(due_date, '%d/%m/%Y') AS dueDate,
    due_date AS dueDateRaw,
    group_id AS groupId,
    zone,
    room,
    category,
    risk_level AS riskLevel,
    location_detail AS locationDetail,
    suggestion,
    reporter_name AS reporterName,
    reporter_contact AS reporterContact,
    before_photo_url AS beforePhotoUrl,
    status,
    COALESCE(DATE_FORMAT(closed_date, '%d/%m/%Y'), '') AS closedDate,
    after_photo_url AS afterPhotoUrl,
    staff_note AS staffNote,
    DATE_FORMAT(created_at, '%d/%m/%Y %H:%i') AS createdAt
");

/** จำนวนวันที่เลยกำหนด (0 = ยังไม่เลย หรือปิดงานแล้ว) */
function cr_overdue_days($status, $dueDateRaw)
{
    if (cr_str($status) !== CR_STATUS_PENDING) {
        return 0;
    }
    $due = cr_str($dueDateRaw);
    if ($due === '') {
        return 0;
    }
    $dueTime = strtotime($due);
    $today = strtotime(date('Y-m-d'));
    if ($dueTime === false || $dueTime >= $today) {
        return 0;
    }
    return (int) floor(($today - $dueTime) / 86400);
}

/** แปลงแถวจากฐานข้อมูลเป็น object สำหรับ frontend */
function cr_issue_from_row($row)
{
    $status = cr_str($row['status']);
    if ($status === '') {
        $status = CR_STATUS_PENDING;
    }

    return array(
        'rowIndex' => (int) $row['rowIndex'],
        'id' => cr_str($row['id']),
        'createdDate' => cr_str($row['createdDate']),
        'dueDate' => cr_str($row['dueDate']),
        'dueDateRaw' => cr_str($row['dueDateRaw'] ?? ''),
        'groupId' => cr_str($row['groupId']),
        'zone' => cr_str($row['zone']),
        'room' => cr_str($row['room'] ?? ''),
        'category' => cr_str($row['category']),
        'riskLevel' => cr_str($row['riskLevel']),
        'locationDetail' => cr_str($row['locationDetail']),
        'suggestion' => cr_str($row['suggestion']),
        'reporterName' => cr_str($row['reporterName'] ?? ''),
        'reporterContact' => cr_str($row['reporterContact'] ?? ''),
        'beforePhotoUrl' => cr_photo_url($row['beforePhotoUrl']),
        'status' => $status,
        'closedDate' => cr_str($row['closedDate']),
        'afterPhotoUrl' => cr_photo_url($row['afterPhotoUrl']),
        'staffNote' => cr_str($row['staffNote']),
        'createdAt' => cr_str($row['createdAt'] ?? ''),
        'overdueDays' => cr_overdue_days($status, $row['dueDateRaw'] ?? ''),
    );
}

/** ซ่อนข้อมูลส่วนบุคคลของผู้แจ้ง (ใช้เมื่อคำขอไม่ได้แนบ PIN เจ้าหน้าที่) */
function cr_redact_issue($issue)
{
    $issue['reporterName'] = '';
    $issue['reporterContact'] = '';
    if (isset($issue['history']) && is_array($issue['history'])) {
        foreach ($issue['history'] as $key => $entry) {
            $issue['history'][$key]['staffName'] = '';
        }
    }
    return $issue;
}

/* ------------------------------------------------------ ตัวกรอง/แบ่งหน้า */

/** อ่านค่า filters จาก body (รับได้ทั้ง filters{...} และค่าที่ส่งมาตรง ๆ) */
function cr_read_filters($body)
{
    $raw = isset($body['filters']) && is_array($body['filters']) ? $body['filters'] : $body;

    $date = function ($value) {
        $value = trim(cr_str($value));
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) {
            return '';
        }
        $time = strtotime($value);
        return $time === false ? '' : date('Y-m-d', $time);
    };

    $pageSize = (int) cr_str($raw['pageSize'] ?? null, '20');
    if ($pageSize < 1) {
        $pageSize = 20;
    }
    $pageSize = min(100, $pageSize);

    return array(
        'search' => trim(cr_str($raw['search'] ?? null)),
        'zone' => trim(cr_str($raw['zone'] ?? null)),
        'category' => trim(cr_str($raw['category'] ?? null)),
        'status' => trim(cr_str($raw['status'] ?? null)),
        'riskLevel' => trim(cr_str($raw['riskLevel'] ?? null)),
        'dateFrom' => $date($raw['dateFrom'] ?? null),
        'dateTo' => $date($raw['dateTo'] ?? null),
        'page' => max(1, (int) cr_str($raw['page'] ?? null, '1')),
        'pageSize' => $pageSize,
        'overdueOnly' => cr_str($raw['overdueOnly'] ?? null) === '1' || ($raw['overdueOnly'] ?? null) === true,
    );
}

/**
 * ต่อ WHERE จาก filters (คืน [sql, params])
 * ค้นหาชื่อผู้แจ้ง/หมายเหตุได้เฉพาะเมื่อเป็นเจ้าหน้าที่ (กันการเดาว่าใครแจ้งอะไร)
 */
function cr_filter_sql($filters, $includePrivate = true)
{
    $where = array();
    $params = array();

    if ($filters['search'] !== '') {
        $term = '%' . addcslashes($filters['search'], '%_\\') . '%';
        $fields = array('id', 'zone', 'room', 'category', 'location_detail');
        if ($includePrivate) {
            $fields[] = 'reporter_name';
            $fields[] = 'staff_note';
        }
        $clauses = array();
        foreach ($fields as $field) {
            $clauses[] = $field . ' LIKE ?';
            $params[] = $term;
        }
        $where[] = '(' . implode(' OR ', $clauses) . ')';
    }
    if ($filters['zone'] !== '') {
        $where[] = 'zone = ?';
        $params[] = $filters['zone'];
    }
    if ($filters['category'] !== '') {
        $where[] = 'category = ?';
        $params[] = $filters['category'];
    }
    if ($filters['status'] === CR_STATUS_PENDING || $filters['status'] === CR_STATUS_CLOSED) {
        $where[] = 'status = ?';
        $params[] = $filters['status'];
    }
    if ($filters['riskLevel'] !== '') {
        $where[] = 'risk_level = ?';
        $params[] = $filters['riskLevel'];
    }
    if ($filters['dateFrom'] !== '') {
        $where[] = 'created_date >= ?';
        $params[] = $filters['dateFrom'];
    }
    if ($filters['dateTo'] !== '') {
        $where[] = 'created_date <= ?';
        $params[] = $filters['dateTo'];
    }
    if (!empty($filters['overdueOnly'])) {
        $where[] = "status = 'รอแก้ไข' AND due_date < CURDATE()";
    }

    return array($where ? ' WHERE ' . implode(' AND ', $where) : '', $params);
}

/**
 * รายการงานซ่อมพร้อมกรอง/แบ่งหน้า
 * คืน ['issues' => [...], 'total' => n, 'page' => p, 'pageSize' => s]
 */
function cr_list_issues(PDO $db, $body = array(), $includePrivate = false)
{
    $filters = cr_read_filters(is_array($body) ? $body : array());
    list($where, $params) = cr_filter_sql($filters, $includePrivate);

    $countStmt = $db->prepare('SELECT COUNT(*) AS total FROM repair_jobs' . $where);
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $sql = 'SELECT ' . CR_ISSUE_SELECT . ' FROM repair_jobs' . $where .
        ' ORDER BY row_index DESC LIMIT ' . (int) $filters['pageSize'] .
        ' OFFSET ' . (int) (($filters['page'] - 1) * $filters['pageSize']);
    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    $issues = array_map('cr_issue_from_row', $stmt->fetchAll());
    $issues = cr_attach_history($db, $issues);
    if (!$includePrivate) {
        // ไม่แนบ PIN เจ้าหน้าที่ → ไม่ส่งข้อมูลผู้แจ้งกลับไป (หน้า tracker สาธารณะยังใช้ได้)
        $issues = array_map('cr_redact_issue', $issues);
    }

    return array(
        'issues' => $issues,
        'total' => $total,
        'page' => $filters['page'],
        'pageSize' => $filters['pageSize'],
        'pages' => $filters['pageSize'] > 0 ? (int) ceil($total / $filters['pageSize']) : 0,
    );
}

/** สรุปรายการทั้งหมด (ไม่ขึ้นกับตัวกรอง) */
function cr_issue_stats(PDO $db)
{
    $sql = "SELECT
                COUNT(*) AS total,
                COALESCE(SUM(status = 'รอแก้ไข'), 0) AS pending,
                COALESCE(SUM(status = 'ปิดงานแล้ว'), 0) AS closed,
                COALESCE(SUM(status = 'รอแก้ไข' AND due_date < CURDATE()), 0) AS overdue,
                ROUND(AVG(CASE WHEN status = 'ปิดงานแล้ว' AND closed_date IS NOT NULL
                          THEN DATEDIFF(closed_date, created_date) END), 1) AS avgRepairDays
            FROM repair_jobs";
    $row = $db->query($sql)->fetch();

    $total = (int) ($row['total'] ?? 0);
    $closed = (int) ($row['closed'] ?? 0);

    return array(
        'total' => $total,
        'pending' => (int) ($row['pending'] ?? 0),
        'closed' => $closed,
        'overdue' => (int) ($row['overdue'] ?? 0),
        'closureRate' => $total > 0 ? (int) round(($closed / $total) * 100) : 0,
        'avgRepairDays' => $row['avgRepairDays'] === null ? null : (float) $row['avgRepairDays'],
    );
}

/* ------------------------------------------------------- ประวัติสถานะ */

/** ดึงประวัติของหลายรายการในครั้งเดียว แล้วแนบเข้าไปใน issue แต่ละตัว */
function cr_attach_history(PDO $db, $issues)
{
    if (empty($issues)) {
        return $issues;
    }

    $indexes = array();
    foreach ($issues as $issue) {
        $indexes[] = (int) $issue['rowIndex'];
    }
    $placeholders = implode(',', array_fill(0, count($indexes), '?'));

    $stmt = $db->prepare(
        'SELECT issue_row_index AS issueRowIndex, issue_id AS issueId, from_status AS fromStatus,
                to_status AS toStatus, staff_name AS staffName, note,
                DATE_FORMAT(created_at, \'%d/%m/%Y %H:%i\') AS createdAt
         FROM status_history WHERE issue_row_index IN (' . $placeholders . ')
         ORDER BY row_index ASC'
    );
    $stmt->execute($indexes);

    $byIssue = array();
    foreach ($stmt->fetchAll() as $row) {
        $byIssue[(int) $row['issueRowIndex']][] = array(
            'fromStatus' => cr_str($row['fromStatus']),
            'toStatus' => cr_str($row['toStatus']),
            'staffName' => cr_str($row['staffName']),
            'note' => cr_str($row['note']),
            'createdAt' => cr_str($row['createdAt']),
        );
    }

    foreach ($issues as $key => $issue) {
        $issues[$key]['history'] = $byIssue[(int) $issue['rowIndex']] ?? array();
    }
    return $issues;
}

/** บันทึกประวัติการเปลี่ยนสถานะ (ล้มเหลวไม่ทำให้คำขอหลักพัง) */
function cr_record_history(PDO $db, $rowIndex, $issueId, $from, $to, $staffName, $note)
{
    try {
        $stmt = $db->prepare(
            'INSERT INTO status_history (issue_row_index, issue_id, from_status, to_status, staff_name, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute(array(
            (int) $rowIndex,
            cr_str($issueId),
            cr_str($from),
            cr_str($to),
            mb_substr(cr_str($staffName), 0, 191),
            cr_str($note),
            date('Y-m-d H:i:s'),
        ));
    } catch (Throwable $e) {
        error_log('[campus-repair] history: ' . $e->getMessage());
    }
}

/* ------------------------------------------------------------- CRUD */

function cr_get_issue(PDO $db, $rowIndex)
{
    $stmt = $db->prepare('SELECT ' . CR_ISSUE_SELECT . ' FROM repair_jobs WHERE row_index = ?');
    $stmt->execute(array((int) $rowIndex));
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    $issues = cr_attach_history($db, array(cr_issue_from_row($row)));
    return $issues[0];
}

/** 'GW-001' จาก row_index */
function cr_issue_id($rowIndex)
{
    return 'GW-' . str_pad((string) (int) $rowIndex, 3, '0', STR_PAD_LEFT);
}

/**
 * วันครบกำหนดตามความเร่งด่วน (SLA)
 * ค่าเริ่มต้น: สูง 3 วัน, ปานกลาง 7 วัน, ต่ำ 30 วัน (ตั้งได้ที่ api/config.php)
 */
function cr_due_days_for_risk($riskLevel)
{
    $map = cr_config('due_days_by_risk', array());
    if (is_array($map)) {
        $risk = trim(cr_str($riskLevel));
        if ($risk !== '' && isset($map[$risk])) {
            return max(1, (int) $map[$risk]);
        }
    }
    return max(1, (int) cr_config('due_days', 30));
}

/** วันครบกำหนดของงานใหม่ (Y-m-d) */
function cr_due_date_for_risk($riskLevel)
{
    return date('Y-m-d', strtotime('+' . cr_due_days_for_risk($riskLevel) . ' days'));
}

function cr_create_issue(PDO $db, $input)
{
    if (!is_array($input)) {
        $input = array();
    }

    $groupId = trim(cr_str($input['groupId'] ?? null));
    $zone = trim(cr_str($input['zone'] ?? null));
    if ($groupId === '' || $zone === '') {
        throw new ApiError('กรุณากำหนดกลุ่มและโซน');
    }

    $riskLevel = cr_str($input['riskLevel'] ?? null);
    $reporterName = trim(cr_str($input['reporterName'] ?? null));
    $room = trim(cr_str($input['room'] ?? null));

    $beforePhoto = cr_save_photo(
        $input['beforePhotoDataUrl'] ?? '',
        cr_str($input['beforePhotoName'] ?? null, 'before')
    );

    $createdDate = date('Y-m-d');
    $dueDate = cr_due_date_for_risk($riskLevel);

    $db->beginTransaction();
    try {
        $stmt = $db->prepare(
            'INSERT INTO repair_jobs
                (id, created_date, due_date, group_id, zone, room, category, risk_level,
                 location_detail, suggestion, reporter_name, reporter_contact,
                 before_photo_url, status, after_photo_url, staff_note)
             VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'\', \'\')'
        );
        // จำกัดความยาวฟิลด์กัน payload ใหญ่ผิดปกติ (นอกเหนือจาก post_max_size)
        $stmt->execute(array(
            $createdDate,
            $dueDate,
            mb_substr($groupId, 0, 32),
            mb_substr($zone, 0, 191),
            mb_substr($room, 0, 64),
            mb_substr(cr_str($input['category'] ?? null), 0, 191),
            mb_substr($riskLevel, 0, 32),
            mb_substr(cr_str($input['locationDetail'] ?? null), 0, 2000),
            mb_substr(cr_str($input['suggestion'] ?? null), 0, 2000),
            mb_substr($reporterName, 0, 191),
            mb_substr(trim(cr_str($input['reporterContact'] ?? null)), 0, 64),
            $beforePhoto,
            CR_STATUS_PENDING,
        ));

        $rowIndex = (int) $db->lastInsertId();
        $update = $db->prepare('UPDATE repair_jobs SET id = ? WHERE row_index = ?');
        $update->execute(array(cr_issue_id($rowIndex), $rowIndex));

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    cr_record_history(
        $db,
        $rowIndex,
        cr_issue_id($rowIndex),
        '',
        CR_STATUS_PENDING,
        $reporterName !== '' ? $reporterName : 'ผู้แจ้ง',
        'แจ้งซ่อมใหม่'
    );

    $issue = cr_get_issue($db, $rowIndex);
    if (!$issue) {
        throw new ApiError('ไม่พบรายการที่เพิ่งบันทึก');
    }
    return $issue;
}

/**
 * ปิดหรือเปิดงานซ่อม — ต้องยืนยัน PIN ก่อนทุกครั้ง
 * (การเปิดงานใหม่เก็บหมายเหตุ/รูปเดิมไว้ให้ดูย้อนหลัง)
 */
function cr_update_status($body)
{
    if (!is_array($body)) {
        $body = array();
    }

    // ตรวจ PIN (พร้อมนับครั้งที่ผิด) และตรวจข้อมูลเข้าก่อนเชื่อมต่อฐานข้อมูล
    cr_assert_pin($body['pin'] ?? null);

    $rowIndex = (int) cr_str($body['rowIndex'] ?? null, '0');
    if ($rowIndex < 1) {
        throw new ApiError('ไม่พบแถวข้อมูลที่ต้องการอัปเดต (rowIndex)');
    }

    $editMode = ($body['edit'] ?? false) === true || cr_str($body['edit'] ?? null) === '1';
    $requestedStatus = cr_str($body['status'] ?? null) === CR_STATUS_CLOSED ? CR_STATUS_CLOSED : CR_STATUS_PENDING;
    // โหมดแก้ไขไม่เปลี่ยนสถานะ — จึงไม่มีวัน "ปิดงาน" ในการแก้ไข
    $closing = !$editMode && $requestedStatus === CR_STATUS_CLOSED;

    // ปิดงานต้องมีหมายเหตุการซ่อม (ตรงกับที่หน้าเว็บบังคับ)
    if ($closing && trim(cr_str($body['staffNote'] ?? null)) === '') {
        throw new ApiError('กรุณากรอกหมายเหตุการซ่อมก่อนปิดงาน');
    }

    $staffName = mb_substr(trim(cr_str($body['staffName'] ?? null)), 0, 191);
    if ($staffName === '') {
        $staffName = 'เจ้าหน้าที่';
    }

    $db = cr_db();
    $before = cr_get_issue($db, $rowIndex);
    if ($before === null) {
        throw new ApiError('ไม่พบแถวข้อมูลที่ต้องการอัปเดต (rowIndex)');
    }

    $status = $editMode ? $before['status'] : $requestedStatus;

    // บันทึกรูปหลังซ่อมเฉพาะเมื่อปิดงานหรือแก้ไข (ถ้าไม่แนบรูปมา cr_save_photo คืน '')
    $afterPhoto = ($closing || $editMode)
        ? cr_save_photo($body['afterPhotoDataUrl'] ?? '', cr_str($body['afterPhotoName'] ?? null, 'after'))
        : '';

    $sets = array();
    $params = array();
    if (!$editMode) {
        $sets[] = 'status = ?';
        $params[] = $status;
        $sets[] = 'closed_date = ?';
        $params[] = $closing ? date('Y-m-d') : null;
    }

    if (array_key_exists('staffNote', $body) && (is_string($body['staffNote']) || is_numeric($body['staffNote']))) {
        $sets[] = 'staff_note = ?';
        $params[] = cr_str($body['staffNote']);
    }
    if ($afterPhoto !== '') {
        $sets[] = 'after_photo_url = ?';
        $params[] = $afterPhoto;
    }

    if (!empty($sets)) {
        $params[] = $rowIndex;
        $stmt = $db->prepare('UPDATE repair_jobs SET ' . implode(', ', $sets) . ' WHERE row_index = ?');
        $stmt->execute($params);
    }

    // ประวัติ: โหมดแก้ไขบันทึกเฉพาะเมื่อมีการเปลี่ยนแปลง; null = ไม่บันทึก
    $historyNote = null;
    if ($editMode) {
        if (array_key_exists('staffNote', $body) || $afterPhoto !== '') {
            $historyNote = trim(cr_str($body['staffNote'] ?? null)) !== ''
                ? cr_str($body['staffNote'])
                : 'แก้ไขผลการซ่อม';
        }
    } elseif ($closing) {
        $historyNote = cr_str($body['staffNote'] ?? null);
    } else {
        $historyNote = 'เปิดงานซ่อมอีกครั้ง';
    }

    if ($historyNote !== null) {
        cr_record_history($db, $rowIndex, $before['id'], $before['status'], $status, $staffName, $historyNote);
    }

    $issue = cr_get_issue($db, $rowIndex);
    if (!$issue) {
        throw new ApiError('ไม่พบรายการที่ต้องการอัปเดต');
    }
    return $issue;
}

/* --------------------------------------------------------- ส่งออก CSV */

function cr_export_issues(PDO $db, $body = array(), $includePrivate = false)
{
    $filters = cr_read_filters(is_array($body) ? $body : array());
    $filters['page'] = 1;
    $filters['pageSize'] = 100;
    list($where, $params) = cr_filter_sql($filters, $includePrivate);

    $rows = array();
    $page = 1;
    do {
        $stmt = $db->prepare(
            'SELECT ' . CR_ISSUE_SELECT . ' FROM repair_jobs' . $where .
            ' ORDER BY row_index ASC LIMIT 100 OFFSET ' . (($page - 1) * 100)
        );
        $stmt->execute($params);
        $batch = $stmt->fetchAll();
        foreach ($batch as $row) {
            $rows[] = cr_issue_from_row($row);
        }
        $page++;
    } while (count($batch) === 100);

    if (!$includePrivate) {
        $rows = array_map('cr_redact_issue', $rows);
    }

    $memory = fopen('php://memory', 'w+b');
    // BOM ให้ Excel อ่าน UTF-8 ถูกต้อง
    fwrite($memory, "\xEF\xBB\xBF");
    fputcsv($memory, array(
        'เลขงาน', 'วันที่แจ้ง', 'ครบกำหนด', 'สถานะ', 'อาคาร', 'ห้อง', 'ประเภทงาน', 'ความเร่งด่วน',
        'จุดที่พบ', 'ข้อเสนอแนะ', 'ผู้แจ้ง', 'ติดต่อ', 'วันที่ปิดงาน', 'หมายเหตุการซ่อม', 'เลยกำหนด (วัน)',
    ), ',', '"', "\\");

    foreach ($rows as $issue) {
        fputcsv($memory, array(
            $issue['id'],
            $issue['createdDate'],
            $issue['dueDate'],
            $issue['status'],
            $issue['zone'],
            $issue['room'],
            $issue['category'],
            $issue['riskLevel'],
            $issue['locationDetail'],
            $issue['suggestion'],
            $issue['reporterName'],
            $issue['reporterContact'],
            $issue['closedDate'],
            $issue['staffNote'],
            $issue['overdueDays'] > 0 ? (string) $issue['overdueDays'] : '',
        ), ',', '"', "\\");
    }

    rewind($memory);
    $csv = stream_get_contents($memory);
    fclose($memory);

    return array(
        'csv' => $csv === false ? '' : $csv,
        'filename' => 'campus-repair-' . date('Ymd-His') . '.csv',
        'rows' => count($rows),
    );
}

/* -------------------------------------------------------------------- PIN */

function cr_assert_pin($pin)
{
    // ใช้ cr_check_pin เพื่อนับจำนวนครั้งที่ผิดด้วย (ดู api/lib/ratelimit.php)
    if (!cr_check_pin($pin)) {
        throw new ApiError('รหัส PIN ไม่ถูกต้อง');
    }
}

function cr_verify_pin($pin)
{
    $expected = (string) cr_config('staff_pin');
    if ($expected === '') {
        throw new ApiError('ยังไม่ได้ตั้งค่า STAFF_PIN');
    }
    if (!is_string($pin) && !is_int($pin)) {
        return false;
    }
    // hash_equals กันการเดารหัสจากเวลาตอบสนอง
    return hash_equals($expected, (string) $pin);
}

/**
 * true เมื่อคำขอแนบ PIN เจ้าหน้าที่ที่ถูกต้อง
 * ใช้ตัดสินว่าจะส่งข้อมูลส่วนบุคคล (ผู้แจ้ง/ผู้ประเมิน) กลับไปหรือไม่
 *
 * - ไม่แนบ PIN = คำขอสาธารณะ → ไม่นับความผิดและไม่แตะตัวล็อก
 * - แนบ PIN ผิด = นับครั้งที่ผิดและล็อกเหมือน verifyPin (cr_check_pin)
 */
function cr_optional_staff($body)
{
    $pin = is_array($body) ? ($body['pin'] ?? null) : null;
    if ($pin === null || $pin === '') {
        return false;
    }
    return cr_check_pin($pin);
}
