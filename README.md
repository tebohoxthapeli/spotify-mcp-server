# Spotify MCP Server

Control Spotify from AI assistants via the [Model Context Protocol](https://modelcontextprotocol.io).

## Features

- **Playback control** — play, pause, skip, seek, volume, shuffle, repeat
- **Playlist management** — create, update, delete, add/remove/reorder tracks
- **Auto token refresh** — seamlessly refreshes OAuth tokens on expiry
- **24 tools** — comprehensive coverage of Spotify's playback and playlist APIs

## Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)
- [Spotify Developer](https://developer.spotify.com/dashboard) account
- Spotify Premium (required for playback control)

## Setup

1. **Clone and install**

   ```bash
   git clone <repo-url>
   cd spotify-mcp-server
   bun install
   ```

2. **Create a Spotify app** at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)

   - Set the redirect URI to `http://127.0.0.1:8888/callback`

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Fill in `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` from your Spotify app.

4. **Authenticate**

   ```bash
   bun run auth
   ```

   This opens a browser for OAuth authorisation and saves the refresh token to `.env`.

## Usage

### Running the server

```bash
# Development (auto-reload)
bun run dev

# Production
bun run serve
```

### MCP client configuration

Add to your `.mcp.json` (or equivalent):

```json
{
  "mcpServers": {
    "spotify": {
      "command": "bun",
      "args": ["run", "--silent", "start"],
      "cwd": "/path/to/spotify-mcp-server"
    }
  }
}
```

## Tools Reference

### Playback (read)

| Tool                        | Description                                 |
| --------------------------- | ------------------------------------------- |
| `spotify_get_current_track` | Get currently playing track info            |
| `spotify_get_player_state`  | Get playback state (playing/paused/stopped) |
| `spotify_get_position`      | Get current playback position in seconds    |
| `spotify_get_volume`        | Get volume level (0–100)                    |
| `spotify_get_shuffle`       | Get shuffle state (true/false)              |
| `spotify_get_repeat`        | Get repeat mode (off/track/context)         |

### Playback (write)

| Tool                     | Description                  |
| ------------------------ | ---------------------------- |
| `spotify_play`           | Resume playback              |
| `spotify_pause`          | Pause playback               |
| `spotify_playpause`      | Toggle play/pause            |
| `spotify_next_track`     | Skip to next track           |
| `spotify_previous_track` | Skip to previous track       |
| `spotify_play_track`     | Play a specific track by URI |
| `spotify_set_position`   | Seek to position in seconds  |
| `spotify_set_volume`     | Set volume (0–100)           |
| `spotify_set_shuffle`    | Enable/disable shuffle       |
| `spotify_set_repeat`     | Enable/disable repeat        |

### Playlist (read)

| Tool                          | Description                               |
| ----------------------------- | ----------------------------------------- |
| `spotify_get_playlists`       | List current user's playlists (paginated) |
| `spotify_get_playlist_tracks` | Get tracks from a playlist (paginated)    |

### Playlist (write)

| Tool                      | Description                                 |
| ------------------------- | ------------------------------------------- |
| `spotify_create_playlist` | Create a new playlist                       |
| `spotify_delete_playlist` | Delete (unfollow) a playlist                |
| `spotify_add_tracks`      | Add tracks to a playlist                    |
| `spotify_remove_tracks`   | Remove tracks from a playlist               |
| `spotify_update_playlist` | Update playlist name/description/visibility |
| `spotify_reorder_tracks`  | Reorder tracks within a playlist            |

## Development

### Scripts

| Script                | Purpose                   |
| --------------------- | ------------------------- |
| `bun run dev`         | Start with auto-reload    |
| `bun run build`       | Compile TypeScript        |
| `bun run serve`       | Build and run             |
| `bun test`            | Run tests                 |
| `bun run biome-check` | Lint and format check     |
| `bun run type-check`  | TypeScript type checking  |
| `bun run super-check` | Lint + type-check + build |

### Project structure

```
src/
├── auth.ts              # OAuth authentication flow
├── env.ts               # Environment variable validation
├── index.ts             # Server entry point
├── schemas.ts           # Zod input schemas
├── spotify-client.ts    # Spotify API client with token refresh
├── types.ts             # Spotify API type definitions
├── utils.ts             # Shared utilities
└── tools/
    ├── playback-read.ts   # Playback read tools (6)
    ├── playback-write.ts  # Playback write tools (10)
    ├── playlist-read.ts   # Playlist read tools (2)
    └── playlist-write.ts  # Playlist write tools (6)
```

## Tech Stack

- **TypeScript** — strict mode
- **Bun** — runtime and test runner
- **MCP SDK** — `@modelcontextprotocol/sdk`
- **Zod** — input validation
- **Biome** — linting and formatting
