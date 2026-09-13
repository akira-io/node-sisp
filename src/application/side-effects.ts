export const SispSideEffects = {
  CreateInvoiceStub: 'create_invoice_stub',
  StoreRequestMetadata: 'store_request_metadata',
  UpdateInvoiceStatus: 'update_invoice_status',
  ResolveRetryAvailability: 'resolve_retry_availability',
  LoadCurrentAttempt: 'load_current_attempt',
  CancelUserCancelledTransaction: 'cancel_user_cancelled_transaction',
} as const;

export type SispSideEffect = (typeof SispSideEffects)[keyof typeof SispSideEffects];

export type SideEffectErrorHandler = (sideEffect: SispSideEffect, error: unknown) => void;
