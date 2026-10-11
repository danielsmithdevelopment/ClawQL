/** Public Supabase Auth flags for clawql.com managed signup (browser-safe). */

export function isSupabaseAuthConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  )
}

export function supabasePublicConfig(env: NodeJS.ProcessEnv = process.env): {
  url: string
  anonKey: string
} | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null
  return { url: url.replace(/\/$/, ''), anonKey }
}

export type SupabaseAuthSession = {
  accessToken: string
  refreshToken?: string
  userId: string
  email?: string
}

type AuthRestBody = {
  access_token?: string
  refresh_token?: string
  user?: { id?: string; email?: string }
  error?: string
  error_description?: string
  msg?: string
  message?: string
}

/** Browser signup against Supabase Auth REST (anon key). */
export async function supabaseSignUpWithPassword(input: {
  email: string
  password: string
  url?: string
  anonKey?: string
}): Promise<SupabaseAuthSession> {
  const cfg = supabasePublicConfig()
  const url = (input.url ?? cfg?.url)?.replace(/\/$/, '')
  const anonKey = input.anonKey ?? cfg?.anonKey
  if (!url || !anonKey) {
    throw new Error('Supabase Auth is not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)')
  }
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: input.email.trim(), password: input.password }),
  })
  const body = (await res.json().catch(() => ({}))) as AuthRestBody
  if (!res.ok) {
    throw new Error(
      body.error_description || body.msg || body.message || body.error || `Signup failed (${res.status})`,
    )
  }
  const accessToken = body.access_token?.trim()
  const userId = body.user?.id?.trim()
  if (!accessToken || !userId) {
    throw new Error(
      'Signup succeeded but no session returned — check Supabase email confirmation settings',
    )
  }
  return {
    accessToken,
    refreshToken: body.refresh_token,
    userId,
    email: body.user?.email ?? input.email.trim(),
  }
}
