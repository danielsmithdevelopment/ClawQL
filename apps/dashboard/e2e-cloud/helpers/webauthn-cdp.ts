/**
 * Chrome DevTools Protocol virtual authenticator for KEY-* / SI-* Pass-when.
 * Prefer this over pinVerified / keyKind flags when asserting ceremony outcomes.
 *
 * @see https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/
 */
import type { CDPSession, Page } from '@playwright/test'

export type VirtualAuthenticatorOptions = {
  /** CTAP2 protocol (default). */
  protocol?: 'ctap2' | 'u2f'
  transport?: 'usb' | 'nfc' | 'ble' | 'internal'
  hasResidentKey?: boolean
  hasUserVerification?: boolean
  isUserVerified?: boolean
  /** Synced passkey / multi-device. */
  automaticPresenceSimulation?: boolean
}

/**
 * Enable WebAuthn domain and add a virtual authenticator on the page's CDP session.
 * Returns authenticatorId for credential preload / counter tests (cloned-key).
 */
export async function attachVirtualAuthenticator(
  page: Page,
  opts: VirtualAuthenticatorOptions = {},
): Promise<{ cdp: CDPSession; authenticatorId: string }> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: opts.protocol ?? 'ctap2',
      transport: opts.transport ?? 'usb',
      hasResidentKey: opts.hasResidentKey ?? true,
      hasUserVerification: opts.hasUserVerification ?? true,
      isUserVerified: opts.isUserVerified ?? true,
      automaticPresenceSimulation: opts.automaticPresenceSimulation ?? true,
    },
  })
  return { cdp, authenticatorId }
}

/**
 * Preload a credential with a chosen signature counter (KEY-11 cloned-key path).
 */
export async function addCredential(
  cdp: CDPSession,
  authenticatorId: string,
  input: {
    credentialId: string
    isResidentCredential?: boolean
    rpId: string
    privateKey: string
    signCount: number
    userHandle?: string
  },
): Promise<void> {
  await cdp.send('WebAuthn.addCredential', {
    authenticatorId,
    credential: {
      credentialId: input.credentialId,
      isResidentCredential: input.isResidentCredential ?? true,
      rpId: input.rpId,
      privateKey: input.privateKey,
      signCount: input.signCount,
      userHandle: input.userHandle ?? '',
    },
  })
}

export async function setUserVerified(
  cdp: CDPSession,
  authenticatorId: string,
  isUserVerified: boolean,
): Promise<void> {
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified })
}
