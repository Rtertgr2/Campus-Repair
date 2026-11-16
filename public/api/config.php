<?php
// Server-side only. Never put credentials in VITE_* variables.
$config = [
    'host' => getenv('DB_HOST') ?: '127.0.0.1',
    'port' => getenv('DB_PORT') ?: '3306',
    'database' => getenv('DB_NAME') ?: 'campus_repair',
    'username' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') === false ? '' : getenv('DB_PASSWORD'),
    'staff_pin' => getenv('STAFF_PIN') ?: '',
    'staff_name' => getenv('STAFF_NAME') ?: 'เจ้าหน้าที่',
    // Per-IP daily photo budget for the public form, in bytes (0 disables it).
    'upload_daily_bytes' => (int) (getenv('UPLOAD_DAILY_BYTES') ?: 50 * 1024 * 1024),
    // Proxy IPs (comma separated) whose X-Forwarded-For is trusted; empty means the
    // header is ignored, because anyone can send it.
    'trusted_proxies' => array_values(array_filter(
        array_map('trim', explode(',', (string) (getenv('TRUSTED_PROXIES') ?: ''))),
        fn($ip) => filter_var($ip, FILTER_VALIDATE_IP) !== false
    )),
];
$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_replace($config, require $local);
}
return $config;
