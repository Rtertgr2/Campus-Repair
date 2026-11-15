<?php
declare(strict_types=1);
/**
 * The one MySQL connection used by the HTTP API and the tools in db/.
 * Connections run in UTC so TIMESTAMP columns are read back consistently.
 */
function openDatabase(array $config): PDO
{
    $db = new PDO(
        'mysql:host=' . $config['host'] . ';port=' . $config['port'] . ';dbname=' . $config['database'] . ';charset=utf8mb4',
        $config['username'],
        $config['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    $db->exec("SET time_zone = '+00:00'");
    return $db;
}
