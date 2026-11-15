<?php
declare(strict_types=1);
/**
 * Photo storage for repair jobs.
 *
 * Photos are written as files under <site>/uploads/<YYYY>/<MM>/ and the database
 * keeps only the relative path ("uploads/2026/11/<name>.jpg"), so list responses
 * stay small instead of shipping base64 blobs on every request.
 * Each photo gets a 480px-wide JPEG thumbnail named "<name>-thumb.jpg".
 * Used by public/api/index.php (HTTP) and db/migrate-photos.php (one-off move).
 */

const PHOTO_MAX_BYTES = 3 * 1024 * 1024; // longest accepted data-URL string
const PHOTO_THUMB_WIDTH = 480;
const PHOTO_THUMB_QUALITY = 72;

const PHOTO_EXTENSIONS = ['jpeg' => 'jpg', 'png' => 'png', 'webp' => 'webp'];

/** Folder holding the files; set UPLOADS_DIR when uploads live outside the app folder. */
function uploadsDir(): string
{
    $env = getenv('UPLOADS_DIR');
    return $env !== false && $env !== '' ? rtrim($env, '/') : dirname(__DIR__) . '/uploads';
}

/** Absolute path of a stored relative path such as "uploads/2026/11/abc.jpg". */
function photoAbsolutePath(string $relative): string
{
    $tail = strpos($relative, 'uploads/') === 0 ? substr($relative, strlen('uploads/')) : $relative;
    return uploadsDir() . '/' . $tail;
}

/** Thumbnail name for a stored photo: "uploads/…/x.png" becomes "uploads/…/x-thumb.jpg". */
function thumbName(string $relative): string
{
    if ($relative === '') return '';
    $dot = strrpos($relative, '.');
    return ($dot === false ? $relative : substr($relative, 0, $dot)) . '-thumb.jpg';
}

/** Thumbnail to show for a stored photo, or the photo itself when none was generated. */
function thumbOf(string $relative): string
{
    $thumb = thumbName($relative);
    return $thumb !== '' && is_file(photoAbsolutePath($thumb)) ? $thumb : $relative;
}

function ensureDir(string $dir): void
{
    if (is_dir($dir)) return;
    if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('สร้างโฟลเดอร์ไม่ได้: ' . $dir);
    }
}

/**
 * Decodes a data-URL photo, writes it plus a thumbnail and returns the stored path.
 * Throws InvalidArgumentException for bad input and RuntimeException for IO problems.
 */
function storePhoto(string $dataUrl, string $subDir = ''): string
{
    if ($dataUrl === '') return '';
    if (strlen($dataUrl) > PHOTO_MAX_BYTES) throw new InvalidArgumentException('รูปภาพมีขนาดใหญ่เกินไป');
    if (!preg_match('~^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$~D', $dataUrl, $parts)) {
        throw new InvalidArgumentException('รูปภาพต้องเป็น JPEG, PNG หรือ WebP');
    }
    $bytes = base64_decode($parts[2], true);
    $info = $bytes === false ? false : @getimagesizefromstring($bytes);
    if (!$info || $info['mime'] !== 'image/' . $parts[1]) {
        throw new InvalidArgumentException('ไฟล์รูปภาพไม่ถูกต้อง');
    }

    $subDir = $subDir !== '' ? trim($subDir, '/') : date('Y/m');
    $name = bin2hex(random_bytes(16)) . '.' . PHOTO_EXTENSIONS[$parts[1]];
    $relative = 'uploads/' . $subDir . '/' . $name;
    $absolute = photoAbsolutePath($relative);

    ensureDir(dirname($absolute));
    if (file_put_contents($absolute, $bytes) !== strlen($bytes)) {
        throw new RuntimeException('บันทึกไฟล์รูปไม่ได้: ' . $absolute);
    }
    writeThumb($absolute, photoAbsolutePath(thumbName($relative)));
    return $relative;
}

/** Deletes a stored photo and its thumbnail (used to undo a failed request). */
function discardPhoto(string $relative): void
{
    if ($relative === '') return;
    foreach ([photoAbsolutePath($relative), photoAbsolutePath(thumbName($relative))] as $file) {
        if (is_file($file)) @unlink($file);
    }
}

/** Creates the thumbnail; returns false (and leaves no file) when GD is unavailable. */
function writeThumb(string $source, string $target): bool
{
    if (!function_exists('imagecreatefromstring')) return false;
    $image = @imagecreatefromstring((string) @file_get_contents($source));
    if ($image === false) return false;

    $width = imagesx($image);
    $height = imagesy($image);
    $scale = min(1.0, PHOTO_THUMB_WIDTH / max(1, $width));
    $thumb = imagescale($image, max(1, (int) round($width * $scale)), max(1, (int) round($height * $scale)));
    imagedestroy($image);
    if ($thumb === false) return false;

    $ok = @imagejpeg($thumb, $target, PHOTO_THUMB_QUALITY);
    imagedestroy($thumb);
    return $ok;
}
