import { Injectable, Logger } from '@nestjs/common';

/** Outgoing SMS / email. Real providers are added later as adapters behind the same interface. */
export abstract class SmsSender {
  abstract send(phone: string, text: string): Promise<void>;
}

export abstract class EmailSender {
  abstract send(to: string, subject: string, text: string): Promise<void>;
}

/** Development provider: writes the message to the API log instead of sending it. */
@Injectable()
export class ConsoleSmsSender extends SmsSender {
  private readonly log = new Logger('SMS');

  async send(phone: string, text: string): Promise<void> {
    this.log.log(`→ ${phone}: ${text}`);
  }
}

@Injectable()
export class ConsoleEmailSender extends EmailSender {
  private readonly log = new Logger('Email');

  async send(to: string, subject: string, text: string): Promise<void> {
    this.log.log(`→ ${to} | ${subject}: ${text}`);
  }
}
