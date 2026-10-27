import { campaignKey, type Campaign } from './campaigns'
import { auth, graphUrl, safeEqual, type Env } from './index'
import { getTokenStatus, refreshToken } from './token'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export async function handleAdmin(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url)
  if (pathname === '/admin' || pathname === '/admin/') {
    return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!env.ADMIN_TOKEN || !safeEqual(token, env.ADMIN_TOKEN)) return json({ error: 'unauthorized' }, 401)

  if (pathname === '/admin/api/posts' && req.method === 'GET') return listPosts(env)
  if (pathname === '/admin/api/status' && req.method === 'GET') return status(env)
  if (pathname === '/admin/api/refresh-token' && req.method === 'POST') {
    await refreshToken(env)
    return status(env)
  }
  if (pathname === '/admin/api/subscribe' && req.method === 'POST') {
    const res = await fetch(graphUrl(env, `/me/subscribed_apps?subscribed_fields=${SUB_FIELDS}`), { method: 'POST', headers: auth(env) })
    const body = await res.text()
    console.log('subscribe', res.status, body)
    return res.ok ? status(env) : json({ error: `Abonelik başarısız: ${res.status} ${body}` }, 502)
  }

  const m = pathname.match(/^\/admin\/api\/campaigns\/(\d+)$/)
  if (m && req.method === 'PUT') {
    const body = (await req.json()) as Partial<Campaign>
    const keyword = String(body.keyword ?? '').trim()
    const url = String(body.url ?? '').trim()
    if (!keyword || !/^https?:\/\//.test(url)) return json({ error: 'Kelime ve geçerli bir link gerekli' }, 400)
    const campaign: Campaign = { keyword, url, active: body.active !== false }
    await env.IG_KV.put(campaignKey(m[1]), JSON.stringify(campaign))
    return json(campaign)
  }
  if (m && req.method === 'DELETE') {
    await env.IG_KV.delete(campaignKey(m[1]))
    return json({ ok: true })
  }
  return json({ error: 'not found' }, 404)
}

const SUB_FIELDS = 'comments,messages,messaging_postbacks'

async function status(env: Env): Promise<Response> {
  const [me, subs] = await Promise.all([
    fetch(graphUrl(env, '/me?fields=user_id,username'), { headers: auth(env) }).then((r) => r.json()),
    fetch(graphUrl(env, '/me/subscribed_apps'), { headers: auth(env) }).then((r) => r.json()),
  ])
  return json({ me, subscriptions: subs, token: await getTokenStatus(env) })
}

async function listPosts(env: Env): Promise<Response> {
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp'
  const res = await fetch(graphUrl(env, `/me/media?fields=${fields}&limit=24`), { headers: auth(env) })
  if (!res.ok) return json({ error: `Instagram API: ${res.status} ${await res.text()}` }, 502)
  const { data } = (await res.json()) as { data: any[] }

  const posts = await Promise.all(
    data.map(async (p) => ({
      id: p.id,
      caption: p.caption ?? '',
      thumb: p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url,
      permalink: p.permalink,
      timestamp: p.timestamp,
      campaign: await env.IG_KV.get<Campaign>(campaignKey(p.id), 'json'),
      stats: {
        comment: await count(env, `log:${p.id}:comment:`),
        click: await count(env, `log:${p.id}:click:`),
        link: await count(env, `log:${p.id}:link:`),
      },
    })),
  )
  return json({ posts })
}

