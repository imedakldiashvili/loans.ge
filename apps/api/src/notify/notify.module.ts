import { Global, Module, Provider } from '@nestjs/common';
import { ConsoleEmailSender, ConsoleSmsSender, EmailSender, SmsSender } from './notifier';

// SMS_PROVIDER / EMAIL_PROVIDER pick the adapter; only `console` exists for now.
const pick = (env: string | undefined, kind: string) => {
  const name = env ?? 'console';
  if (name !== 'console') throw new Error(`${kind} provider "${name}" is not implemented yet`);
};

const providers: Provider[] = [
  { provide: SmsSender, useFactory: () => (pick(process.env.SMS_PROVIDER, 'SMS'), new ConsoleSmsSender()) },
  { provide: EmailSender, useFactory: () => (pick(process.env.EMAIL_PROVIDER, 'Email'), new ConsoleEmailSender()) },
];

@Global()
@Module({ providers, exports: [SmsSender, EmailSender] })
export class NotifyModule {}
