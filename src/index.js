#!/usr/bin/env node
// ============================================================================
//  Discord Music Bot — MCP Server
// ----------------------------------------------------------------------------
//  Bir MCP server üç tür "yetenek" (capability) sunabilir:
//
//    1. TOOLS     → LLM'in ÇAĞIRABİLDİĞİ fonksiyonlar (yan etkisi olabilir).
//                   Örn: "şarkı çal", "botu durdur". Kararı model verir.
//    2. RESOURCES → Uygulamanın/kullanıcının OKUYABİLDİĞİ veriler (GET gibi).
//                   Örn: ses kanalları listesi. Genelde client bağlam olarak ekler.
//    3. PROMPTS   → Kullanıcının seçebildiği hazır şablonlar (slash command gibi).
//
//  Bu dosyada üçünden de örnek var. Asıl iş tool'larda.
// ============================================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { bot, BOT_URL } from './botClient.js';

// ÖNEMLİ: stdio transport'ta stdout, JSON-RPC mesajları için ayrılmıştır.
// console.log() kullanırsak protokolü bozarız! Log için her zaman stderr kullan.
const log = (...args) => console.error('[music-mcp]', ...args);

// ----------------------------------------------------------------------------
// 1) Server nesnesi. name/version, client'a "initialize" el sıkışmasında gider.
// ----------------------------------------------------------------------------
const server = new McpServer({
  name: 'discord-music-bot',
  version: '1.0.0'
});

// ----------------------------------------------------------------------------
// Yardımcılar
// ----------------------------------------------------------------------------

// Tool sonuçları "content" dizisi olarak döner. En yaygın tip "text".
// Model bu metni okur; o yüzden hem insan hem model için anlaşılır yazmak önemli.
const text = (t) => ({ content: [{ type: 'text', text: t }] });

// isError: true → tool çalıştı ama işlem başarısız oldu. Model bunu görüp
// kendini düzeltebilir (ör. kullanıcıya hangi kanalı kastettiğini sorar).
// Protokol hatası (exception) fırlatmak yerine bunu tercih ediyoruz.
const fail = (t) => ({ ...text(t), isError: true });

const fmtDuration = (s) =>
  s == null ? '?' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const isUrl = (s) => /^https?:\/\//i.test(s);

/**
 * Kullanıcının verdiği kanal ifadesini (ID ya da isim) gerçek bir ses kanalına çevirir.
 * Böylece kullanıcı "Lobby'de çal" diyebilir, ID ezberlemesine gerek kalmaz.
 */
async function resolveChannel(channel, guild) {
  const all = await bot.getVoiceChannels();
  const norm = (s) => s.toLocaleLowerCase('tr');

  let candidates = all;
  if (guild) {
    candidates = candidates.filter(
      (c) => c.guildId === guild || norm(c.guildName).includes(norm(guild))
    );
  }

  const byId = candidates.find((c) => c.channelId === channel);
  if (byId) return { match: byId };

  const exact = candidates.filter((c) => norm(c.channelName) === norm(channel));
  const partial = candidates.filter((c) => norm(c.channelName).includes(norm(channel)));
  const matches = exact.length ? exact : partial;

  if (matches.length === 1) return { match: matches[0] };
  return { matches };
}

const describeChannel = (c) => `${c.guildName} › 🔊 ${c.channelName} (guild: ${c.guildId}, kanal: ${c.channelId})`;

// ----------------------------------------------------------------------------
// 2) TOOLS
// ----------------------------------------------------------------------------
// registerTool(isim, { title, description, inputSchema, annotations }, handler)
//
//  - description: Modelin bu tool'u NE ZAMAN kullanacağına karar verdiği metin.
//                 Prompt mühendisliğinin en önemli kısmı burası.
//  - inputSchema: Zod ile tanımlanır, SDK bunu JSON Schema'ya çevirip client'a
//                 yollar. Gelen argümanlar da otomatik doğrulanır.
//  - annotations: Client'a ipuçları (salt-okunur mu, yıkıcı mı vb.). Client
//                 bunlara göre onay isteyip istemeyeceğine karar verebilir.
// ----------------------------------------------------------------------------

server.registerTool(
  'list_voice_channels',
  {
    title: 'Ses kanallarını listele',
    description:
      'Botun erişebildiği tüm Discord sunucularını ve ses kanallarını listeler. ' +
      'Kullanıcı bir kanaldan bahsettiğinde ve hangisi olduğu belirsizse kullan.',
    inputSchema: {
      guild: z.string().optional().describe('Sadece bu sunucunun kanallarını göster (isim ya da ID)')
    },
    annotations: { readOnlyHint: true }
  },
  async ({ guild }) => {
    let channels = await bot.getVoiceChannels();
    if (guild) {
      const g = guild.toLocaleLowerCase('tr');
      channels = channels.filter((c) => c.guildId === guild || c.guildName.toLocaleLowerCase('tr').includes(g));
    }
    if (!channels.length) return text('Hiç ses kanalı bulunamadı.');
    return text(channels.map(describeChannel).join('\n'));
  }
);

server.registerTool(
  'search_songs',
  {
    title: 'YouTube\'da şarkı ara',
    description:
      'YouTube\'da arama yapar ve sonuçları (başlık, kanal, süre, URL) döndürür. ' +
      'Bir şey ÇALMAZ. Kullanıcı seçenek görmek istediğinde ya da doğru versiyondan emin olmak ' +
      'istediğinde kullan; sonra play_song\'a seçilen URL\'yi ver.',
    inputSchema: {
      query: z.string().min(1).describe('Arama metni, ör. "tarkan kuzu kuzu"'),
      limit: z.number().int().min(1).max(10).default(5).describe('Kaç sonuç dönsün')
    },
    annotations: { readOnlyHint: true, openWorldHint: true }
  },
  async ({ query, limit }) => {
    const results = await bot.search(query, limit);
    if (!results.length) return fail(`"${query}" için sonuç bulunamadı.`);
    return text(
      results
        .map((r, i) => `${i + 1}. ${r.title} — ${r.channel ?? '?'} [${fmtDuration(r.duration)}]\n   ${r.url}`)
        .join('\n')
    );
  }
);

