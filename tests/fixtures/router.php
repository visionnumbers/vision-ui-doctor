<?php
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
usleep(30000);
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
echo '<!doctype html><meta charset="utf-8"><title>PHP fixture</title><main>' . htmlspecialchars($path, ENT_QUOTES, 'UTF-8') . '</main>';
