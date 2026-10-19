// Passkeys (WebAuthn) in the browser: add one to the account, sign in with one.
// The API hands the WebAuthn options as a JSON string and takes the browser's answer the same way (see apps/api/src/auth/passkey.ts).
import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from '@simplewebauthn/browser';
import { api, Ref } from './api';
import { t } from './i18n';

export const passkeysSupported = () => browserSupportsWebAuthn();

/** The browser's own errors in plain words (the user closed the dialog, the key is already there, …). */
const plain = (e: unknown) => {
  if (e instanceof WebAuthnError) {
    if (e.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return t('ეს პასკოდი უკვე დამატებულია');
    if (e.code === 'ERROR_CEREMONY_ABORTED') return t('გაუქმდა');
  }
  if (e instanceof Error && e.name === 'NotAllowedError') return t('გაუქმდა ან დრო ამოიწურა');
  return null;
};

/** Add a passkey to the signed-in account: the device asks for a fingerprint / face / PIN. */
export async function addPasskey(): Promise<Ref> {
  const { OptionsJson } = await api<{ OptionsJson: string }>('POST', '/client/passkey/registerOptions');
  let answer;
  try {
    answer = await startRegistration({ optionsJSON: JSON.parse(OptionsJson) });
  } catch (e) {
    throw new Error(plain(e) ?? (e as Error).message);
  }
  return api<Ref>('POST', '/client/passkey/register', { ResponseJson: JSON.stringify(answer) });
}

/** Sign in with a passkey the device keeps for this site (no e-mail to type). */
export async function signInWithPasskey(): Promise<void> {
  const { ChallengeID, OptionsJson } = await api<{ ChallengeID: string; OptionsJson: string }>('POST', '/public/auth/passkeyOptions', {});
  let answer;
  try {
    answer = await startAuthentication({ optionsJSON: JSON.parse(OptionsJson) });
  } catch (e) {
    throw new Error(plain(e) ?? (e as Error).message);
  }
  await api('POST', '/public/auth/passkeyLogin', { ChallengeID, ResponseJson: JSON.stringify(answer) });
}
