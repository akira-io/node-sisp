// @generated from akira-io/laravel-sisp@2.x via scripts/generate-enums-data.php
export const ERROR_MESSAGE_TYPE_DEFINITIONS = [
    {
        "key": "referToCardIssuer",
        "value": "1",
        "category": "issuer",
        "action": "contact-issuer"
    },
    {
        "key": "invalidMerchant",
        "value": "3",
        "category": "validation",
        "action": "contact-support"
    },
    {
        "key": "cardRetained",
        "value": "4",
        "category": "card",
        "action": "contact-issuer-activate"
    },
    {
        "key": "transactionRefused",
        "value": "5",
        "category": "issuer",
        "action": "contact-issuer"
    },
    {
        "key": "issuerError",
        "value": "6",
        "category": "system",
        "action": "retry"
    },
    {
        "key": "invalidTransaction",
        "value": "12",
        "category": "validation",
        "action": "contact-support"
    },
    {
        "key": "invalidAmount",
        "value": "13",
        "category": "validation",
        "action": "check-payment-details"
    },
    {
        "key": "invalidCard",
        "value": "14",
        "category": "validation",
        "action": "check-payment-details"
    },
    {
        "key": "formatError",
        "value": "30",
        "category": "validation",
        "action": "check-payment-details"
    },
    {
        "key": "cardExpired",
        "value": "33",
        "category": "card",
        "action": "contact-issuer"
    },
    {
        "key": "fraudSuspected",
        "value": "34",
        "category": "security",
        "action": "contact-issuer-security"
    },
    {
        "key": "restrictedCard",
        "value": "36",
        "category": "card",
        "action": "contact-issuer-activate"
    },
    {
        "key": "pinTriesExceeded",
        "value": "38",
        "category": "security",
        "action": "retry"
    },
    {
        "key": "cardLost",
        "value": "41",
        "category": "card",
        "action": "contact-issuer"
    },
    {
        "key": "cardStolen",
        "value": "43",
        "category": "card",
        "action": "contact-issuer"
    },
    {
        "key": "insufficientFunds",
        "value": "51",
        "category": "funds",
        "action": "use-different-card"
    },
    {
        "key": "incorrectPin",
        "value": "55",
        "category": "security",
        "action": "retry"
    },
    {
        "key": "transactionNotAllowed",
        "value": "57",
        "category": "validation",
        "action": "use-different-card"
    },
    {
        "key": "transactionNotAllowedTerminal",
        "value": "58",
        "category": "validation",
        "action": "use-different-card"
    },
    {
        "key": "amountExceedsLimit",
        "value": "61",
        "category": "funds",
        "action": "reduce-amount"
    },
    {
        "key": "cardRestrictedByCountry",
        "value": "62",
        "category": "validation",
        "action": "use-different-card"
    },
    {
        "key": "transactionCountExceeded",
        "value": "65",
        "category": "funds",
        "action": "reduce-amount"
    },
    {
        "key": "cardBlocked",
        "value": "76",
        "category": "card",
        "action": "contact-issuer"
    },
    {
        "key": "processingError",
        "value": "77",
        "category": "system",
        "action": "retry"
    },
    {
        "key": "cardNotActivated",
        "value": "78",
        "category": "card",
        "action": "contact-issuer-activate"
    },
    {
        "key": "expirationDateError",
        "value": "80",
        "category": "validation",
        "action": "use-different-card"
    },
    {
        "key": "encryptionError",
        "value": "81",
        "category": "system",
        "action": "contact-support"
    },
    {
        "key": "authenticationError",
        "value": "82",
        "category": "security",
        "action": "retry"
    },
    {
        "key": "securityVerificationFailure",
        "value": "83",
        "category": "security",
        "action": "contact-issuer-security"
    },
    {
        "key": "issuerUnavailable",
        "value": "91",
        "category": "system",
        "action": "retry"
    },
    {
        "key": "financialInstitutionNotFound",
        "value": "92",
        "category": "system",
        "action": "contact-issuer"
    },
    {
        "key": "transactionDuplication",
        "value": "94",
        "category": "issuer",
        "action": "contact-support"
    },
    {
        "key": "systemError",
        "value": "96",
        "category": "system",
        "action": "retry"
    },
    {
        "key": "communicationTimeout",
        "value": "97",
        "category": "system",
        "action": "retry"
    },
    {
        "key": "invalidFingerprint",
        "value": "98",
        "category": "validation",
        "action": "contact-support"
    },
    {
        "key": "genericError",
        "value": "99",
        "category": "unknown",
        "action": "contact-support"
    }
] as const;

export const SUCCESS_MESSAGE_TYPE_DEFINITIONS = [
    {
        "key": "purchase",
        "value": "8"
    },
    {
        "key": "servicePayment",
        "value": "P"
    },
    {
        "key": "phoneRecharge",
        "value": "M"
    },
    {
        "key": "enrollmentRequest",
        "value": "A"
    },
    {
        "key": "tokenPayment",
        "value": "B"
    },
    {
        "key": "tokenCancel",
        "value": "C"
    }
] as const;
