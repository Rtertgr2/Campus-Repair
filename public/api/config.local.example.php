<?php
// Copy to config.local.php BEFORE npm run build (or edit dist/api/config.local.php).
return [
    'host' => '127.0.0.1',
    'port' => '3306',
    'database' => 'campus_repair',
    'username' => 'root',       // XAMPP local default; use a dedicated user on hosting
    'password' => '',          // Your MySQL password
    'staff_pin' => '',         // Set a private PIN of at least 6 digits
];