async function count(env: Env, prefix: string): Promise<number> {
  let total = 0
  let cursor: string | undefined
  do {
    const page = await env.IG_KV.list({ prefix, cursor })
    total += page.keys.length
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return total
}

const PAGE = /* html */ `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yorum → Link</title>
<style>
  :root { --bg:#0b0b0c; --card:#161618; --line:#2a2a2e; --text:#f2f2f3; --muted:#8d8d95; --accent:#7c5cff; --ok:#2fbf71; --err:#ff5c5c }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif }
  header { position:sticky; top:0; background:rgba(11,11,12,.85); backdrop-filter:blur(12px); border-bottom:1px solid var(--line); padding:14px 16px; display:flex; justify-content:space-between; align-items:center; z-index:1 }
  h1 { font-size:17px; margin:0 }
  main { max-width:760px; margin:0 auto; padding:16px; display:grid; gap:12px }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px; display:grid; grid-template-columns:88px 1fr; gap:12px }
  .card img { width:88px; height:110px; object-fit:cover; border-radius:10px; background:#222 }
  .cap { color:var(--muted); font-size:13px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden }
  .row { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap }
  input { background:#0f0f11; border:1px solid var(--line); color:var(--text); border-radius:9px; padding:9px 10px; font:inherit; min-width:0 }
  input.kw { width:110px } input.url { flex:1 1 220px }
  button { background:var(--accent); color:#fff; border:0; border-radius:9px; padding:9px 14px; font:inherit; font-weight:600; cursor:pointer }
  button.ghost { background:transparent; border:1px solid var(--line); color:var(--muted); font-weight:500 }
  button:active { transform:scale(.97) }
  .stats { font-size:13px; color:var(--muted); margin-top:8px }
  .stats b { color:var(--text) }
  .badge { font-size:12px; padding:2px 8px; border-radius:99px; border:1px solid var(--line); color:var(--muted) }
  .badge.on { color:var(--ok); border-color:var(--ok) }
  .msg { font-size:13px; margin-top:6px } .msg.err { color:var(--err) } .msg.ok { color:var(--ok) }
  #login { max-width:360px; margin:18vh auto; padding:16px; display:grid; gap:10px }
  a { color:inherit }
  @media (max-width:480px) { .card { grid-template-columns:64px 1fr } .card img { width:64px; height:80px } }
</style>
</head>
<body>
<div id="login" hidden>
  <h1>Yorum → Link</h1>
  <input id="pw" type="password" placeholder="Admin şifresi" autocomplete="current-password">
  <button id="loginBtn">Giriş</button>
  <div id="loginMsg" class="msg err"></div>
</div>
<div id="app" hidden>
  <header><h1>Yorum → Link</h1><button class="ghost" id="logout">Çıkış</button></header>
  <main><div class="card" id="status" style="display:block"><div class="stats">Bağlantı kontrol ediliyor…</div></div>
  <div id="list" style="display:grid;gap:12px"><div class="stats">Yükleniyor…</div></div></main>
</div>
<script>
const $ = (s) => document.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
let token = ''
try { token = localStorage.getItem('adminToken') || '' } catch {}

async function api(path, opts = {}) {
  const res = await fetch('/admin/api' + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) { showLogin('Şifre yanlış'); throw new Error('unauthorized') }
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

function showLogin(msg = '') { $('#app').hidden = true; $('#login').hidden = false; $('#loginMsg').textContent = msg }

async function load() {
  $('#login').hidden = true; $('#app').hidden = false
  loadStatus()
  try {
    const { posts } = await api('/posts')
    $('#list').innerHTML = posts.map(card).join('') || '<div class="stats">Post bulunamadı.</div>'
  } catch (e) { if (e.message !== 'unauthorized') $('#list').innerHTML = '<div class="msg err">' + esc(e.message) + '</div>' }
}

async function loadStatus(path = '/status', opts) {
  const box = $('#status')
  try {
    const { me, subscriptions, token } = await api(path, opts)
    const fields = (subscriptions?.data?.[0]?.subscribed_fields) || []
    const need = ['comments', 'messaging_postbacks']
    const ok = need.every((f) => fields.includes(f))
    box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<div><b>@' + esc(me?.username || '?') + '</b> <span class="stats">ID ' + esc(me?.user_id || '?') + '</span><br>' +
      '<span class="badge ' + (ok ? 'on' : '') + '">' + (ok ? 'Webhook aboneliği aktif' : 'Webhook aboneliği YOK') + '</span> ' +
      '<span class="stats">' + esc(fields.join(', ') || '—') + '</span></div>' +
      (ok ? '' : '<button id="subBtn">Abone et</button>') + '</div>' +
      '<div class="row" style="align-items:center;justify-content:space-between"><span class="stats" style="margin:0">Token: ' + tokenText(token) + '</span>' +
      '<button class="ghost" id="refreshBtn">Şimdi yenile</button></div>' +
      (me?.error || subscriptions?.error ? '<div class="msg err">' + esc(JSON.stringify(me?.error || subscriptions?.error)) + '</div>' : '')
    const r = $('#refreshBtn'); r.onclick = () => { r.disabled = true; loadStatus('/refresh-token', { method: 'POST' }) }
    const b = $('#subBtn'); if (b) b.onclick = () => { b.disabled = true; loadStatus('/subscribe', { method: 'POST' }) }
  } catch (e) { if (e.message !== 'unauthorized') box.innerHTML = '<div class="msg err">' + esc(e.message) + '</div>' }
}

function tokenText(t) {
  if (!t) return 'henüz yenilenmedi (haftalık otomatik)'
  const d = (x) => new Date(x).toLocaleString('tr-TR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
  return t.ok
    ? '<b style="color:var(--ok)">yenilendi</b> ' + d(t.at) + ' · bitiş ' + d(t.expiresAt)
    : '<b style="color:var(--err)">son yenileme başarısız</b> ' + d(t.at) + ': ' + esc(t.error)
}

function card(p) {
  const c = p.campaign
  const date = new Date(p.timestamp).toLocaleDateString('tr-TR', { day:'numeric', month:'short' })
  return '<div class="card" data-id="' + esc(p.id) + '">' +
    '<a href="' + esc(p.permalink) + '" target="_blank" rel="noopener"><img src="' + esc(p.thumb) + '" alt="" loading="lazy"></a>' +
    '<div><div style="display:flex;gap:8px;align-items:center;justify-content:space-between">' +
      '<span class="badge ' + (c?.active ? 'on' : '') + '">' + (c?.active ? 'Aktif' : c ? 'Kapalı' : 'Kampanya yok') + '</span>' +
      '<span class="stats" style="margin:0">' + date + '</span></div>' +
    '<div class="cap">' + esc(p.caption) + '</div>' +
    '<div class="row"><input class="kw" placeholder="kelime" value="' + esc(c?.keyword) + '">' +
      '<input class="url" placeholder="https://drive.google.com/…" value="' + esc(c?.url) + '"></div>' +
    '<div class="row"><button data-act="save">' + (c ? 'Güncelle' : 'Kaydet') + '</button>' +
      (c ? '<button class="ghost" data-act="toggle">' + (c.active ? 'Durdur' : 'Başlat') + '</button><button class="ghost" data-act="delete">Sil</button>' : '') + '</div>' +
    '<div class="stats">Yorum <b>' + p.stats.comment + '</b> · Butona basan <b>' + p.stats.click + '</b> · Linki alan <b>' + p.stats.link + '</b></div>' +
    '<div class="msg"></div></div></div>'
}

$('#list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]'); if (!btn) return
  const el = btn.closest('.card'), id = el.dataset.id, msg = el.querySelector('.msg')
  const keyword = el.querySelector('.kw').value, url = el.querySelector('.url').value
  const active = el.querySelector('.badge').classList.contains('on')
  btn.disabled = true
  try {
    if (btn.dataset.act === 'delete') await api('/campaigns/' + id, { method: 'DELETE' })
    else await api('/campaigns/' + id, { method: 'PUT', body: JSON.stringify({ keyword, url, active: btn.dataset.act === 'toggle' ? !active : true }) })
    await load()
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; btn.disabled = false }
})

$('#loginBtn').onclick = () => {
  token = $('#pw').value
  try { localStorage.setItem('adminToken', token) } catch {}
  load()
}
$('#pw').addEventListener('keydown', (e) => e.key === 'Enter' && $('#loginBtn').click())
$('#logout').onclick = () => { token = ''; try { localStorage.removeItem('adminToken') } catch {}; showLogin() }

token ? load() : showLogin()
</script>
</body>
</html>`
