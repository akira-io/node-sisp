<?php

declare(strict_types=1);

$src = getenv('SISP_SRC') ?: '/tmp/laravel-sisp-2x/src';

spl_autoload_register(function (string $class) use ($src): void {
    $prefix = 'Akira\\Sisp\\';

    if (! str_starts_with($class, $prefix)) {
        return;
    }

    $path = $src.'/'.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';

    if (is_file($path)) {
        require $path;
    }
});

use Akira\Sisp\Actions\FingerPrint\PaymentResponseFingerPrintAction;
use Akira\Sisp\Actions\FingerPrint\RefundFingerPrintAction;
use Akira\Sisp\Actions\GenerateFingerprintAction;
use Akira\Sisp\Actions\PostAutCode;
use Akira\Sisp\Contracts\SispCredentialsResolver;
use Akira\Sisp\Support\SispAmount;
use Akira\Sisp\ValueObjects\CallbackPayload;
use Akira\Sisp\ValueObjects\SispCredentials;

function resolverFor(string $posAutCode): SispCredentialsResolver
{
    $credentials = new SispCredentials(
        posId: '90051',
        posAutCode: $posAutCode,
        currency: '132',
        merchantId: 'MERCHANT-1',
        url: 'https://gateway.test',
        languageMessages: 'EN',
        fingerprintVersion: '1',
        is3DSec: '0',
        sandbox: true,
    );

    return new class($credentials) implements SispCredentialsResolver
    {
        public function __construct(private readonly SispCredentials $credentials) {}

        public function resolve(): SispCredentials
        {
            return $this->credentials;
        }
    };
}

$posAutCodes = [
    'TEST_POS_AUT_CODE',
    'secret',
    'aB3!@#$%^&*()_+-=[]{}|;:,.<>?',
    'çãéü€ unicode',
    str_repeat('K', 64),
    '0123456789',
];

$tokens = array_map(
    fn (string $code): array => [
        'posAutCode' => $code,
        'token' => base64_encode(hash('sha512', $code, true)),
    ],
    $posAutCodes,
);

$amountCases = [
    ['kind' => 'string', 'value' => '8.03'],
    ['kind' => 'float', 'value' => 8.03],
    ['kind' => 'int', 'value' => 1000],
    ['kind' => 'string', 'value' => '100.50'],
    ['kind' => 'string', 'value' => '0.001'],
    ['kind' => 'string', 'value' => '8.0295'],
    ['kind' => 'string', 'value' => '8.0294'],
    ['kind' => 'string', 'value' => '8.03001'],
    ['kind' => 'string', 'value' => '.5'],
    ['kind' => 'string', 'value' => '+3.2'],
    ['kind' => 'string', 'value' => '-7.0005'],
    ['kind' => 'float', 'value' => -7.0005],
    ['kind' => 'string', 'value' => '0012'],
    ['kind' => 'string', 'value' => ' 25 '],
    ['kind' => 'string', 'value' => ''],
    ['kind' => 'string', 'value' => 'abc'],
    ['kind' => 'string', 'value' => '12abc'],
    ['kind' => 'string', 'value' => '1e3'],
    ['kind' => 'int', 'value' => 0],
    ['kind' => 'float', 'value' => 0.1],
    ['kind' => 'float', 'value' => 1234.5678],
    ['kind' => 'float', 'value' => 999999.9999],
    ['kind' => 'string', 'value' => '999999.99995'],
];

$amounts = array_map(
    fn (array $case): array => [
        ...$case,
        'thousandths' => SispAmount::toThousandths($case['value']),
        'cents' => SispAmount::toCents($case['value']),
    ],
    $amountCases,
);

$paymentCases = [
    [
        'posAutCode' => 'TEST_POS_AUT_CODE',
        'data' => [
            'timeStamp' => '2024-01-15 14:30:00',
            'amount' => 100.50,
            'merchantRef' => 'test-ref-123',
            'merchantSession' => 'test-session-456',
            'posID' => 'POS-001',
            'currency' => 'AOA',
            'transactionCode' => 'PURCHASE',
        ],
        'expect' => 'xoYJjgMu1BZN/pZHxIj2GL9gyulZjByJ/moOMc6iDd/N962z6GYHGqZfnIQKoxfxpUiM79NvA6WrasgecGAqJg==',
    ],
    [
        'posAutCode' => 'TEST_POS_AUT_CODE',
        'data' => [
            'timeStamp' => '2024-01-15 14:30:00',
            'amount' => 8.03,
            'merchantRef' => 'test-ref-803',
            'merchantSession' => 'test-session-803',
            'posID' => 'POS-001',
            'currency' => 'AOA',
            'transactionCode' => 'PURCHASE',
        ],
        'expect' => 'Yr0dM+VllFj8HUK9HdwOkS5Cwd2iPdJ5FSweuVnYttxnuYXP88c0ijnxy5iKQp3eF32NKCVJF7lovl4Xug3YnA==',
    ],
    [
        'posAutCode' => 'secret',
        'data' => [
            'timeStamp' => '2026-06-12 10:00:00',
            'amount' => '1500',
            'merchantRef' => 'R20260612100000',
            'merchantSession' => 'S20260612100000',
            'posID' => '90051',
            'currency' => '132',
            'transactionCode' => '1',
        ],
    ],
    [
        'posAutCode' => 'secret',
        'data' => ['amount' => '0.001'],
    ],
    [
        'posAutCode' => 'çãéü€ unicode',
        'data' => [
            'timeStamp' => '2026-01-01 00:00:00',
            'amount' => 8.0295,
            'merchantRef' => 'R-çã',
            'merchantSession' => 'S-éü',
            'posID' => '90051',
            'currency' => '132',
            'transactionCode' => '3',
        ],
    ],
];

