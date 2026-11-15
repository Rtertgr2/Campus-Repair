<?php
/**
 * Campus Repair — PHP backend (XAMPP / Apache + MySQL)
 *
 * รับคำขอแบบ POST JSON ที่มี `action` ตามสัญญาใน src/lib/api.ts
 * (frontend เรียกผ่าน VITE_API_URL):
 *
 *   listIssues / stats / createIssue / updateStatus / verifyPin
 *   exportIssues / listAssessments / submitAssessment
 *   health / cleanupPhotos
 *
 * ทุก response เป็น HTTP 200 พร้อม { ok: true|false, ... }
 * (frontend อ่านข้อความ error จาก `error` ไม่ใช่ HTTP status)
 *
 * ตั้งค่าการเชื่อมต่อที่ api/config.php (คัดลอกจาก api/config.example.php)
 */

declare(strict_types=0);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/photos.php';
require __DIR__ . '/lib/ratelimit.php';
require __DIR__ . '/lib/maintenance.php';
require __DIR__ . '/lib/issues.php';
require __DIR__ . '/lib/assessments.php';

cr_bootstrap_runtime();
cr_cors();

$method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    if ($method === 'GET') {
        // ใช้ตรวจว่าติดตั้งสำเร็จ (เปิดในเบราว์เซอร์แล้วต้องได้ ok:true)
        cr_json(array(
            'ok' => true,
            'service' => 'campus-repair',
            'backend' => 'php-mysql',
            'version' => 2,
            'features' => array('sla', 'filters', 'history', 'reporter', 'export', 'assessments', 'cleanup'),
        ));
    }

    if ($method !== 'POST') {
        throw new ApiError('รองรับเฉพาะคำขอแบบ POST');
    }

    $body = cr_read_json_body();
    $action = cr_str($body['action'] ?? null);

    switch ($action) {
        case 'listIssues':
            // รองรับ filters{...} — ข้อมูลผู้แจ้งจะถูกส่งกลับเฉพาะเมื่อแนบ PIN เจ้าหน้าที่ถูกต้อง
            $db = cr_db();
            $page = cr_list_issues($db, $body, cr_optional_staff($body));
            $page['stats'] = cr_issue_stats($db);
            cr_json(array_merge(array('ok' => true), $page));
            break;

        case 'stats':
            cr_json(array('ok' => true, 'stats' => cr_issue_stats(cr_db())));
            break;

        case 'createIssue':
            cr_rate_limit('create_issue', (int) cr_config('rate_limit.create_issue_per_minute', 10));
            cr_reject_honeypot($body);
            $input = isset($body['issue']) && is_array($body['issue']) ? $body['issue'] : array();
            cr_json(array('ok' => true, 'issue' => cr_create_issue(cr_db(), $input)));
            break;

        case 'updateStatus':
            // cr_update_status ตรวจ PIN ก่อน แล้วจึงเชื่อมต่อฐานข้อมูล
            cr_json(array('ok' => true, 'issue' => cr_update_status($body)));
            break;

        case 'verifyPin':
            // cr_check_pin นับจำนวนครั้งที่ผิดด้วย (ล็อกเมื่อผิดติดกันหลายครั้ง)
            if (cr_check_pin($body['pin'] ?? null)) {
                cr_json(array('ok' => true));
            }
            cr_json(array('ok' => false, 'error' => 'รหัส PIN ไม่ถูกต้อง'));
            break;

        case 'exportIssues':
            // คืน CSV เป็นข้อความ แล้วให้เบราว์เซอร์สร้างไฟล์ดาวน์โหลด
            // คอลัมน์ผู้แจ้ง/ติดต่อจะว่างเว้นแต่แนบ PIN เจ้าหน้าที่ถูกต้อง
            cr_json(array_merge(array('ok' => true), cr_export_issues(cr_db(), $body, cr_optional_staff($body))));
            break;

        case 'listAssessments':
            // รายชื่อผู้ประเมินจะถูกส่งกลับเฉพาะเมื่อแนบ PIN เจ้าหน้าที่ถูกต้อง
            $limit = isset($body['limit']) ? (int) $body['limit'] : 100;
            $db = cr_db();
            cr_json(array(
                'ok' => true,
                'assessments' => cr_list_assessments($db, $limit, cr_optional_staff($body)),
                'summary' => cr_assessment_summary($db),
            ));
            break;

        case 'submitAssessment':
            cr_rate_limit('submit_assessment', (int) cr_config('rate_limit.submit_assessment_per_minute', 10));
            cr_reject_honeypot($body);
            $input = isset($body['assessment']) && is_array($body['assessment']) ? $body['assessment'] : array();
            cr_json(array('ok' => true, 'assessment' => cr_submit_assessment(cr_db(), $input)));
            break;

        case 'health':
            // ต้องยืนยัน PIN เพราะเปิดเผยข้อมูลการตั้งค่าภายใน
            cr_assert_pin($body['pin'] ?? null);
            cr_json(array(
                'ok' => true,
                'warnings' => cr_health_warnings(),
                'installLocked' => cr_install_locked(),
                'gdAvailable' => cr_gd_available(),
                'uploadsWritable' => is_dir(CR_APP_DIR . '/uploads') && is_writable(CR_APP_DIR . '/uploads'),
                'photoMaxEdge' => (int) cr_config('photo_max_edge', 1600),
            ));
            break;

        case 'cleanupPhotos':
            // ลบรูปที่ไม่มีในฐานข้อมูลแล้ว (ต้องยืนยัน PIN)
            cr_assert_pin($body['pin'] ?? null);
            $dryRun = cr_str($body['dryRun'] ?? null) === '1' || ($body['dryRun'] ?? null) === true;
            $maxAge = isset($body['maxAgeHours']) ? (int) $body['maxAgeHours'] : 24;
            cr_json(array('ok' => true, 'result' => cr_cleanup_photos(cr_db(), $maxAge, $dryRun)));
            break;

        default:
            throw new ApiError('ไม่รู้จักคำสั่ง: ' . $action);
    }
} catch (ApiError $e) {
    cr_json(array('ok' => false, 'error' => $e->getMessage()));
} catch (Throwable $e) {
    error_log('[campus-repair] ' . $e->getMessage());
    cr_json(array(
        'ok' => false,
        'error' => (bool) cr_config('debug')
            ? $e->getMessage()
            : 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ (ดู log ของ Apache/PHP)',
    ));
}
