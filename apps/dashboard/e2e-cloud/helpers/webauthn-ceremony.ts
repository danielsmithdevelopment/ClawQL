/**
 * Drive WebAuthn registration / issue step-up via CDP virtual authenticator.
 * Pass-when still belongs on /audit + Profile UI — not the arrange response alone.
 */
import type { Page } from '@playwright/test'

import {
  attachVirtualAuthenticator,
  setUserVerified,
  type VirtualAuthenticatorOptions,
} from './webauthn-cdp'

/** WebAuthn requires a hostname (not 127.0.0.1); rewrite loopback for ceremonies. */
const base = () => {
  const raw = process.env.CLAWQL_CLOUD_E2E_BASE_URL ?? 'http://127.0.0.1:3040'
  return raw.replace('://127.0.0.1', '://localhost').replace('://[::1]', '://localhost')
}

async function ensureLocalhostPage(page: Page): Promise<void> {
  const target = base()
  if (!page.url().startsWith(target)) {
    await page.goto(`${target}/profile`)
  }
}

export type RegisterViaCdpInput = {
  page: Page
  person?: string
  kind: 'device-bound' | 'synced'
  label: string
  /** When false, verify path refuses (KEY-07-style UV off). Default true. */
  userVerified?: boolean
}

function authenticatorOptsForKind(
  kind: 'device-bound' | 'synced',
  userVerified: boolean,
): VirtualAuthenticatorOptions {
  if (kind === 'synced') {
    return {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: userVerified,
      automaticPresenceSimulation: true,
    }
  }
  return {
    protocol: 'ctap2',
    transport: 'usb',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: userVerified,
    automaticPresenceSimulation: true,
  }
}

/**
 * Attach CDP authenticator, run navigator.credentials.create, verify with harness.
 * Returns arrange status; callers must assert /audit + UI for Pass-when.
 */
export async function registerSecurityKeyViaCdp(input: RegisterViaCdpInput): Promise<{
  status: number
  body: Record<string, unknown>
}> {
  const userVerified = input.userVerified !== false
  await ensureLocalhostPage(input.page)
  const { cdp, authenticatorId } = await attachVirtualAuthenticator(
    input.page,
    authenticatorOptsForKind(input.kind, userVerified),
  )
  await setUserVerified(cdp, authenticatorId, userVerified)

  const optRes = await input.page.request.post(`${base()}/api/e2e/webauthn/register/options`, {
    data: {
      person: input.person ?? 'Dana Reyes',
      kind: input.kind,
      label: input.label,
    },
  })
  const optJson = (await optRes.json()) as { options: PublicKeyCredentialCreationOptionsJSON }
  if (!optRes.ok()) {
    return { status: optRes.status(), body: optJson as unknown as Record<string, unknown> }
  }

  if (!userVerified) {
    const refuse = await input.page.request.post(`${base()}/api/e2e/webauthn/register/verify`, {
      data: { userVerified: false },
    })
    return { status: refuse.status(), body: (await refuse.json()) as Record<string, unknown> }
  }

  const attestation = await input.page.evaluate(async (options) => {
    function b64urlToBuf(s: string): ArrayBuffer {
      const pad = '='.repeat((4 - (s.length % 4)) % 4)
      const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
      const bin = atob(b64)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out.buffer
    }
    function bufToB64url(buf: ArrayBuffer): string {
      const bytes = new Uint8Array(buf)
      let s = ''
      for (const b of bytes) s += String.fromCharCode(b)
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }

    const publicKey: PublicKeyCredentialCreationOptions = {
      ...options,
      challenge: b64urlToBuf(options.challenge),
      user: {
        ...options.user,
        id: b64urlToBuf(options.user.id),
      },
      excludeCredentials: options.excludeCredentials?.map((c) => ({
        ...c,
        id: b64urlToBuf(c.id),
      })),
    }

    const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential
    const att = cred.response as AuthenticatorAttestationResponse
    return {
      id: cred.id,
      rawId: bufToB64url(cred.rawId),
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults(),
      response: {
        clientDataJSON: bufToB64url(att.clientDataJSON),
        attestationObject: bufToB64url(att.attestationObject),
        transports: typeof att.getTransports === 'function' ? att.getTransports() : [],
      },
    }
  }, optJson.options)

  const verifyRes = await input.page.request.post(`${base()}/api/e2e/webauthn/register/verify`, {
    data: { response: attestation, userVerified: true },
  })
  return { status: verifyRes.status(), body: (await verifyRes.json()) as Record<string, unknown> }
}

/**
 * Attempt API-key issue step-up with CDP UV state (KEY-07).
 * When userVerified is false, refuses without creating a key.
 */
export async function issueApiKeyViaCdpStepUp(input: {
  page: Page
  name: string
  person?: string
  userVerified?: boolean
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const userVerified = input.userVerified !== false
  await ensureLocalhostPage(input.page)
  const { cdp, authenticatorId } = await attachVirtualAuthenticator(input.page, {
    protocol: 'ctap2',
    transport: 'usb',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: userVerified,
    automaticPresenceSimulation: true,
  })
  await setUserVerified(cdp, authenticatorId, userVerified)

  const optRes = await input.page.request.post(`${base()}/api/e2e/webauthn/issue/options`, {
    data: { person: input.person ?? 'Dana Reyes', name: input.name },
  })
  if (!optRes.ok()) {
    return { status: optRes.status(), body: (await optRes.json()) as Record<string, unknown> }
  }

  const verifyRes = await input.page.request.post(`${base()}/api/e2e/webauthn/issue/verify`, {
    data: {
      name: input.name,
      userVerified,
      // UV-off path refuses before response; UV-on still requires presence of response
      response: userVerified ? { id: 'cdp-presence' } : undefined,
    },
  })
  return { status: verifyRes.status(), body: (await verifyRes.json()) as Record<string, unknown> }
}

/** Minimal JSON shape from @simplewebauthn/server generateRegistrationOptions. */
type PublicKeyCredentialCreationOptionsJSON = {
  challenge: string
  user: { id: string; name: string; displayName: string }
  excludeCredentials?: { id: string; type: string; transports?: string[] }[]
  rp: { name: string; id?: string }
  pubKeyCredParams: { alg: number; type: string }[]
  timeout?: number
  attestation?: AttestationConveyancePreference
  authenticatorSelection?: AuthenticatorSelectionCriteria
}
