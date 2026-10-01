// Müzik botunun yerel HTTP API'sini saran küçük istemci.
//
// MCP server'ın kendisi Discord'a bağlanmıyor; bu iş kullanıcının bilgisayarında çalışan
// Discord YouTube DJ botunda. MCP server sadece bir "çevirmen": LLM'den gelen tool
// çağrılarını bu HTTP isteklerine dönüştürüyor.

export const BOT_URL = (process.env.MUSIC_BOT_URL || 'http://localhost:1231').replace(/\/+$/, '');

async function request(path, body) {
  let res;
  try {
    res = await fetch(`${BOT_URL}${path}`, body === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error(
      `Discord YouTube DJ botuna ulaşılamadı (${BOT_URL}). Bot çalışıyor mu? ` +
      `Kurulu değilse: https://github.com/cengizhanpece/discord-youtube-dj`
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Bot ${res.status} döndürdü`);
  return data;
}

export const bot = {
  /** @returns {Promise<Array<{channelName, channelId, guildId, guildName}>>} */
  getVoiceChannels: () => request('/api/channels'),

  search: (query, limit = 5) => request(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  /** song: URL ya da arama metni (bot arama yapıp ilk sonucu çalar). */
  play: (song, target) => request('/api/play', { song, guildId: target?.guildId, channelId: target?.channelId }),

  stop: () => request('/api/stop', {}),

  status: () => request('/api/status')
};
