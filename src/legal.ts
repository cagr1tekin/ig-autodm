const UPDATED = '29 Eylül 2026'

const layout = (title: string, body: string) => `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  :root { --bg:#ffffff; --text:#1a1a1c; --muted:#6b6b73; --line:#e6e6ea }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b0b0c; --text:#f2f2f3; --muted:#8d8d95; --line:#2a2a2e } }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.65 system-ui,-apple-system,Segoe UI,sans-serif }
  main { max-width:680px; margin:0 auto; padding:48px 16px }
  h1 { font-size:28px; margin:0 0 4px } h2 { font-size:18px; margin:32px 0 8px }
  .muted { color:var(--muted); font-size:14px } hr { border:0; border-top:1px solid var(--line); margin:40px 0 }
  code { background:var(--line); padding:1px 6px; border-radius:6px }
</style>
</head>
<body><main>${body}</main></body>
</html>`

const privacy = layout('Gizlilik Politikası', `
<h1>Gizlilik Politikası</h1>
<p class="muted">Son güncelleme: ${UPDATED}</p>
<p>Bu hizmet, <b>@cagritek1n</b> Instagram hesabının paylaşımlarına belirli bir anahtar kelimeyle yorum yapan kişilere, talep ettikleri içeriğin bağlantısını Instagram Direkt Mesaj ile otomatik olarak gönderir.</p>

<h2>Topladığımız veriler</h2>
<ul>
  <li>Instagram'ın bize ilettiği, sayfa kapsamlı (page-scoped) Instagram kullanıcı kimliğin ve kullanıcı adın</li>
  <li>Hangi paylaşıma yorum yaptığın, mesajdaki butona bastığın ve bağlantıyı aldığın ile bunların zamanı</li>
  <li>Hesabı takip edip etmediğin bilgisi. Bu bilgi yalnızca butona bastığın anda sorgulanır, saklanmaz.</li>
</ul>
<p>Yorum ve mesaj içeriklerini saklamayız. Anahtar kelime kontrolü yapıldıktan sonra içerik atılır.</p>

<h2>Verileri nasıl kullanıyoruz</h2>
<p>Yalnızca bağlantıyı sana bir kez göndermek, aynı kişiye tekrar tekrar mesaj gitmesini engellemek ve paylaşım başına toplam sayıları (yorum, tıklama, gönderim) görmek için. Verileri satmayız, reklam için kullanmayız, üçüncü kişilerle paylaşmayız.</p>

<h2>Nerede saklanıyor</h2>
<p>Veriler Cloudflare Workers KV üzerinde saklanır. Instagram'la iletişim yalnızca Meta'nın resmi Instagram API'si üzerinden yapılır.</p>

<h2>Verilerini silme</h2>
<p>@cagritek1n hesabına Instagram DM'den <code>verilerimi sil</code> yazman yeterli. Sana ait tüm kayıtlar anında silinir ve onay mesajı gönderilir. Ayrıntılar: <a href="/data-deletion">Veri silme talimatları</a>.</p>

<h2>İletişim</h2>
<p>Sorular için Instagram'da <b>@cagritek1n</b> hesabına mesaj gönderebilirsin.</p>
`)

const dataDeletion = layout('Veri Silme Talimatları', `
<h1>Veri Silme Talimatları</h1>
<p class="muted">Son güncelleme: ${UPDATED}</p>
<p>Bu hizmetin senin hakkında tuttuğu tüm kayıtları (Instagram kullanıcı kimliğin, kullanıcı adın ve etkileşim zamanları) istediğin an silebilirsin:</p>
<ol>
  <li>Instagram'da <b>@cagritek1n</b> hesabına Direkt Mesaj gönder.</li>
  <li>Mesaja <code>verilerimi sil</code> yaz.</li>
  <li>Kayıtların anında silinir ve "Verilerin silindi ✅" onayı gelir.</li>
</ol>
<p>Otomatik silme çalışmazsa aynı hesaba mesaj atman yeterli. Talebin 30 gün içinde elle yerine getirilir.</p>
<hr>
<p class="muted"><a href="/privacy">Gizlilik Politikası</a></p>
`)

export const PAGES: Record<string, string> = {
  '/privacy': privacy,
  '/data-deletion': dataDeletion,
}
