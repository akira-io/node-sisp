export interface TransactionStatusConfig {
  url: string;
  portalId: string;
  portalPassword: string;
  timeoutSeconds: number;
  retryAttempts: number;
  retryDelayMs: number;
  reconciliationEnabled: boolean;
  reconcileAfterMinutes: number;
  reconcileLimit: number;
}

export const DEFAULT_TRANSACTION_STATUS: TransactionStatusConfig = {
  url: 'https://comerciante.vinti4.cv/pos/transaction-status',
  portalId: '',
  portalPassword: '',
  timeoutSeconds: 10,
  retryAttempts: 2,
  retryDelayMs: 100,
  reconciliationEnabled: false,
  reconcileAfterMinutes: 5,
  reconcileLimit: 50,
};
