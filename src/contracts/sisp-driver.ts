export interface SispDriver {
  name(): string;
  paymentEndpoint(): string;
}