$payment = [];

foreach ($paymentCases as $case) {
    $action = new GenerateFingerprintAction(new PostAutCode(resolverFor($case['posAutCode'])));
    $fingerprint = $action->handle($case['data']);

    if (isset($case['expect']) && $fingerprint !== $case['expect']) {
        fwrite(STDERR, "Self-check failed for payment vector: {$fingerprint}\n");
        exit(1);
    }

    $payment[] = [
        'posAutCode' => $case['posAutCode'],
        'data' => $case['data'],
        'fingerprint' => $fingerprint,
    ];
}

$callbackCases = [
    [
        'posAutCode' => 'TEST_POS_AUT_CODE',
        'post' => [
            'messageType' => '8',
            'merchantRespCP' => '01',
            'merchantRespTid' => 'FAKE12345678',
            'merchantRespMerchantRef' => 'R20260612100000',
            'merchantRespMerchantSession' => 'S20260612100000',
            'merchantRespPurchaseAmount' => '1500',
            'merchantRespMessageID' => 'MSG-ABCDEFGH',
            'merchantRespPan' => '****-****-****-1234',
            'merchantResp' => '00',
            'merchantRespTimeStamp' => '2026-06-12 10:00:05',
            'merchantRespReferenceNumber' => 'REF123456789',
            'merchantRespEntityCode' => '10010',
            'merchantRespClientReceipt' => 'RECEIPT-XYZ',
            'merchantRespAdditionalErrorMessage' => '',
            'reloadCode' => '',
            'posID' => '90051',
            'currency' => '132',
            'transactionCode' => '1',
        ],
    ],
    [
        'posAutCode' => 'TEST_POS_AUT_CODE',
        'post' => [
            'messageType' => '6',
            'merchantRespMerchantRef' => 'R1',
            'merchantRespMerchantSession' => 'S1',
            'merchantRespPurchaseAmount' => '8.03',
            'merchantRespTid' => 'T1',
            'merchantResp' => '',
            'merchantRespTimeStamp' => '2026-06-12 10:00:05',
            'merchantRespAdditionalErrorMessage' => 'Sandbox transaction failed',
        ],
    ],
    [
        'posAutCode' => 'secret',
        'post' => [
            'messageType' => 'P',
            'merchantRespCP' => '0042',
            'merchantRespTid' => '00001234',
            'merchantRespMerchantRef' => 'R-çã',
            'merchantRespMerchantSession' => 'S-éü',
            'merchantRespPurchaseAmount' => 100.50,
            'merchantRespMessageID' => 'M1',
            'merchantRespPan' => '1234',
            'merchantResp' => 'C',
            'merchantRespTimeStamp' => '2026-01-01 00:00:00',
            'merchantRespReferenceNumber' => '42',
            'merchantRespEntityCode' => '7',
            'merchantRespClientReceipt' => 'receipt çãéü€',
            'merchantRespAdditionalErrorMessage' => 'erro',
            'reloadCode' => 'RC',
        ],
    ],
    [
        'posAutCode' => 'secret',
        'post' => ['messageType' => ''],
    ],
];

$callback = [];

foreach ($callbackCases as $case) {
    $action = new PaymentResponseFingerPrintAction(new PostAutCode(resolverFor($case['posAutCode'])));
    $payload = CallbackPayload::from($case['post']);

    $callback[] = [
        'posAutCode' => $case['posAutCode'],
        'post' => $case['post'],
        'fingerprint' => $action->handle($payload),
    ];
}

$refundCases = [
    [
        'posAutCode' => 'TEST_POS_AUT_CODE',
        'data' => [
            'timeStamp' => '2026-06-12 10:00:00',
            'amount' => '1500',
            'merchantRef' => 'R20260612100000',
            'merchantSession' => 'S20260612100000',
            'posID' => '90051',
            'currency' => '132',
            'transactionCode' => '4',
            'clearingPeriod' => '42',
            'transactionID' => '123',
        ],
    ],
    [
        'posAutCode' => 'TEST_POS_AUT_CODE',
        'data' => [
            'timeStamp' => ' 2026-06-12 10:00:00 ',
            'amount' => 8.03,
            'merchantRef' => ' R1 ',
            'merchantSession' => ' S1 ',
            'posID' => ' 90051 ',
            'currency' => ' 132 ',
            'transactionCode' => '8',
            'clearingPeriod' => ' 7 ',
            'transactionID' => ' 99 ',
        ],
    ],
    [
        'posAutCode' => 'secret',
        'data' => [
            'amount' => '0.5',
            'transactionCode' => '9',
            'clearingPeriod' => '12345',
            'transactionID' => '123456789',
        ],
    ],
    [
        'posAutCode' => 'secret',
        'data' => ['amount' => 0],
    ],
];

$refund = [];

foreach ($refundCases as $case) {
    $action = new RefundFingerPrintAction(new PostAutCode(resolverFor($case['posAutCode'])));

    $refund[] = [
        'posAutCode' => $case['posAutCode'],
        'data' => $case['data'],
        'fingerprint' => $action->handle($case['data']),
    ];
}

$vectors = [
    'source' => 'akira-io/laravel-sisp@2.x',
    'tokens' => $tokens,
    'amounts' => $amounts,
    'payment' => $payment,
    'callback' => $callback,
    'refund' => $refund,
];

echo json_encode($vectors, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
