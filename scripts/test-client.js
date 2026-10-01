// Minimal bir MCP CLIENT. Claude Desktop / Claude Code'un arka planda yaptığını taklit eder:
//   1. server'ı alt süreç olarak başlat (stdio)
//   2. initialize el sıkışması
//   3. tools/list, resources/list, prompts/list
//   4. bir tool çağır
//
// Kullanım:
//   node scripts/test-client.js                         → sadece listeler + kanalları gösterir
//   node scripts/test-client.js play "tarkan kuzu kuzu" → şarkı çalar
//   node scripts/test-client.js search "daft punk"
//   node scripts/test-client.js stop

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath, // node
  args: ['src/index.js'],
  // Dikkat: SDK, alt sürece varsayılan olarak sadece PATH gibi güvenli birkaç ortam değişkeni
  // aktarır. Claude Desktop da öyle; bu yüzden orada "env" alanı var. Biz hepsini aktarıyoruz.
  env: process.env,
  stderr: 'inherit' // server log'larını da görelim
});

const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(transport); // ← initialize burada oluyor

console.log('Server:', client.getServerVersion());

const { tools } = await client.listTools();
console.log('\n🔧 Tools:');
for (const t of tools) console.log(`  - ${t.name}: ${JSON.stringify(t.inputSchema.properties)}`);

const { resources } = await client.listResources();
console.log('\n📄 Resources:', resources.map((r) => r.uri));

const { prompts } = await client.listPrompts();
console.log('💬 Prompts:', prompts.map((p) => p.name));

const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.join(' ');
const call = {
  play: { name: 'play_song', arguments: { song: arg } },
  search: { name: 'search_songs', arguments: { query: arg } },
  stop: { name: 'stop_music', arguments: {} },
  status: { name: 'now_playing', arguments: {} }
}[cmd] ?? { name: 'list_voice_channels', arguments: {} };

console.log(`\n→ tools/call ${call.name}`, call.arguments);
const result = await client.callTool(call);
console.log(result.isError ? '❌' : '✅', result.content.map((c) => c.text).join('\n'));

await client.close();
