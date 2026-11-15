<?php
/**
 * งานบำรุงรักษาระบบ
 *   - ตรวจสุขภาพการติดตั้ง (cr_health_warnings) สำหรับแสดงเตือนในโหมดเจ้าหน้าที่
 *   - ล็อกตัวติดตั้งหลังติดตั้งเสร็จ (install.lock)
 *   - ลบรูปที่ไม่มีอยู่ในฐานข้อมูลแล้ว (cr_cleanup_photos)
 */

/** ไฟล์ล็อกของตัวติดตั้ง */
function cr_install_lock_file()
{
    return CR_APP_DIR . '/storage/install.lock';
}

function cr_install_locked()
{
    return is_file(cr_install_lock_file());
}

/** เขียนไฟล์ล็อก — ใช้ได้แม้โฟลเดอร์ storage ถูกจำกัดสิทธิ์ (ล้มเหลวเงียบ ๆ) */
function cr_write_install_lock()
{
    $dir = CR_APP_DIR . '/storage';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return false;
    }
    $payload = date('Y-m-d H:i:s') . PHP_EOL;
    return @file_put_contents(cr_install_lock_file(), $payload, LOCK_EX) !== false;
}

/**
 * รายการคำเตือนความปลอดภัย/การตั้งค่า (ข้อความภาษาไทย)
 * ใช้แสดงใน Header เฉพาะเมื่ออยู่ในโหมดเจ้าหน้าที่
 */
function cr_health_warnings()
{
    $warnings = array();

    if (trim((string) cr_config('staff_pin')) === '7391') {
        $warnings[] = array(
            'code' => 'default_pin',
            'message' => 'ยังใช้ PIN ค่าเริ่มต้น 7391 — เปลี่ยน staff_pin ใน api/config.php ก่อนใช้งานจริง',
        );
    }

    if (is_file(CR_APP_DIR . '/install.php') && !cr_install_locked()) {
        $warnings[] = array(
            'code' => 'installer_open',
            'message' => 'api/install.php ยังใช้งานได้ — ติดตั้งเสร็จแล้วลบไฟล์นี้หรือรันซ้ำเพื่อล็อกตัวติดตั้ง',
        );
    }

    if ((bool) cr_config('debug')) {
        $warnings[] = array(
            'code' => 'debug_on',
            'message' => 'debug เปิดอยู่ (ข้อความ error ภายในจะถูกส่งออกไป) — ตั้งเป็น false เมื่อใช้งานจริง',
        );
    }

    if (!is_dir(CR_APP_DIR . '/uploads') || !is_writable(CR_APP_DIR . '/uploads')) {
        $warnings[] = array(
            'code' => 'uploads_unwritable',
            'message' => 'โฟลเดอร์ api/uploads เขียนไม่ได้ — รูปจะอัปโหลดไม่สำเร็จ',
        );
    }

    if (!function_exists('imagecreatefromstring')) {
        $warnings[] = array(
            'code' => 'gd_missing',
            'message' => 'PHP ยังไม่เปิดส่วนขยาย gd — รูปจะถูกเก็บตามขนาดที่เบราว์เซอร์ส่งมา (ไม่แปลง WebP)',
        );
    }

    return $warnings;
}

/** ไฟล์รูปทั้งหมดใน uploads (ชื่อไฟล์) */
function cr_upload_file_list()
{
    $dir = CR_APP_DIR . '/uploads';
    if (!is_dir($dir)) {
        return array();
    }

    $files = array();
    $entries = @scandir($dir);
    if ($entries === false) {
        return array();
    }
    foreach ($entries as $name) {
        if ($name === '.' || $name === '..' || $name[0] === '.') {
            continue;
        }
        $path = $dir . '/' . $name;
        if (is_file($path) && preg_match('/\.(jpe?g|png|webp|gif)$/i', $name) === 1) {
            $files[] = $name;
        }
    }
    return $files;
}

/** path ของรูปที่ฐานข้อมูลยังอ้างถึง (uploads/xxx.jpg) */
function cr_referenced_photos(PDO $db)
{
    $referenced = array();
    // หลีกเลี่ยง alias ว่า before/after เพราะเป็นคำสงวนใน MariaDB
    $rows = $db->query(
        'SELECT before_photo_url AS before_url, after_photo_url AS after_url FROM repair_jobs'
    )->fetchAll();

    foreach ($rows as $row) {
        foreach (array('before_url', 'after_url') as $key) {
            $path = cr_str($row[$key]);
            if ($path === '') {
                continue;
            }
            $referenced[basename($path)] = true;
        }
    }
    return $referenced;
}

/**
 * ลบรูปที่ไม่ถูกอ้างถึงในฐานข้อมูลและเก่ากว่ากำหนด
 * $dryRun = true → แค่รายงานว่าจะลบอะไร
 */
function cr_cleanup_photos(PDO $db, $maxAgeHours = 24, $dryRun = false)
{
    $maxAgeHours = max(1, (int) $maxAgeHours);
    $referenced = cr_referenced_photos($db);
    $deleted = array();
    $kept = 0;

    foreach (cr_upload_file_list() as $name) {
        if (isset($referenced[$name])) {
            $kept++;
            continue;
        }

        $path = CR_APP_DIR . '/uploads/' . $name;
        $modified = @filemtime($path);
        if ($modified === false || (time() - $modified) < $maxAgeHours * 3600) {
            // ไฟล์ใหม่ อาจเป็นรูปที่เพิ่งอัปโหลดแต่ยังไม่ถูกบันทึก — ข้ามไว้ก่อน
            $kept++;
            continue;
        }

        $deleted[] = $name;
        if (!$dryRun) {
            @unlink($path);
        }
    }

    return array(
        'scanned' => count(cr_upload_file_list()),
        'deleted' => $deleted,
        'kept' => $kept,
        'dryRun' => $dryRun,
        'maxAgeHours' => $maxAgeHours,
    );
}
