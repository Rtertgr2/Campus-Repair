<?php
/**
 * จำกัดจำนวนครั้งที่กรอก PIN ผิด — กันการเดา PIN 4 หลัก (มีเพียง 10,000 แบบ)
 *
 * สถานะ: ปิดไว้โดยค่าเริ่มต้น (เก็บโค้ดไว้ใช้ภายหลัง)
 * เปิดใช้ได้ที่ api/config.php:
 *
 *   'pin_lock' => [
 *       'enabled'        => true,   // true = เปิดการล็อก
 *       'max_attempts'   => 5,      // ผิดได้กี่ครั้งในหนึ่งช่วงเวลา
 *       'window_minutes' => 15,     // ช่วงเวลาที่นับความผิด
 *       'lock_minutes'   => 15,     // ล็อกนานเท่าไรเมื่อผิดครบ
 *   ],
 *
 * เมื่อเปิดใช้: นับต่อ IP โดยใช้ REMOTE_ADDR เท่านั้น (header พวก
 * X-Forwarded-For ปลอมได้) และเก็บสถานะเป็นไฟล์ใน api/storage/pin/
 * ถ้าโฟลเดอร์เขียนไม่ได้ ระบบจะข้ามการจำกัดแทนที่จะทำให้เว็บล่ม
 */

function cr_pin_lock_enabled()
{
    return (bool) cr_config('pin_lock.enabled', false);
}

function cr_pin_max_attempts()
{
    return max(1, (int) cr_config('pin_lock.max_attempts', 5));
}

function cr_pin_window_seconds()
{
    return max(60, 60 * (int) cr_config('pin_lock.window_minutes', 15));
}

function cr_pin_lock_seconds()
{
    return max(60, 60 * (int) cr_config('pin_lock.lock_minutes', 15));
}

/** โฟลเดอร์เก็บสถานะ (คืน '' ถ้าใช้ไม่ได้) */
function cr_pin_storage_dir()
{
    $dir = CR_APP_DIR . '/storage/pin';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return '';
    }
    if (!is_writable($dir)) {
        return '';
    }
    return $dir;
}

/** IP ของผู้เรียก */
function cr_client_ip()
{
    return isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : 'unknown';
}

function cr_pin_state_file()
{
    $dir = cr_pin_storage_dir();
    if ($dir === '') {
        return '';
    }
    return $dir . '/' . hash('sha256', cr_client_ip()) . '.json';
}

function cr_pin_empty_state()
{
    return array('count' => 0, 'first' => 0, 'locked_until' => 0);
}

function cr_pin_read_state()
{
    $file = cr_pin_state_file();
    if ($file === '' || !is_file($file)) {
        return cr_pin_empty_state();
    }

    $data = json_decode((string) @file_get_contents($file), true);
    if (!is_array($data)) {
        return cr_pin_empty_state();
    }

    return array(
        'count' => isset($data['count']) ? (int) $data['count'] : 0,
        'first' => isset($data['first']) ? (int) $data['first'] : 0,
        'locked_until' => isset($data['locked_until']) ? (int) $data['locked_until'] : 0,
    );
}

function cr_pin_write_state($state)
{
    $file = cr_pin_state_file();
    if ($file === '') {
        return;
    }
    @file_put_contents($file, json_encode($state), LOCK_EX);
}

/** โยน error ถ้าอยู่ในเวลาล็อก (ตรวจก่อนเทียบ PIN ทุกครั้ง) */
function cr_pin_guard()
{
    if (!cr_pin_lock_enabled()) {
        return;
    }

    $state = cr_pin_read_state();
    $now = time();

    if ($state['locked_until'] > $now) {
        $minutes = (int) ceil(($state['locked_until'] - $now) / 60);
        throw new ApiError(
            'กรอก PIN ผิดหลายครั้งเกินไป กรุณารออีก ' . $minutes . ' นาทีแล้วลองใหม่'
        );
    }

    // พ้นช่วงนับแล้ว และไม่ได้ถูกล็อก → เริ่มนับใหม่
    if (($state['first'] > 0 && ($now - $state['first']) > cr_pin_window_seconds()) || $state['locked_until'] > 0) {
        cr_pin_write_state(cr_pin_empty_state());
    }
}

