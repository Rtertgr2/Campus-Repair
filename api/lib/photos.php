<?php
/**
 * การเก็บรูปภาพ
 *
 * frontend ส่งรูปมาเป็น data URL (`data:image/jpeg;base64,...`) หลังย่อขนาดแล้ว
 * backend จะถอดรหัสและเขียนเป็นไฟล์ใน api/uploads แล้วเก็บแค่ path สัมพัทธ์
 * (`uploads/xxxx.jpg`) ลงฐานข้อมูล — เวลาย้ายเครื่อง/ย้ายโดเมนข้อมูลยังใช้ได้
 */

/**
 * เพดานขนาดรูป (ไบต์หลังถอด base64)
 * อ่านจาก post_max_size ของ php.ini เพื่อไม่ให้ PHP ตัด body ทิ้งก่อนถึงโค้ดเรา
 * (base64 ทำให้ข้อมูลบวม ~1.37 เท่า จึงเผื่อพื้นที่ให้รูปประมาณ 60% ของเพดาน body)
 */
function cr_max_photo_bytes()
{
    $limit = cr_max_request_bytes();
    if ($limit <= 0) {
        return 3 * 1024 * 1024; // post_max_size = 0 (ไม่จำกัด) → ใช้ค่าเริ่มต้นที่ปลอดภัย
    }
    return max(256 * 1024, (int) ($limit * 0.6));
}

/** โฟลเดอร์เก็บรูป */
function cr_photo_dir()
{
    return CR_APP_DIR . '/uploads';
}

/** gd พร้อมใช้หรือไม่ (ถ้าไม่มี จะเก็บไฟล์ตามที่เบราว์เซอร์ส่งมา) */
function cr_gd_available()
{
    return function_exists('imagecreatefromstring');
}

/**
 * ปรับขนาด/แปลงรูปฝั่งเซิร์ฟเวอร์ (ต้องมี gd)
 * คืน [binary, extension] — ถ้าทำไม่ได้จะคืนค่าเดิมโดยไม่ทำให้คำขอพัง
 *
 * เหตุผล: กันคนส่งรูปใหญ่ตรง ๆ มาที่ API (ข้ามการย่อฝั่งเบราว์เซอร์) และแปลงเป็น WebP เมื่อทำได้
 */
