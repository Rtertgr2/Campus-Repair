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

// Counters live next to the API; set RATE_LIMIT_DIR to keep writable data elsewhere.
define('RATE_LIMIT_DIR', rtrim(getenv('RATE_LIMIT_DIR') ?: __DIR__ . '/../storage/ratelimit', '/'));

/** action => [max requests per window, window in seconds] */
const RATE_LIMITS = [
    'createIssue' => [10, 60],
    'submitAssessment' => [10, 60],
];

/**
 * IP used as the limit key. X-Forwarded-For is read only when the request comes
 * from a proxy listed in TRUSTED_PROXIES, and then the right-most address that is
 * not itself a trusted proxy is the client (the header is spoofable, so an
 * unconfigured server must ignore it entirely).
 */
function clientIp(array $trustedProxies = []): string
{
    $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    if ($trustedProxies === [] || !in_array($remote, $trustedProxies, true)) {
        return $remote !== '' ? $remote : 'unknown';
    }

    $chain = array_reverse(array_filter(array_map('trim', explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')))));
    foreach ($chain as $forwarded) {
        if (!filter_var($forwarded, FILTER_VALIDATE_IP)) continue;
        if (in_array($forwarded, $trustedProxies, true)) continue;
        return $forwarded;
    }
    return $remote;
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

function uploadQuotaFile(string $ip): string
{
    return RATE_LIMIT_DIR . '/upload-' . hash('sha256', $ip) . '.json';
}

/**
 * Reserves $bytes against today's per-IP photo budget and reports whether the
 * caller is still inside it. The reservation is not rolled back when a later
 * step fails, so a failed request can cost a few bytes — the counter resets at
 * midnight. Fails open like the request limit: a broken folder must not take the
 * public form down.
 */
function uploadQuotaReserve(string $ip, int $bytes, int $dailyBytes): bool
{
    if ($dailyBytes <= 0) return true;
    if (!is_dir(RATE_LIMIT_DIR) && !@mkdir(RATE_LIMIT_DIR, 0775, true) && !is_dir(RATE_LIMIT_DIR)) {
        error_log('Campus Repair upload quota: cannot create ' . RATE_LIMIT_DIR);
        return true;
    }

    $path = uploadQuotaFile($ip);
    $handle = @fopen($path, 'c+');
    if ($handle === false) {
        error_log('Campus Repair upload quota: cannot open ' . $path);
        return true;
    }
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        return true;
    }

    $today = date('Y-m-d');
    $state = json_decode((string) stream_get_contents($handle), true);
    if (!is_array($state) || ($state['date'] ?? '') !== $today || !is_int($state['bytes'] ?? null)) {
        $state = ['date' => $today, 'bytes' => 0];
    }

    $allowed = $state['bytes'] + $bytes <= $dailyBytes;
    if ($allowed) $state['bytes'] += $bytes;

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, (string) json_encode($state));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    return $allowed;
}

/** Seconds left in the day, for the Retry-After header of the daily budget. */
function secondsUntilTomorrow(): int
{
    return max(60, (new DateTimeImmutable('today'))->modify('+1 day')->getTimestamp() - time());
}

/** Drops counter files that are past their window; called rarely, at random. */
function rateLimitCleanup(int $maxAge = 3600): void
{
    if (mt_rand(1, 200) !== 1 || !is_dir(RATE_LIMIT_DIR)) return;
    foreach ((array) glob(RATE_LIMIT_DIR . '/*.json') as $file) {
        // The daily upload budget keys off its own date, so idling must not reset it.
        if (!is_string($file) || strpos(basename($file), 'upload-') === 0) continue;
        if (@filemtime($file) < time() - $maxAge) @unlink($file);
    }
}
