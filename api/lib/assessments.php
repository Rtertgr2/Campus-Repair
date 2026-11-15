<?php
/**
 * ผลการประเมิน — listAssessments / submitAssessment
 * เพิ่มสรุปภาพรวม (คะแนนเฉลี่ย/จำนวน) ให้หน้าเว็บแสดงผลได้ทันที
 */

define('CR_ASSESSMENT_SELECT', "
    row_index AS rowIndex,
    id,
    DATE_FORMAT(created_at, '%d/%m/%Y %H:%i:%s') AS timestamp,
    student_id AS studentId,
    student_name AS studentName,
    level,
    group_id AS groupId,
    knowledge_correct AS knowledgeCorrect,
    knowledge_total AS knowledgeTotal,
    knowledge_percent AS knowledgePercent,
    awareness_points AS awarenessPoints,
    awareness_max AS awarenessMax,
    awareness_percent AS awarenessPercent
");

function cr_assessment_from_row($row)
{
    return array(
        'rowIndex' => (int) $row['rowIndex'],
        'id' => cr_str($row['id']),
        'timestamp' => cr_str($row['timestamp']),
        'studentId' => cr_str($row['studentId']),
        'studentName' => cr_str($row['studentName']),
        'level' => cr_str($row['level']),
        'groupId' => cr_str($row['groupId']),
        'knowledgeCorrect' => (float) $row['knowledgeCorrect'],
        'knowledgeTotal' => (float) $row['knowledgeTotal'],
        'knowledgePercent' => (int) $row['knowledgePercent'],
        'awarenessPoints' => (float) $row['awarenessPoints'],
        'awarenessMax' => (float) $row['awarenessMax'],
        'awarenessPercent' => (int) $row['awarenessPercent'],
    );
}

/**
 * รายการล่าสุดก่อน (จำกัดจำนวนได้)
 * ส่งข้อมูลผู้ประเมินกลับเฉพาะเมื่อเป็นเจ้าหน้าที่ (แนบ PIN ถูกต้อง)
 */
function cr_list_assessments(PDO $db, $limit = 100, $includePrivate = false)
{
    if (!$includePrivate) {
        return array();
    }
    $limit = max(1, min(500, (int) $limit));
    $rows = $db->query(
        'SELECT ' . CR_ASSESSMENT_SELECT . ' FROM assessments ORDER BY row_index DESC LIMIT ' . $limit
    )->fetchAll();
    return array_map('cr_assessment_from_row', $rows);
}

/** สรุปภาพรวมผลประเมิน */
function cr_assessment_summary(PDO $db)
{
    $row = $db->query(
        "SELECT COUNT(*) AS total,
                COALESCE(ROUND(AVG(knowledge_percent), 1), 0) AS avgKnowledge,
                COALESCE(ROUND(AVG(awareness_percent), 1), 0) AS avgAwareness,
                COALESCE(ROUND(MAX(knowledge_percent), 0), 0) AS bestKnowledge
         FROM assessments"
    )->fetch();

    $total = (int) ($row['total'] ?? 0);

    return array(
        'total' => $total,
        'avgKnowledge' => (float) ($row['avgKnowledge'] ?? 0),
        'avgAwareness' => (float) ($row['avgAwareness'] ?? 0),
        'bestKnowledge' => (int) ($row['bestKnowledge'] ?? 0),
    );
}

/** ตัวเลขที่รับได้ต้อง >= 0 ไม่งั้นใช้ค่าเริ่มต้น */
function cr_positive_number($value, $fallback)
{
    if (!is_numeric($value)) {
        return (float) $fallback;
    }
    $number = (float) $value;
    if (!is_finite($number) || $number < 0) {
        return (float) $fallback;
    }
    return $number;
}

function cr_clamp($value, $min, $max)
{
    return min(max($value, $min), $max);
}

function cr_percent($score, $max)
{
    if ($max <= 0) {
        return 0;
    }
    return (int) round(($score / $max) * 100);
}

function cr_submit_assessment(PDO $db, $input)
{
    if (!is_array($input)) {
        $input = array();
    }

    $studentId = trim(cr_str($input['studentId'] ?? null));
    $studentName = trim(cr_str($input['studentName'] ?? null));
    $groupId = mb_substr(trim(cr_str($input['groupId'] ?? null)), 0, 32);
    if ($studentId === '' || $studentName === '' || $groupId === '') {
        throw new ApiError('กรุณากรอกข้อมูลให้ครบถ้วน');
    }

    $knowledgeTotal = max(1, cr_positive_number($input['knowledgeTotal'] ?? null, 10));
    $knowledgeCorrect = cr_clamp(cr_positive_number($input['knowledgeCorrect'] ?? null, 0), 0, $knowledgeTotal);
    $awarenessMax = max(1, cr_positive_number($input['awarenessMax'] ?? null, 12));
    $awarenessPoints = round(cr_clamp(cr_positive_number($input['awarenessPoints'] ?? null, 0), 0, $awarenessMax), 1);

    $db->beginTransaction();
    try {
        $stmt = $db->prepare(
            'INSERT INTO assessments
                (id, created_at, student_id, student_name, level, group_id, knowledge_correct,
                 knowledge_total, knowledge_percent, awareness_points, awareness_max, awareness_percent)
             VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute(array(
            // ส่งเวลาจาก PHP (APP_TIMEZONE) ไม่ใช้ CURRENT_TIMESTAMP ของ MySQL
            // เพื่อไม่ให้ timestamp คลาดเมื่อ MySQL ตั้งเขตเวลาไว้ต่างกัน
            date('Y-m-d H:i:s'),
            mb_substr($studentId, 0, 64),
            mb_substr($studentName, 0, 191),
            mb_substr(cr_str($input['level'] ?? null), 0, 64),
            $groupId,
            $knowledgeCorrect,
            $knowledgeTotal,
            cr_percent($knowledgeCorrect, $knowledgeTotal),
            $awarenessPoints,
            $awarenessMax,
            cr_percent($awarenessPoints, $awarenessMax),
        ));

        $rowIndex = (int) $db->lastInsertId();
        $id = 'A-' . str_pad((string) $rowIndex, 3, '0', STR_PAD_LEFT);
        $update = $db->prepare('UPDATE assessments SET id = ? WHERE row_index = ?');
        $update->execute(array($id, $rowIndex));

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    $stmt = $db->prepare('SELECT ' . CR_ASSESSMENT_SELECT . ' FROM assessments WHERE row_index = ?');
    $stmt->execute(array($rowIndex));
    $row = $stmt->fetch();
    if (!$row) {
        throw new ApiError('ไม่พบผลการประเมินที่เพิ่งบันทึก');
    }
    return cr_assessment_from_row($row);
}