function cr_normalize_photo($binary, $mime)
{
    $extensions = array(
        'image/jpeg' => '.jpg',
        'image/png' => '.png',
        'image/webp' => '.webp',
        'image/gif' => '.gif',
    );
    $fallbackExt = isset($extensions[$mime]) ? $extensions[$mime] : '.jpg';

    if (!cr_gd_available()) {
        return array($binary, $fallbackExt);
    }

    $image = @imagecreatefromstring($binary);
    if ($image === false) {
        return array($binary, $fallbackExt);
    }

    $width = imagesx($image);
    $height = imagesy($image);
    $maxEdge = max(320, (int) cr_config('photo_max_edge', 1600));
    $scale = min(1, $maxEdge / max(1, max($width, $height)));
    $newWidth = max(1, (int) round($width * $scale));
    $newHeight = max(1, (int) round($height * $scale));

    $canvas = $image;
    if ($scale < 1) {
        $canvas = imagecreatetruecolor($newWidth, $newHeight);
        // พื้นขาวสำหรับ PNG/GIF ที่มีส่วนโปร่งใส (WebP/JPEG ไม่รองรับ alpha)
        $white = imagecolorallocate($canvas, 255, 255, 255);
        imagefilledrectangle($canvas, 0, 0, $newWidth, $newHeight, $white);
        imagecopyresampled($canvas, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
    }

    $quality = max(40, min(95, (int) cr_config('photo_quality', 82)));
    ob_start();
    if (function_exists('imagewebp')) {
        imagewebp($canvas, null, $quality);
        $converted = ob_get_clean();
        $extension = '.webp';
    } else {
        imagejpeg($canvas, null, $quality);
        $converted = ob_get_clean();
        $extension = '.jpg';
    }

    if ($canvas !== $image) {
        imagedestroy($canvas);
    }
    imagedestroy($image);

    if (!is_string($converted) || $converted === '') {
        return array($binary, $fallbackExt);
    }

    return array($converted, $extension);
}

/**
 * บันทึกรูปจาก data URL และคืนค่า path สัมพัทธ์ ('' ถ้าไม่ได้แนบรูปมา)
 */
function cr_save_photo($dataUrl, $name = 'photo')
{
    $dataUrl = trim(cr_str($dataUrl));
    if ($dataUrl === '') {
        return '';
    }

    if (!preg_match('#^data:(image/[a-z0-9.+-]+);base64,(.+)$#is', $dataUrl, $matches)) {
        throw new ApiError('รูปภาพต้องอยู่ในรูปแบบ data URL แบบ base64');
    }

    $mime = strtolower($matches[1]);
    $extensions = array(
        'image/jpeg' => '.jpg',
        'image/png' => '.png',
        'image/webp' => '.webp',
        'image/gif' => '.gif',
    );
    if (!isset($extensions[$mime])) {
        throw new ApiError('รองรับเฉพาะรูป JPEG, PNG, WebP และ GIF');
    }

    $binary = base64_decode(preg_replace('/\s+/', '', $matches[2]), true);
    if ($binary === false || $binary === '') {
        throw new ApiError('ถอดรหัส base64 ของรูปภาพไม่สำเร็จ');
    }
    $maxBytes = cr_max_photo_bytes();
    if (strlen($binary) > $maxBytes) {
        throw new ApiError('รูปภาพมีขนาดใหญ่เกิน ' . round($maxBytes / 1048576, 1) . ' MB');
    }
    if (@getimagesizefromstring($binary) === false) {
        throw new ApiError('ไฟล์ที่แนบมาไม่ใช่รูปภาพ');
    }

    $dir = cr_photo_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new ApiError('สร้างโฟลเดอร์ api/uploads ไม่สำเร็จ');
    }
    if (!is_writable($dir)) {
        throw new ApiError('โฟลเดอร์ api/uploads เขียนไม่ได้ — ให้สิทธิ์ Apache (www-data) เขียนในโฟลเดอร์นี้');
    }

    // ย่อ/แปลงรูปฝั่งเซิร์ฟเวอร์ด้วย gd (ถ้าเปิดใช้อยู่)
    list($binary, $extension) = cr_normalize_photo($binary, $mime);

    $filename = bin2hex(random_bytes(12)) . $extension;
    if (@file_put_contents($dir . '/' . $filename, $binary, LOCK_EX) === false) {
        throw new ApiError('บันทึกไฟล์รูปภาพไม่สำเร็จ');
    }

    return 'uploads/' . $filename;
}

/** ฐาน URL ของโฟลเดอร์ api (เช่น http://localhost/campus-repair/api) */
function cr_api_base_url()
{
    $https = false;
    if (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        $https = true;
    }
    if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') {
        $https = true;
    }

    $host = isset($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : 'localhost';
    $script = isset($_SERVER['SCRIPT_NAME']) ? (string) $_SERVER['SCRIPT_NAME'] : '/api/index.php';
    $dir = rtrim(str_replace('\\', '/', dirname($script)), '/');

    return ($https ? 'https' : 'http') . '://' . $host . $dir;
}

/**
 * แปลง path ที่เก็บในฐานข้อมูลเป็น URL ที่เบราว์เซอร์เปิดได้
 * (ค่าเก่าที่เป็น URL เต็มหรือ data URL อยู่แล้วจะปล่อยผ่าน)
 */
function cr_photo_url($stored)
{
    $stored = cr_str($stored);
    if ($stored === '') {
        return '';
    }
    $prefix = strtolower(substr($stored, 0, 8));
    if ($prefix === 'https://' || substr($stored, 0, 7) === 'http://' || substr($stored, 0, 5) === 'data:') {
        return $stored;
    }
    return cr_api_base_url() . '/' . ltrim($stored, '/');
}