/** บันทึกความผิด 1 ครั้ง (ครบกำหนดแล้วล็อกทันที) */
function cr_pin_record_failure()
{
    if (!cr_pin_lock_enabled()) {
        return;
    }

    $now = time();
    $state = cr_pin_read_state();

    if ($state['first'] === 0 || ($now - $state['first']) > cr_pin_window_seconds()) {
        $state = array('count' => 0, 'first' => $now, 'locked_until' => 0);
    }

    $state['count'] = (int) $state['count'] + 1;
    if ($state['count'] >= cr_pin_max_attempts()) {
        $state = array(
            'count' => 0,
            'first' => $now,
            'locked_until' => $now + cr_pin_lock_seconds(),
        );
    }

    cr_pin_write_state($state);
}

/** ล้างสถานะเมื่อกรอกถูก */
function cr_pin_reset()
{
    if (!cr_pin_lock_enabled()) {
        return;
    }
    cr_pin_write_state(cr_pin_empty_state());
}

/**
 * ตรวจ PIN พร้อมจำกัดจำนวนครั้ง (ถ้าเปิดใช้)
 * คืน true เมื่อถูกต้อง / false เมื่อผิด, โยน ApiError เมื่อถูกล็อกอยู่
 */
function cr_check_pin($pin)
{
    if (!cr_pin_lock_enabled()) {
        return cr_verify_pin($pin);
    }

    cr_pin_guard();

    if (cr_verify_pin($pin)) {
        cr_pin_reset();
        return true;
    }

    cr_pin_record_failure();
    return false;
}

/* ---------------------------------------------------------------- rate limit */

/** โฟลเดอร์เก็บสถานะ rate limit (คืน '' ถ้าใช้ไม่ได้) */
function cr_rate_limit_dir()
{
    $dir = CR_APP_DIR . '/storage/ratelimit';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return '';
    }
    return is_writable($dir) ? $dir : '';
}

/**
 * จำกัดจำนวนคำขอต่อ IP ต่อประเภท ภายในหน้าต่าง 60 วินาที
 * ใช้กับ endpoint ที่ไม่ต้องล็อกอิน (createIssue / submitAssessment)
 * โยน ApiError เมื่อเกินเพดาน; ถ้าเขียนไฟล์ไม่ได้จะข้ามเพื่อไม่ให้เว็บล่ม
 */
function cr_rate_limit($key, $max = 10)
{
    if (!(bool) cr_config('rate_limit.enabled', true)) {
        return;
    }

    $dir = cr_rate_limit_dir();
    if ($dir === '') {
        return;
    }

    $max = max(1, (int) $max);
    $window = 60;
    $now = time();
    $file = $dir . '/' . hash('sha256', cr_client_ip() . '|' . $key) . '.json';

    $state = array('count' => 0, 'reset' => $now + $window);
    if (is_file($file)) {
        $data = json_decode((string) @file_get_contents($file), true);
        if (is_array($data)) {
            $state = array(
                'count' => isset($data['count']) ? (int) $data['count'] : 0,
                'reset' => isset($data['reset']) ? (int) $data['reset'] : 0,
            );
        }
    }

    // พ้นหน้าต่างแล้ว → เริ่มนับใหม่
    if ($state['reset'] <= $now) {
        $state = array('count' => 0, 'reset' => $now + $window);
    }

    if ($state['count'] >= $max) {
        throw new ApiError('คำขอถี่เกินไป กรุณาลองใหม่ภายหลัง');
    }

    $state['count'] = (int) $state['count'] + 1;
    @file_put_contents($file, json_encode($state), LOCK_EX);
}
