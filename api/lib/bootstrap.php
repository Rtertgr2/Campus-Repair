<?php
/**
 * Bootstrap ของ backend PHP: config, helper ของ HTTP, การเชื่อมต่อฐานข้อมูล
 *
 * รองรับ PHP 7.4 ขึ้นไป (XAMPP 8.x แนะนำ) จึงหลีกเลี่ยงฟีเจอร์ของ PHP 8
 * เช่น str_starts_with / str_contains / match
 */

if (!defined('CR_APP_DIR')) {
    define('CR_APP_DIR', dirname(__DIR__));
}

/** error ที่ปลอดภัยต่อการส่งกลับให้ผู้ใช้ (ข้อความภาษาไทยที่อ่านรู้เรื่อง) */
class ApiError extends RuntimeException
{
}

/** ค่าเริ่มต้น — ตรงกับค่า default ของ XAMPP (user root ไม่มีรหัสผ่าน) */
function cr_default_config()
{
    return array(
        'db' => array(
            'host' => '127.0.0.1',
            'port' => 3306,
            'name' => 'campus_repair',
            'user' => 'root',
            'password' => '',
        ),
        'staff_pin' => '7391',
        // การล็อกเมื่อกรอก PIN ผิด — เปิดใช้เป็นค่าเริ่มต้น
        'pin_lock' => array(
            'enabled' => true,
            'max_attempts' => 5,
            'window_minutes' => 15,
            'lock_minutes' => 15,
        ),
        // จำกัดคำขอต่อ IP สำหรับ endpoint ที่ไม่ต้องล็อกอิน (ครั้ง/นาที)
        'rate_limit' => array(
            'enabled' => true,
            'create_issue_per_minute' => 10,
            'submit_assessment_per_minute' => 10,
        ),
        'timezone' => 'Asia/Bangkok',
        'due_days' => 30,
        // วันครบกำหนดตามความเร่งด่วน (SLA) — ใช้แทน due_days เมื่อความเร่งด่วนตรงกับคีย์
        'due_days_by_risk' => array(
            'สูง' => 3,
            'ปานกลาง' => 7,
            'ต่ำ' => 30,
        ),
        // การย่อ/แปลงรูปฝั่งเซิร์ฟเวอร์ด้วย gd (ถ้าเปิดส่วนขยายไว้)
        'photo_max_edge' => 1600,
        'photo_quality' => 82,
        // ไม่มี origin ใดได้อนุญาตเป็นค่าเริ่มต้น
        // (frontend กับ API อยู่โฟลเดอร์เดียวกัน จึงไม่ต้องใช้ CORS)
        'cors_origins' => array(),
        // token สำหรับเรียก api/install.php จากเครื่องอื่น ('' = เฉพาะเครื่องเซิร์ฟเวอร์)
        'install_token' => '',
        'debug' => false,
    );
}

/**
 * ฟอร์มจริงไม่กรอกฟิลด์นี้ — ถ้ามีค่าแปลว่าเป็นบอท ให้ปฏิเสธแบบไม่บอกสาเหตุ
 * รับได้ทั้ง top-level, issue.website และ assessment.website
 */
function cr_reject_honeypot($body)
{
    if (!is_array($body)) {
        return;
    }

    $value = cr_str($body['website'] ?? null);
    foreach (array('issue', 'assessment') as $key) {
        if ($value === '' && isset($body[$key]) && is_array($body[$key])) {
            $value = cr_str($body[$key]['website'] ?? null);
        }
    }

    if ($value !== '') {
        throw new ApiError('คำขอไม่ถูกต้อง');
    }
}

/** อ่าน config จาก api/config.php (ถ้ามี) แล้วทับด้วย environment variable */
function cr_load_config()
{
    $config = cr_default_config();

    $file = CR_APP_DIR . '/config.php';
    if (is_file($file)) {
        $loaded = require $file;
        if (is_array($loaded)) {
            $config = array_replace_recursive($config, $loaded);
        }
    }

    // environment variable (ใช้เมื่อตั้งค่า env เองบนเครื่อง)
    $envMap = array(
        'DB_HOST' => array('db', 'host'),
        'DB_PORT' => array('db', 'port'),
        'DB_NAME' => array('db', 'name'),
        'DB_USER' => array('db', 'user'),
        'DB_PASSWORD' => array('db', 'password'),
    );

    foreach ($envMap as $envName => $path) {
        $value = getenv($envName);
        if ($value === false || $value === '') {
            continue;
        }
        $config[$path[0]][$path[1]] = $value;
    }

    $pin = getenv('STAFF_PIN');
    if ($pin !== false && $pin !== '') {
        $config['staff_pin'] = (string) $pin;
    }

    $timezone = getenv('APP_TIMEZONE');
    if ($timezone !== false && $timezone !== '') {
        $config['timezone'] = (string) $timezone;
    }

    $dueDays = getenv('DUE_DAYS');
    if ($dueDays !== false && $dueDays !== '') {
        $config['due_days'] = (int) $dueDays;
    }

    $cors = getenv('CORS_ORIGINS');
    if ($cors !== false && $cors !== '') {
        $origins = array();
        foreach (explode(',', $cors) as $origin) {
            $origin = trim($origin);
            if ($origin !== '') {
                $origins[] = $origin;
            }
        }
        if ($origins) {
            $config['cors_origins'] = $origins;
        }
    }

    $debug = getenv('APP_DEBUG');
    if ($debug !== false && $debug !== '') {
        $config['debug'] = in_array(strtolower((string) $debug), array('1', 'true', 'yes', 'on'), true);
    }

    $config['db']['port'] = (int) $config['db']['port'];
    $config['due_days'] = max(1, (int) $config['due_days']);
    $config['photo_max_edge'] = max(320, (int) $config['photo_max_edge']);
    $config['photo_quality'] = min(95, max(40, (int) $config['photo_quality']));

    if (!is_array($config['due_days_by_risk'])) {
        $config['due_days_by_risk'] = array();
    }
    foreach ($config['due_days_by_risk'] as $risk => $days) {
        $config['due_days_by_risk'][$risk] = max(1, (int) $days);
    }
    $config['staff_pin'] = (string) $config['staff_pin'];

    $timezone = (string) $config['timezone'];
    if (!in_array($timezone, timezone_identifiers_list(), true)) {
        $timezone = 'Asia/Bangkok';
    }
    $config['timezone'] = $timezone;

    return $config;
}

