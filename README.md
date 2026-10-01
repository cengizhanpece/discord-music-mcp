# discord-music-mcp

An [MCP](https://modelcontextprotocol.io) server that lets Claude (or any MCP client) play music in your Discord voice channel.

> "Play some lo-fi in the Lobby" → 🎶

It talks to [**Discord YouTube DJ**](https://github.com/YOUR_GITHUB_USERNAME/discord-youtube-dj), a self-hosted bot that runs on your computer. Install and set that up first.

📚 **Learning MCP?** This repo is also a commented, step-by-step tutorial (Turkish): [docs/TUTORIAL.tr.md](docs/TUTORIAL.tr.md).

## Setup

**Claude Code**

```bash
claude mcp add discord-music -- npx -y discord-music-mcp
```

**Claude Desktop** — add to `claude_desktop_config.json` (Windows: `%APPDATA%\Claude\`, macOS: `~/Library/Application Support/Claude/`), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "discord-music": {
      "command": "npx",
      "args": ["-y", "discord-music-mcp"]
    }
  }
}
```

If the bot uses a port other than `1231`, set `MUSIC_BOT_URL` (e.g. `"env": { "MUSIC_BOT_URL": "http://localhost:4000" }`).

The MCP server and the bot must run on the same computer: the bot only accepts connections from `127.0.0.1`.

## What it can do

| Tool | Description |
|---|---|
| `play_song` | Play a URL or the top YouTube result for a search. Optional `channel` (name or ID, partial names work) and `guild`. |
| `search_songs` | Search YouTube and list results without playing. |
| `list_voice_channels` | List servers and voice channels the bot can join. |
| `now_playing` | What's playing, and where. |
| `stop_music` | Stop and leave the voice channel. |

Also: resource `discord://voice-channels` and prompt `dj` ("pick something that fits a mood and play it").

## Development

```bash
npm install
npm test                                   # spawns the server with a tiny MCP client, lists everything
node scripts/test-client.js play "daft punk get lucky"
npm run inspect                            # MCP Inspector UI
```

Logs go to stderr — stdout is reserved for the JSON-RPC stream.

## License

MIT
