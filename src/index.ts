import { BUTTONS, TEXTS, getCampaign } from './campaigns'
import { handleAdmin } from './admin'
import { PAGES } from './legal'
import { loadToken, refreshToken } from './token'

export interface Env {
  IG_KV: KVNamespace
  GRAPH_VERSION: string
  IG_ACCESS_TOKEN: string
  IG_APP_SECRET: string
  VERIFY_TOKEN: string
  ADMIN_TOKEN: string
}

type Button =
  | { type: 'postback'; title: string; payload: string }
  | { type: 'web_url'; title: string; url: string }

const PAYLOAD_PREFIX = 'LINK|'

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    await loadToken(env)
    const { pathname } = new URL(req.url)
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return handleAdmin(req, env)

    if (req.method === 'GET' && PAGES[pathname]) {
      return new Response(PAGES[pathname], { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    if (req.method === 'GET') return verifySubscription(req, env)
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    const raw = await req.text()
    console.log('webhook', raw.slice(0, 2000))
    if (!(await validSignature(raw, req.headers.get('x-hub-signature-256'), env.IG_APP_SECRET))) {
      return new Response('Invalid signature', { status: 401 })
    }

    // Meta 200'ü hızlı bekler; asıl iş arka planda
    ctx.waitUntil(handleEvent(JSON.parse(raw), env).catch((e) => console.error('handleEvent', e)))
    return new Response('OK')
  },

  // Haftalık: uzun ömürlü token'ı yenile (60 günlük süreyi sıfırlar)
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await loadToken(env)
    await refreshToken(env)
  },
}

function verifySubscription(req: Request, env: Env): Response {
  const q = new URL(req.url).searchParams
  if (q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === env.VERIFY_TOKEN) {
    return new Response(q.get('hub.challenge') ?? '')
  }
  return new Response('Forbidden', { status: 403 })
}

async function validSignature(body: string, header: string | null, secret: string): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return safeEqual(hex, header.slice('sha256='.length))
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function handleEvent(body: any, env: Env): Promise<void> {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === 'comments') await onComment(change.value, entry.id, env)
      // Meta postback'i bazen changes içinde gönderiyor (panel testleri böyle)
      const pb = change.value
      if (change.field === 'messaging_postbacks' && pb?.postback?.payload && !pb.is_self) {
        await onPostback(pb.sender.id, pb.postback.payload, env)
      }
    }
    for (const m of entry.messaging ?? []) {
      if (m.postback?.payload && !m.postback.is_self) await onPostback(m.sender.id, m.postback.payload, env)
      if (m.message?.text && !m.message.is_echo) await onMessage(m.sender.id, m.message.text, env)
    }
  }
}

// --- Yorum: kelime eşleşirse herkese açık cevap + butonlu DM ---
async function onComment(v: any, ownerId: string, env: Env): Promise<void> {
  const mediaId: string | undefined = v.media?.id
  if (!mediaId || !v.from?.id || v.from.id === ownerId) return
  const campaign = await getCampaign(env.IG_KV, mediaId)
  if (!campaign?.active) return

  // "web", "Web 🔥", "web lütfen" eşleşir; "website" eşleşmez
  const words = normalize(v.text).split(/[^\p{L}\p{N}]+/u)
  if (!words.includes(normalize(campaign.keyword))) return

  // Aynı kişi aynı posta bir kez; Meta'nın tekrar gönderdiği webhook'ları da eler
  const doneKey = `done:${mediaId}:${v.from.id}`
  if (await env.IG_KV.get(doneKey)) return
  await env.IG_KV.put(doneKey, '1')

  await graph(env, `/${v.id}/replies`, { message: TEXTS.commentReply })
  await sendButtons(env, { comment_id: v.id }, TEXTS.intro, [
    { type: 'postback', title: BUTTONS.sendLink, payload: PAYLOAD_PREFIX + mediaId },
  ])
  await log(env, mediaId, 'comment', v.from.id, v.from.username)
}

// --- Buton: takip kontrolü, ya link ya da tekrar "takip et" ---
async function onPostback(userId: string, payload: string, env: Env): Promise<void> {
  if (!payload.startsWith(PAYLOAD_PREFIX)) return
  const mediaId = payload.slice(PAYLOAD_PREFIX.length)
  const campaign = await getCampaign(env.IG_KV, mediaId)
  if (!campaign) return

  await log(env, mediaId, 'click', userId)
  if (await isFollower(env, userId)) {
    await sendButtons(env, { id: userId }, TEXTS.success, [{ type: 'web_url', title: BUTTONS.open, url: campaign.url }])
    await log(env, mediaId, 'link', userId)
  } else {
    await sendButtons(env, { id: userId }, TEXTS.followRequired, [
      { type: 'postback', title: BUTTONS.followedSend, payload },
    ])
  }
}

// --- DM: "verilerimi sil" yazana ait tüm kayıtları sil (gizlilik politikasında vaat edilen) ---
const DELETE_COMMAND = 'verilerimi sil'

async function onMessage(userId: string, text: string, env: Env): Promise<void> {
  if (!normalize(text).includes(DELETE_COMMAND)) return
  let cursor: string | undefined
  do {
    const page = await env.IG_KV.list({ cursor })
    const mine = page.keys.filter((k) => (k.name.startsWith('log:') || k.name.startsWith('done:')) && k.name.endsWith(`:${userId}`))
    await Promise.all(mine.map((k) => env.IG_KV.delete(k.name)))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  await graph(env, '/me/messages', { recipient: { id: userId }, message: { text: 'Verilerin silindi ✅' } })
}

async function isFollower(env: Env, userId: string): Promise<boolean> {
  const res = await fetch(graphUrl(env, `/${userId}?fields=is_user_follow_business`), { headers: auth(env) })
  if (!res.ok) {
    console.error('isFollower', res.status, await res.text())
    return false
  }
  const data: any = await res.json()
  return data.is_user_follow_business === true
}

function sendButtons(env: Env, recipient: Record<string, string>, text: string, buttons: Button[]) {
  return graph(env, '/me/messages', {
    recipient,
    message: { attachment: { type: 'template', payload: { template_type: 'button', text, buttons } } },
  })
}

export const graphUrl = (env: Env, path: string) => `https://graph.instagram.com/${env.GRAPH_VERSION}${path}`
export const auth = (env: Env) => ({ Authorization: `Bearer ${env.IG_ACCESS_TOKEN}` })

async function graph(env: Env, path: string, body: unknown): Promise<void> {
  const res = await fetch(graphUrl(env, path), {
    method: 'POST',
    headers: { ...auth(env), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) console.error('graph', path, res.status, await res.text())
}

// Her adım için bir kayıt: log:<media>:<adım>:<kullanıcı> (admin sayfası bunları sayar)
function log(env: Env, mediaId: string, step: 'comment' | 'click' | 'link', userId: string, username?: string) {
  return env.IG_KV.put(`log:${mediaId}:${step}:${userId}`, JSON.stringify({ at: new Date().toISOString(), username }))
}

function normalize(s: unknown): string {
  return String(s ?? '').trim().toLocaleLowerCase('tr')
}
