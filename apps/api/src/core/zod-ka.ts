import { z, ZodIssueCode } from 'zod';

// Georgian validation messages (Accept-Language based messages come later).
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' || issue.received === 'null' ? 'სავალდებულოა' : 'არასწორი ტიპი' };
    case ZodIssueCode.too_small:
      return { message: issue.type === 'string' ? (issue.minimum === 1 ? 'სავალდებულოა' : `მინიმუმ ${issue.minimum} სიმბოლო`) : `მინიმუმ ${issue.minimum}` };
    case ZodIssueCode.too_big:
      return { message: issue.type === 'string' ? `მაქსიმუმ ${issue.maximum} სიმბოლო` : `მაქსიმუმ ${issue.maximum}` };
    case ZodIssueCode.invalid_enum_value:
      return { message: `დასაშვებია: ${issue.options.join(', ')}` };
    case ZodIssueCode.invalid_string:
      return { message: 'არასწორი ფორმატი' };
    default:
      return { message: ctx.defaultError };
  }
});
