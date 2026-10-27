// Kampanyalar KV'de tutulur: campaign:<mediaId> -> Campaign
// Buton başlıkları Instagram'da en fazla 20 karakter olabilir.
export interface Campaign {
  keyword: string
  url: string
  active: boolean
}

export const TEXTS = {
  commentReply: 'DM\'ini kontrol et 📩',
  intro: 'Selam! Rehber hazır 👇',
  success: 'İşte rehberin 🔥',
  followRequired: 'Link için beni takip etmelisin, istersen sonra çıkabilirsin 🙏',
}

export const BUTTONS = {
  sendLink: 'Linki gönder',
  followedSend: 'Takip ettim, gönder',
  open: 'Rehberi aç',
}

export const campaignKey = (mediaId: string) => `campaign:${mediaId}`

export async function getCampaign(kv: KVNamespace, mediaId: string): Promise<Campaign | null> {
  return kv.get<Campaign>(campaignKey(mediaId), 'json')
}
