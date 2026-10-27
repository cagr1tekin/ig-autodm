import type { Env } from './index'

// Worker kendi secret'ını değiştiremez: yenilenen token KV'de tutulur,
// IG_ACCESS_TOKEN secret'ı yalnızca ilk değerdir.
const TOKEN_KEY = 'token:current'
const STATUS_KEY = 'token:status'

export interface TokenStatus {
  at: string
  ok: boolean
  expiresAt?: string
  error?: string
}

export async function loadToken(env: Env): Promise<void> {
  const stored = await env.IG_KV.get(TOKEN_KEY)
  if (stored) env.IG_ACCESS_TOKEN = stored
}

export async function refreshToken(env: Env): Promise<TokenStatus> {
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(env.IG_ACCESS_TOKEN)}`
  const res = await fetch(url)
  const data: any = await res.json().catch(() => ({}))

  let status: TokenStatus
  if (res.ok && data.access_token) {
    await env.IG_KV.put(TOKEN_KEY, data.access_token)
    env.IG_ACCESS_TOKEN = data.access_token
    status = { at: new Date().toISOString(), ok: true, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString() }
  } else {
    status = { at: new Date().toISOString(), ok: false, error: data.error?.message ?? `HTTP ${res.status}` }
  }
  console.log('token refresh', status.ok ? `ok, expires ${status.expiresAt}` : `FAILED: ${status.error}`)
  await env.IG_KV.put(STATUS_KEY, JSON.stringify(status))
  return status
}

export function getTokenStatus(env: Env): Promise<TokenStatus | null> {
  return env.IG_KV.get<TokenStatus>(STATUS_KEY, 'json')
}