server.registerTool(
  'play_song',
  {
    title: 'Şarkı çal',
    description:
      'Discord ses kanalında bir şarkı çalmaya başlar (o an çalanı keser). ' +
      'Ya doğrudan bir URL (YouTube, SoundCloud vb.) ya da arama metni ver; arama metni verilirse ' +
      'ilk YouTube sonucu çalınır. channel verilmezse bot en son kullanılan kanalda çalar.',
    inputSchema: {
      song: z.string().min(1).describe('Şarkının URL\'si veya arama metni'),
      channel: z.string().optional().describe('Hedef ses kanalı: isim (kısmi olabilir) ya da kanal ID'),
      guild: z.string().optional().describe('Aynı isimde kanal birden fazla sunucuda varsa sunucu adı ya da ID')
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
  },
  async ({ song, channel, guild }) => {
    // a) Hedef kanalı çöz
    let target;
    if (channel) {
      const { match, matches } = await resolveChannel(channel, guild);
      if (!match) {
        return fail(
          matches.length
            ? `"${channel}" birden fazla kanalla eşleşti, hangisi?\n${matches.map(describeChannel).join('\n')}`
            : `"${channel}" adında bir ses kanalı bulunamadı. list_voice_channels ile kanallara bakabilirsin.`
        );
      }
      target = match;
    }

    // b) Çal. Arama metni verilirse bot kendisi arayıp ilk sonucu çalıyor.
    const result = await bot.play(song, target);
    if (!isUrl(song)) log(`"${song}" → ${result.title} (${result.url})`);
    const where = target ? ` → ${target.guildName} › ${target.channelName}` : '';
    return text(`▶️ Çalıyor: ${result.title}${where}\n${result.url}`);
  }
);

server.registerTool(
  'stop_music',
  {
    title: 'Müziği durdur',
    description: 'Çalan müziği durdurur ve botu ses kanalından çıkarır.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  },
  async () => {
    await bot.stop();
    return text('⏹️ Müzik durduruldu, bot kanaldan çıktı.');
  }
);

server.registerTool(
  'now_playing',
  {
    title: 'Şu an ne çalıyor?',
    description: 'Botun bağlı olduğu kanalı ve çalan şarkıyı gösterir.',
    inputSchema: {},
    annotations: { readOnlyHint: true }
  },
  async () => {
    const s = await bot.status();
    if (!s.connected || !s.nowPlaying) return text('Şu an hiçbir şey çalmıyor.');
    const ch = s.currentGuild;
    return text(
      `🎶 ${s.nowPlaying.title} [${fmtDuration(s.nowPlaying.duration)}]\n` +
        `${s.nowPlaying.url}\n` +
        `Kanal: ${ch.guildName ?? ch.id} › ${ch.channelName ?? ch.channelId} (durum: ${s.playerState})`
    );
  }
);

// ----------------------------------------------------------------------------
// 3) RESOURCES
// ----------------------------------------------------------------------------
// Resource'lar bir URI ile adreslenir. Client "resources/list" ile listeler,
// "resources/read" ile okur. Tool'dan farkı: model çağırmaz, uygulama/kullanıcı
// bağlama ekler (Claude Desktop'ta "+" menüsünden, Claude Code'da @ ile).
// ----------------------------------------------------------------------------
server.registerResource(
  'voice-channels',
  'discord://voice-channels',
  {
    title: 'Discord ses kanalları',
    description: 'Botun erişebildiği tüm ses kanalları (JSON)',
    mimeType: 'application/json'
  },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await bot.getVoiceChannels(), null, 2) }]
  })
);

// ----------------------------------------------------------------------------
// 4) PROMPTS
// ----------------------------------------------------------------------------
// Prompt = parametreli mesaj şablonu. Kullanıcı seçer (Claude Code'da
// /mcp__discord-music__dj gibi görünür), model bu mesajla konuşmaya başlar.
// ----------------------------------------------------------------------------
server.registerPrompt(
  'dj',
  {
    title: 'DJ modu',
    description: 'Bir ruh haline göre şarkı seçip Discord\'da çalar',
    argsSchema: {
      mood: z.string().describe('Ruh hali / tarz, ör. "sakin lo-fi", "90lar türkçe pop"'),
      channel: z.string().optional().describe('Hangi ses kanalında')
    }
  },
  ({ mood, channel }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            `DJ ol: "${mood}" havasına uygun bir şarkı seç. search_songs ile birkaç aday bul, ` +
            `en uygununu seçip play_song ile ${channel ? `"${channel}" kanalında` : 'mevcut kanalda'} çal. ` +
            `Neden o şarkıyı seçtiğini tek cümleyle söyle.`
        }
      }
    ]
  })
);

// ----------------------------------------------------------------------------
// 5) Transport'a bağlan
// ----------------------------------------------------------------------------
// stdio: Client (Claude Desktop / Claude Code) bu script'i alt süreç olarak
// başlatır, stdin'e JSON-RPC yazar, stdout'tan cevap okur. Ağ portu yok.
// (Alternatif: Streamable HTTP transport — uzak sunucular için.)
const transport = new StdioServerTransport();
await server.connect(transport);
log('ready, bot address:', BOT_URL);
