<?php

declare(strict_types=1);

$root = getenv('SISP_ROOT') ?: '/tmp/laravel-sisp-2x';

require $root.'/src/Support/Countries.php';

use Akira\Sisp\Support\Countries;

$json = json_encode(
    Countries::all(),
    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
);

$header = "// @generated from akira-io/laravel-sisp@2.x via scripts/generate-countries.php\n";

file_put_contents(
    __DIR__.'/../src/support/countries.generated.ts',
    $header."export const COUNTRIES = {$json} as const;\n",
);

echo 'generated '.count(Countries::all())." countries\n";
