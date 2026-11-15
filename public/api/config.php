<?php
// Server-side only. Never put credentials in VITE_* variables.
$config = [
    'host' => getenv('DB_HOST') ?: '127.0.0.1',
    'port' => getenv('DB_PORT') ?: '3306',
    'database' => getenv('DB_NAME') ?: 'campus_repair',
    'username' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') === false ? '' : getenv('DB_PASSWORD'),
    'staff_pin' => getenv('STAFF_PIN') ?: '',
];
$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_replace($config, require $local);
}
return $config;
