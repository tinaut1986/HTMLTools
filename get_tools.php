<?php
$gamesDir = __DIR__;
$games = array_filter(glob($gamesDir . '/*'), 'is_dir');
$gameData = array_map(function($path) use ($gamesDir) {
    $name = str_replace($gamesDir . '/', '', $path);
    $faviconPath = $path . '/favicon.ico';
    $favicon = file_exists($faviconPath) ? base64_encode(file_get_contents($faviconPath)) : null;
    return [
        'name' => $name,
        'favicon' => $favicon
    ];
}, $games);
$gameData = array_values(array_filter($gameData, function($game) {
    return $game['name'] !== 'assets' && !str_starts_with($game['name'], '.');
}));
echo json_encode($gameData);
?>


