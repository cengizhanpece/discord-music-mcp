# Discord Music Bot — MCP Server (Tutorial)

Claude'a (veya MCP destekli herhangi bir LLM istemcisine) _"GGSoft'taki Lobby'de Tarkan'dan Kuzu Kuzu çal"_ dedirtip Discord'da çaldıran bir MCP server. Bir yandan da MCP'nin nasıl çalıştığını adım adım anlatıyor.

---

## 1. MCP nedir, kısaca

**Model Context Protocol**, bir LLM uygulamasının (Claude Desktop, Claude Code, Cursor…) dış dünyadaki araçlara **standart bir şekilde** bağlanmasını sağlayan protokol. "LLM'ler için USB" benzetmesi yapılır: bir kere MCP server yazarsın, her MCP client onu kullanabilir.

Üç rol var:

| Rol | Bu projede | Görevi |
|---|---|---|
| **Host** | Claude Desktop / Claude Code | Kullanıcının konuştuğu uygulama, LLM'i çalıştırır |
| **Client** | Host'un içindeki MCP istemcisi | Her server için bir bağlantı tutar |
| **Server** | `src/index.js` | Yetenekleri (tools/resources/prompts) sunar |

Mesajlar **JSON-RPC 2.0** formatında. Taşıma katmanı (transport) iki türlü olabilir:

- **stdio**: Host, server'ı alt süreç olarak başlatır; stdin/stdout üzerinden konuşur. Yerel araçlar için ideal. **Biz bunu kullanıyoruz.**
- **Streamable HTTP**: Server ayrı çalışan bir web servisi olur. Uzak/çok kullanıcılı senaryolar için.

## 2. Mimari

```
 ┌──────────────┐  JSON-RPC   ┌─────────────────┐   HTTP    ┌──────────────┐  voice  ┌─────────┐
 │ Claude (host)│ ◄─stdio───► │ MCP server      │ ────────► │ DJ bot       │ ──────► │ Discord │
 │              │             │ (bu proje)      │ :1231     │ (yerel PC)   │         │         │
 └──────────────┘             └─────────────────┘           └──────▲───────┘         └─────────┘
                                                                   │ HTTP :1231
                                                            ┌──────┴───────┐
                                                            │ Chrome ext.  │ (mevcut, değişmedi)
                                                            └──────────────┘
```

MCP server **Discord'a hiç bağlanmıyor**. Zaten çalışan botun HTTP API'sini kullanan ince bir "çevirmen" katmanı. Böylece:
- Bot ve extension olduğu gibi çalışmaya devam ediyor,
- MCP server her seferinde Discord'a login olmak zorunda kalmıyor (host server'ı sık sık başlatıp kapatabilir),
- Sorumluluklar ayrı: bot = ses, MCP = LLM arayüzü.

## 3. Bir konuşmanın arkasında neler oluyor?

Kullanıcı: _"Lobby'de kuzu kuzu çal"_

```jsonc
// 1) Bağlantı kurulurken (bir kere) — el sıkışma
→ {"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"...","clientInfo":{"name":"claude-code"},"capabilities":{}}}
← {"jsonrpc":"2.0","id":0,"result":{"serverInfo":{"name":"discord-music-bot","version":"1.0.0"},"capabilities":{"tools":{},"resources":{},"prompts":{}}}}

// 2) Client hangi tool'lar olduğunu öğrenir; bu liste (isim+description+schema) LLM'e verilir
→ {"jsonrpc":"2.0","id":1,"method":"tools/list"}
← {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"play_song","description":"Discord ses kanalında...","inputSchema":{...}}, ...]}}

// 3) LLM, description'lara bakıp play_song'u çağırmaya KARAR VERİR. Client çağrıyı iletir:
→ {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"play_song","arguments":{"song":"kuzu kuzu","channel":"Lobby"}}}

// 4) Server işini yapar (kanal çöz → YouTube'da ara → bota POST /api/play) ve sonucu döner
← {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"▶️ Çalıyor: TARKAN - Kuzu Kuzu ... → GGSoft gaming › Lobby"}]}}

// 5) LLM bu metni okuyup kullanıcıya cevap yazar.
```

Önemli çıkarım: **LLM kodu çalıştırmıyor, sadece hangi tool'u hangi argümanlarla çağıracağına karar veriyor.** O yüzden `description` alanları aslında birer prompt; iyi yazılmaları modelin doğru davranması için kritik.

## 4. Kodda gezinti

```
src/
  index.js       ← MCP server: tool/resource/prompt tanımları + stdio transport
  botClient.js   ← botun yerel HTTP API'si için küçük fetch sarmalayıcısı
scripts/
  test-client.js ← Claude'u taklit eden minimal MCP client (öğrenme ve test için)
```

### Tools (`src/index.js`)

| Tool | Ne yapar | Bot endpoint'i |
|---|---|---|
| `list_voice_channels` | Sunucu ve ses kanallarını listeler | `GET /api/channels` |
| `search_songs` | YouTube'da arar, **çalmaz** | `GET /api/search` |
| `play_song` | URL ya da arama metniyle çalar; kanal adı/ID ile hedef seçilir | `POST /api/play` |
| `stop_music` | Durdurur, kanaldan çıkar | `POST /api/stop` |
| `now_playing` | Çalan şarkı ve kanal | `GET /api/status` |

Dikkat edilecek tasarım kararları:

- **`inputSchema` Zod ile.** SDK bunu JSON Schema'ya çevirip `tools/list`'te yollar ve gelen argümanları doğrular. `.describe()` metinleri de modele gider.
- **`isError: true` vs exception.** Kanal adı birden fazla kanala uyuyorsa exception atmıyoruz; `isError: true` ile seçenekleri döndürüyoruz. Model bunu okuyup kullanıcıya "hangisi?" diye sorabiliyor. (Handler'da fırlatılan exception'ları da SDK otomatik olarak `isError` sonucuna çevirir.)
- **`annotations`** (`readOnlyHint`, `destructiveHint`…): client'a ipucu. Örneğin bir host salt-okunur tool'ları onay istemeden çalıştırabilir.
- **Kullanıcı dostu argümanlar.** Model kanal ID'si bilmek zorunda değil; `channel: "lobby"` yeterli, `resolveChannel()` gerisini hallediyor.
- **stdout'a log yazma!** stdio transport'ta stdout protokole ait. `console.log` JSON-RPC akışını bozar; bu yüzden `console.error` kullanılıyor.

### Resource: `discord://voice-channels`
Model tarafından "çağrılmaz"; kullanıcı/uygulama bağlama ekler. Claude Code'da `@` ile, Claude Desktop'ta `+` menüsünden seçilebilir. Tool ile resource arasındaki fark: tool = **eylem** (model karar verir), resource = **veri** (uygulama karar verir).

### Prompt: `dj`
Parametreli hazır şablon. Claude Code'da `/mcp__discord-music__dj "sakin lo-fi"` olarak görünür; model bu mesajla başlar ve kendisi `search_songs` → `play_song` zincirini kurar.

## 5. Bot tarafı

MCP server, [Discord YouTube DJ](https://github.com/YOUR_GITHUB_USERNAME/discord-youtube-dj) botunun yerel API'sini kullanıyor. Botun API'si kasıtlı olarak sadece `127.0.0.1`'i dinliyor ve tarayıcıdan gelen yabancı origin'leri reddediyor. Node.js'in `fetch`'i `Origin` header'ı göndermediği için MCP server'ın istekleri kabul ediliyor. Yani **MCP server ile bot aynı bilgisayarda çalışmalı.**

## 6. Kurulum & çalıştırma

Kullanıcı olarak hiçbir şey kurman gerekmiyor; `npx` paketi npm'den çekip çalıştırıyor. Geliştirme için:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/discord-music-mcp
cd discord-music-mcp
npm install
```

Bot farklı bir adreste/portta ise `MUSIC_BOT_URL` ortam değişkenini ver (varsayılan `http://localhost:1231`).

### a) Önce kendin test et — test client
```bash
npm test                                   # tools/resources/prompts listesi + kanallar
node scripts/test-client.js search "daft punk"
node scripts/test-client.js play "tarkan kuzu kuzu"
node scripts/test-client.js status
node scripts/test-client.js stop
```
`scripts/test-client.js`'i oku: bir host'un arka planda yaptığı her şey ~40 satır.

### b) MCP Inspector (görsel debug aracı)
```bash
npm run inspect
```
Tarayıcıda açılan arayüzde tool'ları elle çağırıp ham JSON-RPC mesajlarını görebilirsin. Öğrenmek için en faydalı araç bu.

### c) Claude Code'a ekle
```bash
claude mcp add discord-music -- npx -y discord-music-mcp
```
Yerel kopyayı denemek için: `claude mcp add discord-music-dev -- node /tam/yol/src/index.js`
Sonra Claude Code'da `/mcp` ile bağlantıyı kontrol et ve "Müzik Odası'nda lo-fi bir şey çal" de.

### d) Claude Desktop'a ekle
`%APPDATA%\Claude\claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "discord-music": {
      "command": "npx",
      "args": ["-y", "discord-music-mcp"],
      "env": { "MUSIC_BOT_URL": "http://localhost:1231" }
    }
  }
}
```
Claude Desktop'ı tamamen kapatıp aç.

> 💡 **Ders:** Host'lar server'ı başlatırken senin terminalindeki ortam değişkenlerini aktarmaz; sadece PATH gibi güvenli birkaç değişken geçer. Bir ayar gerekiyorsa config'deki `env` alanına yazılmalı. (Bunu bizzat yaşadık: `MUSIC_BOT_URL` aktarılmadığı için istekler yanlış bota gitti. `scripts/test-client.js`'teki `env: process.env` satırı bu yüzden var.)

## 7. Kendin geliştirmek için alıştırmalar

1. **Kuyruk (queue):** Botta `POST /queue` yap, MCP'ye `add_to_queue` ve `skip` tool'ları ekle. Description'ları "çal" ile "sıraya ekle" ayrımını modelin net anlayacağı şekilde yaz.
2. **`outputSchema` / `structuredContent`:** `search_songs` sonuçlarını metin yerine yapılandırılmış veri olarak da döndür (SDK `registerTool`'da `outputSchema` destekliyor).
3. **Resource template:** `discord://guilds/{guildId}/channels` gibi parametreli bir resource ekle (`ResourceTemplate` sınıfı).
4. **Bildirimler:** Şarkı değiştiğinde `server.sendResourceListChanged()` / logging bildirimleri ile client'ı haberdar et.
5. **Streamable HTTP transport:** Aynı server'ı HTTP üzerinden sun, böylece başka bir makinedeki Claude da bağlanabilsin. (Bu durumda kimlik doğrulama düşünmen gerekir!)

## Kaynaklar
- Spesifikasyon: https://modelcontextprotocol.io
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Inspector: https://github.com/modelcontextprotocol/inspector
