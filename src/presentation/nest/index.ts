import {
  Controller,
  type DynamicModule,
  Get,
  Inject,
  Module,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Sisp } from '../../application/sisp';
import { send, toRequestInfo } from '../express/bridge';

export const SISP = 'SISP';
export const SISP_REFUND_AUTHORIZER = 'SISP_REFUND_AUTHORIZER';

export type RefundAuthorizer = (request: Request) => boolean | Promise<boolean>;

export interface SispModuleOptions {
  sisp: Sisp;
  authorizeRefund?: RefundAuthorizer;
}

@Controller('sisp')
export class SispController {
  constructor(
    @Inject(SISP) private readonly sisp: Sisp,
    @Inject(SISP_REFUND_AUTHORIZER) private readonly authorizeRefund: RefundAuthorizer,
  ) {}

  @Post('payment')
  async payment(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.sisp.handlers.handlePayment(toRequestInfo(req)));
  }

  @Post('payment/intent')
  async paymentIntent(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.sisp.handlers.handlePaymentIntent(toRequestInfo(req)));
  }

  @Get('callback')
  async callbackResult(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.sisp.handlers.handleCallback(toRequestInfo(req)));
  }

  @Post('callback')
  async callbackNotification(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.sisp.handlers.handleCallback(toRequestInfo(req)));
  }

  @Get('retry-payment')
  async retryForm(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.sisp.handlers.handleRetryPayment(toRequestInfo(req)));
  }

  @Post('retry-payment')
  async retrySubmit(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.sisp.handlers.handleRetryPayment(toRequestInfo(req)));
  }

  @Get('cancel')
  async cancel(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.sisp.handlers.handleCancel(toRequestInfo(req)));
  }

  @Get('sandbox')
  async sandboxForm(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.sisp.handlers.handleSandbox(toRequestInfo(req)));
  }

  @Post('sandbox')
  async sandboxSubmit(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.sisp.handlers.handleSandbox(toRequestInfo(req)));
  }

  @Get('countries')
  countries(@Res() res: Response): void {
    send(res, this.sisp.handlers.handleCountries());
  }

  @Post('refund/:transaction')
  async refund(
    @Param('transaction') transaction: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!(await this.authorizeRefund(req))) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized to refund this transaction.',
      });

      return;
    }

    send(res, await this.sisp.handlers.handleRefund(toRequestInfo(req), Number(transaction)));
  }
}

@Module({})
export class SispModule {
  static forRoot(options: SispModuleOptions): DynamicModule {
    return {
      module: SispModule,
      controllers: [SispController],
      providers: [
        { provide: SISP, useValue: options.sisp },
        { provide: SISP_REFUND_AUTHORIZER, useValue: options.authorizeRefund ?? (() => false) },
      ],
      exports: [SISP],
    };
  }
}
