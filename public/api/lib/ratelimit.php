<?php
declare(strict_types=1);
/**
 * Per-IP rate limiting for public write actions.
 *
 * State lives in api/storage/ratelimit/<action>-<sha256(ip)>.json and is kept
 * separate from the staff PIN lock (this file never touches PIN verification).
 * Request from a new action gets its own counter, so createIssue and
 * submitAssessment cannot lock each other out.
 */

const RATE_LIMIT_DIR = __DIR__ . '/../storage/ratelimit';

/** action => [max requests per window, window in seconds] */
const RATE_LIMITS = [
    'createIssue' => [10, 60],
    'submitAssessment' => [10, 60],
];

function clientIp(): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    return $ip !== '' ? $ip : 'unknown';
}

function rateLimitFile(string $action, string $ip): string
{
    return RATE_LIMIT_DIR . '/' . $action . '-' . hash('sha256', $ip) . '.json';
}

/**
 * Counts this request and reports whether the caller is still inside the limit.
 * Fails open (returns true) if the counter file cannot be written, so a broken
 * storage folder cannot take the public form down; the problem is logged.
 */
function rateLimitHit(string $action, string $ip): bool
{
    if (!isset(RATE_LIMITS[$action])) return true;
    [$max, $window] = RATE_LIMITS[$action];

    if (!is_dir(RATE_LIMIT_DIR) && !@mkdir(RATE_LIMIT_DIR, 0775, true) && !is_dir(RATE_LIMIT_DIR)) {
        error_log('Campus Repair rate limit: cannot create ' . RATE_LIMIT_DIR);
        return true;
    }

    $path = rateLimitFile($action, $ip);
    $handle = @fopen($path, 'c+');
    if ($handle === false) {
        error_log('Campus Repair rate limit: cannot open ' . $path);
        return true;
    }
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        return true;
    }

    $now = time();
    $state = json_decode((string) stream_get_contents($handle), true);
    if (
        !is_array($state)
        || !isset($state['start'], $state['count'])
        || !is_int($state['start'])
        || !is_int($state['count'])
        || $now - $state['start'] >= $window
    ) {
        $state = ['start' => $now, 'count' => 0];
    }

    $state['count']++;
    $allowed = $state['count'] <= $max;

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, (string) json_encode($state));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    return $allowed;
}

/** Drops counter files that are past their window; called rarely, at random. */
function rateLimitCleanup(int $maxAge = 3600): void
{
    if (mt_rand(1, 200) !== 1 || !is_dir(RATE_LIMIT_DIR)) return;
    foreach ((array) glob(RATE_LIMIT_DIR . '/*.json') as $file) {
        if (is_string($file) && @filemtime($file) < time() - $maxAge) @unlink($file);
    }
}