/**
 * อ่านค่า config ด้วย path แบบจุด เช่น cr_config('db.host')
 * ไม่ใส่ path = คืนทั้ง array
 */
function cr_config($path = '', $default = null)
{
    static $config = null;
    if ($config === null) {
        $config = cr_load_config();
    }
    if ($path === '') {
        return $config;
    }

    $value = $config;
    foreach (explode('.', $path) as $key) {
        if (!is_array($value) || !array_key_exists($key, $value)) {
            return $default;
        }
        $value = $value[$key];
    }
    return $value;
}

/** ตั้งค่าเริ่มต้นของ PHP: เขตเวลา + การแสดง error */
function cr_bootstrap_runtime()
{
    date_default_timezone_set((string) cr_config('timezone'));

    $debug = (bool) cr_config('debug');
    ini_set('display_errors', $debug ? '1' : '0');
    ini_set('log_errors', '1');
    error_reporting(E_ALL);
}

/** PDO ที่ใช้ร่วมกันทั้งคำขอ (สร้างครั้งเดียว) */
function cr_db()
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $db = cr_config('db');
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $db['host'],
        (int) $db['port'],
        $db['name']
    );

    try {
        $pdo = new PDO($dsn, (string) $db['user'], (string) $db['password'], array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ));
    } catch (PDOException $e) {
        throw new ApiError(
            'เชื่อมต่อฐานข้อมูลไม่สำเร็จ (' . $db['host'] . ':' . $db['port'] . '/' . $db['name'] .
            ') — ตรวจสอบ api/config.php ว่า MySQL ทำงานอยู่และมีฐานข้อมูลนี้แล้ว' .
            ((bool) cr_config('debug') ? ' :: ' . $e->getMessage() : '')
        );
    }

    return $pdo;
}

/** ส่ง JSON กลับแล้วจบคำขอ (รูปแบบ { ok: true|false, ... }) */
function cr_json($payload, $status = 200)
{
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** อนุญาต CORS สำหรับ frontend dev server (Vite) เท่านั้น */
function cr_cors()
{
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string) $_SERVER['HTTP_ORIGIN']) : '';
    if ($origin === '') {
        return;
    }

    $allowed = (array) cr_config('cors_origins');
    if (!in_array('*', $allowed, true) && !in_array($origin, $allowed, true)) {
        return;
    }

    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 600');
}

/** แปลงค่าจาก php.ini เช่น "8M" / "512K" เป็นจำนวนไบต์ (0 = ไม่จำกัด) */
function cr_ini_bytes($value)
{
    $value = trim((string) $value);
    if ($value === '') {
        return 0;
    }

    $number = (float) $value;
    switch (strtolower(substr($value, -1))) {
        case 'g':
            $number *= 1024;
            // fall through
        case 'm':
            $number *= 1024;
            // fall through
        case 'k':
            $number *= 1024;
            break;
    }

    return (int) $number;
}

/** ขนาด body สูงสุดที่ PHP ยอมรับ (post_max_size) — 0 เมื่อไม่จำกัด */
function cr_max_request_bytes()
{
    return cr_ini_bytes(ini_get('post_max_size'));
}

/** อ่าน JSON body (frontend ส่งมาเป็น text/plain เพื่อเลี่ยง preflight) */
function cr_read_json_body()
{
    $declared = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    $limit = cr_max_request_bytes();

    // php.ini ตัด body ที่ใหญ่เกินทิ้งก่อนถึงโค้ดเรา — บอกสาเหตุให้ตรงจุด
    if ($limit > 0 && $declared > $limit) {
        throw new ApiError(
            'ข้อมูลที่ส่งมามีขนาดใหญ่เกินกำหนดของเซิร์ฟเวอร์ (post_max_size = ' . ini_get('post_max_size') . ')'
        );
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        if ($declared > 0) {
            throw new ApiError(
                'เซิร์ฟเวอร์ไม่ได้รับข้อมูลครบ (อาจใหญ่เกิน post_max_size = ' . ini_get('post_max_size') . ')'
            );
        }
        return array();
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new ApiError('รูปแบบ JSON ของคำขอไม่ถูกต้อง');
    }
    return $data;
}

/** แปลงค่าเป็น string แบบปลอดภัย (null => '') */
function cr_str($value, $default = '')
{
    if ($value === null) {
        return $default;
    }
    if (is_bool($value)) {
        return $value ? '1' : '';
    }
    if (is_scalar($value)) {
        return (string) $value;
    }
    return $default;
}
