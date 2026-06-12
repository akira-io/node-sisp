<?php

declare(strict_types=1);

$root = getenv('SISP_ROOT') ?: '/tmp/laravel-sisp-2x';

spl_autoload_register(function (string $class) use ($root): void {
    $prefix = 'Akira\\Sisp\\';

    if (! str_starts_with($class, $prefix)) {
        return;
    }

    $path = $root.'/src/'.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';

    if (is_file($path)) {
        require $path;
    }
});

use Akira\Sisp\Enums\ErrorMessageType;
use Akira\Sisp\Enums\SuccessMessageType;

$definitions = array_map(
    fn (ErrorMessageType $case): array => [
        'key' => $case->name,
        'value' => $case->value,
        'category' => $case->category(),
        'action' => $case->action(),
    ],
    ErrorMessageType::cases(),
);

$successDefinitions = array_map(
    fn (SuccessMessageType $case): array => [
        'key' => $case->name,
        'value' => $case->value,
    ],
    SuccessMessageType::cases(),
);

$translations = [];

foreach (['en', 'pt', 'fr'] as $language) {
    $messages = require $root."/resources/lang/{$language}/messages.php";

    $translations[$language] = [
        'errors' => $messages['errors'],
        'success' => $messages['success'],
    ];
}

$json = fn (mixed $value): string => json_encode(
    $value,
    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
);

$header = "// @generated from akira-io/laravel-sisp@2.x via scripts/generate-enums-data.php\n";

file_put_contents(
    __DIR__.'/../src/enums/error-message-types.generated.ts',
    $header
    ."export const ERROR_MESSAGE_TYPE_DEFINITIONS = {$json($definitions)} as const;\n\n"
    ."export const SUCCESS_MESSAGE_TYPE_DEFINITIONS = {$json($successDefinitions)} as const;\n",
);

file_put_contents(
    __DIR__.'/../src/enums/translations.generated.ts',
    $header."export const MESSAGE_TRANSLATIONS = {$json($translations)} as const;\n",
);

echo 'generated '.count($definitions).' error types, '.count($successDefinitions)." success types\n";
