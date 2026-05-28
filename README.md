# memory-mcp

A self-hosted MCP memory server. Runs on a Proxmox LXC, stores everything in SQLite with FTS5 full-text search, and exposes a Streamable HTTP endpoint that any MCP-compatible client can connect to — Claude Code, GitHub Copilot, Warp, Cursor.

All clients share one database. No per-client memory silos.

---

## What it does

The server exposes 7 tools, 3 prompts, and 1 resource over the MCP protocol.

**Tools** (called by the AI automatically):

| Tool | Description |
|------|-------------|
| `add_memory` | Save a memory with optional project and source tags |
| `search_memories` | Full-text search with project/source/date filters |
| `list_memories` | List memories in reverse chronological order |
| `get_memory` | Fetch a single memory by ID |
| `update_memory` | Update text, project, or metadata |
| `delete_memory` | Delete a memory by ID |
| `list_projects` | List configured projects with memory counts |

**Prompts** (invocable by the user in any MCP client):

| Prompt | Args | Description |
|--------|------|-------------|
| `memory-ctx` | `project?` | Loads recent memories and injects them as session context |
| `memory-recall` | `query, project?, limit?` | Searches and returns formatted results |
| `memory-add` | `text, project?, source?` | Prepares a structured `add_memory` call with auto-detected project |

**Resources**:

| URI | Description |
|-----|-------------|
| `memory://projects` | Returns `projects.json` contents with live memory counts per project |

---

## Stack

- Node.js 20, TypeScript
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — official MCP SDK
- `better-sqlite3` with FTS5 virtual table for full-text search
- Express — Streamable HTTP transport on `/mcp`
- Docker + Docker Compose for deployment

---

## Project tagging

Memories can be tagged to a project (e.g. `dailybite`, `homelab`, `swisscom`). Projects and their auto-detection keywords are configured in `projects.json`. When `add_memory` is called without a project, the server scans the memory text against each project's keyword list and assigns the first match.

Edit `projects.json` to add or change projects. A server restart is required for changes to take effect.

---

## Deployment

Requires Docker and Docker Compose on the host.

```bash
git clone https://github.com/unveroleone/memory-mcp.git
cd memory-mcp
cp .env.example .env
```

Edit `.env` and set `MCP_TOKEN` to a strong secret. Then:

```bash
mkdir -p data
docker compose up -d --build
```

The server listens on port `3000`. The SQLite database is stored in `./data/memory.db` and persists across container restarts via a volume mount.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `MCP_TOKEN` | — | Bearer token for auth. If unset, auth is disabled |
| `DB_PATH` | `./data/memory.db` | Path to the SQLite database file |
| `PROJECTS_PATH` | `./projects.json` | Path to the projects config file |

---

## Connecting clients

All clients connect via the HTTP URL. Replace `YOUR_TOKEN` with the value set in `MCP_TOKEN`.

**Claude Code:**
```bash
claude mcp add --transport http personal-memory https://your-domain/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

**Copilot CLI** (`~/.copilot/mcp-config.json`):
```json
{
  "mcpServers": {
    "personal-memory": {
      "type": "http",
      "url": "https://your-domain/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

**Warp** — Settings → Agents → MCP Servers → Add:
```json
{
  "mcpServers": {
    "personal-memory": {
      "url": "https://your-domain/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

**stdio fallback** (for clients that spawn a subprocess):
```json
{
  "mcpServers": {
    "personal-memory": {
      "command": "node",
      "args": ["/path/to/dist/index.js", "--stdio"]
    }
  }
}
```

---

## Health check

```bash
curl https://your-domain/health
# {"status":"ok"}
```

---

## Per-project scoping

Create a `.mcp.json` file in any project directory to hint which memory project the AI should use when working there:

```json
{
  "project": "dailybite",
  "source": "claude-code"
}
```

Claude Code reads this file and passes the `project` argument automatically when invoking the memory prompts.

---

## What is out of scope

- Vector/semantic search. The schema has a placeholder for `sqlite-vec` embeddings but no embedding logic is implemented.
- Multi-user support. One bearer token, one database.
- A web UI.
- Memory decay or deduplication.
