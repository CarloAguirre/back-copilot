import {
  Controller, Post, Req, Headers,
  HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from './webhook.service';

@Controller('github/webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /** POST /github/webhooks/agent-inbox */
  @Post('agent-inbox')
  @HttpCode(HttpStatus.OK)
  async agentInbox(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-github-event') event: string,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    if (!signature) throw new UnauthorizedException('Missing x-hub-signature-256');
    if (!this.webhookService.verifySignature(req.rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    if (event === 'push') {
      await this.webhookService.handlePush(req.body);
    }
    return { ok: true };
  }
}
