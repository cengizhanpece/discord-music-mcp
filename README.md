# discord-music-mcp

An [MCP](https://modelcontextprotocol.io) server that lets Claude (or any MCP client) play music in your Discord voice channel.

> "Play some lo-fi in the Lobby" → 🎶

📚 **Learning MCP?** This repo is also a commented, step-by-step tutorial (Turkish): [docs/TUTORIAL.tr.md](docs/TUTORIAL.tr.md).

---

## How it relates to Discord YouTube DJ

This repo is **not a Discord bot**. It's a small adapter in front of [**Discord YouTube DJ**](https://github.com/cengizhanpece/discord-youtube-dj), the self-hosted bot that does the actual work.

```
 ┌──────────────────┐  stdio (JSON-RPC)  ┌──────────────────┐  HTTP 127.0.0.1:1231  ┌──────────────────────┐        ┌─────────┐
 │ Claude Desktop / │ ─────────────────► │ discord-music-mcp│ ────────────────────► │ Discord YouTube DJ   │ ─────► │ Discord │
 │ Claude Code      │ ◄───────────────── │ (this repo)      │ ◄──────────────────── │ bot (other repo)     │  voice │         │
 └──────────────────┘                    └──────────────────┘                       └──────────────────────┘        └─────────┘
```

- Claude starts this server as a child process when it needs it. You don't run it yourself.
- This server turns tool calls (`play_song`, `stop_music`, …) into requests to the bot's local API.
- The bot holds the Discord token and joins voice channels. **This repo never sees or needs your Discord token.**
- Because the bot only accepts connections from `127.0.0.1`, **this server must run on the same computer as the bot.**

| | [discord-youtube-dj](https://github.com/cengizhanpece/discord-youtube-dj) | discord-music-mcp (this repo) |
|---|---|---|
| Talks to Discord | ✅ | ❌ |
| Needs the bot token | ✅ (entered once in its dashboard) | ❌ |
| Runs | all the time (starts with Windows) | only while Claude uses it |
| Required | ✅ | optional |

---

## What you need

| Item | Needed? | Secret? | Where you get it |
|---|---|---|---|
| [Discord YouTube DJ](https://github.com/cengizhanpece/discord-youtube-dj#setup) installed, **set up**, and running | ✅ | — | Follow its README. The bot must be invited to a server, and the dashboard at <http://localhost:1231> should show "Online". |
| [Node.js](https://nodejs.org) 20+ | ✅ | — | nodejs.org. The Windows installer of the bot bundles its own Node, but this repo needs a normal install. |
| [git](https://git-scm.com) | ✅ | — | git-scm.com (or download this repo as a ZIP) |
| An MCP client | ✅ | — | [Claude Desktop](https://claude.ai/download), [Claude Code](https://docs.claude.com/en/docs/claude-code), or any other MCP client |
| Bot address | only if not default | no | `http://localhost:1231` by default. Set `MUSIC_BOT_URL` only if you changed the bot's port. |

**Not needed:** no Discord token, no client secret, no API keys, no server or channel IDs. You refer to channels by name ("Lobby"). Channel IDs also work: enable Discord **Settings → Advanced → Developer Mode**, then right-click a channel → **Copy Channel ID**.

---

## Setup

### 1. Get the code

```bash
git clone https://github.com/cengizhanpece/discord-music-mcp
cd discord-music-mcp
npm install
```

Note the full path of `src/index.js`. You'll need it below, e.g. `C:\Users\you\discord-music-mcp\src\index.js` or `/home/you/discord-music-mcp/src/index.js`.

### 2. Check that it can reach the bot

```bash
npm test
```

You should see the list of tools followed by your voice channels. If you see *"Could not reach the Discord YouTube DJ bot"*, start the bot first.

### 3. Connect it to your MCP client

**Claude Code:**

```bash
claude mcp add discord-music -- node "C:\full\path\to\discord-music-mcp\src\index.js"
```

Then run `/mcp` inside Claude Code to confirm it's connected.

**Claude Desktop:** open **Settings → Developer → Edit Config** (this opens `claude_desktop_config.json`) and add:

```json
{
  "mcpServers": {
    "discord-music": {
      "command": "node",
      "args": ["C:\\full\\path\\to\\discord-music-mcp\\src\\index.js"]
    }
  }
}
```

On Windows, write the path with double backslashes (`\\`) as shown. Fully quit Claude Desktop (including the tray icon) and reopen it.

**Non-default bot port:** if you changed the bot's port, add the address to the config. MCP clients don't pass your terminal's environment variables to the server, so it has to go in the config:

```bash
claude mcp add discord-music -e MUSIC_BOT_URL=http://localhost:4000 -- node "C:\full\path\to\discord-music-mcp\src\index.js"
```

```json
"discord-music": {
  "command": "node",
  "args": ["C:\\full\\path\\to\\discord-music-mcp\\src\\index.js"],
  "env": { "MUSIC_BOT_URL": "http://localhost:4000" }
}
```

### 4. Try it

> *"Which voice channels can you play in?"*
> *"Play Daft Punk – Get Lucky in the Lobby."*
> *"Search for three versions of Kuzu Kuzu and let me pick."*
> *"What's playing?"* / *"Stop the music."*

### Updating

```bash
cd discord-music-mcp
git pull
npm install
```

Restart Claude Desktop, or run `/mcp` → reconnect in Claude Code.

---

## What it can do

| Tool | Description |
|---|---|
| `play_song` | Play a URL or the top YouTube result for a search. Optional `channel` (name or ID; partial names work) and `guild`. If a name matches several channels, it asks which one. |
| `search_songs` | Search YouTube and list results without playing. |
| `list_voice_channels` | List servers and voice channels the bot can join. |
| `now_playing` | What's playing, and where. |
| `stop_music` | Stop and leave the voice channel. |

Also: resource `discord://voice-channels` and prompt `dj` ("pick something that fits a mood and play it").

## Troubleshooting

| Symptom | Fix |
|---|---|
| *Could not reach the Discord YouTube DJ bot* | Start the bot (Start menu → **Discord YouTube DJ**). Check that <http://localhost:1231> opens. |
| *The bot is not connected to Discord yet* | Finish the bot's setup in its dashboard (token + invite). |
| 🔒 channel / *"The bot can't play in …"* | The bot has no access to that private channel. See [Private voice channels](https://github.com/cengizhanpece/discord-youtube-dj#private-hidden-voice-channels). |
| *No voice channel selected* | Name a channel in your request, or pick one in the bot's dashboard. |
| Server doesn't show up in Claude | Check the path to `src/index.js`. Run `node "<path>"` yourself: it should print `[music-mcp] …ready` and wait. Press Ctrl+C to exit. |
| Wrong port / 404 errors | Set `MUSIC_BOT_URL` in the MCP config (see above). Environment variables from your shell are not passed through. |

## Development

```bash
node scripts/test-client.js search "daft punk"     # a ~40-line MCP client, see how a host talks to the server
node scripts/test-client.js play "daft punk get lucky"
npm run inspect                                     # MCP Inspector UI
```

Logs go to stderr. stdout is reserved for the JSON-RPC stream.

## License

MIT
