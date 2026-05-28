# MCP Memory Server - Build Handoff

## What this is

A self-hosted persistent memory MCP server that runs on a Proxmox home server (LXC).
All AI clients with MCP support (Claude Code, Claude Desktop, GitHub Copilot, Cursor)
read and write to one shared SQLite database. This replaces per-client memory systems
with a single source of truth.

---

## Tech stack

- **Runtime:** Node.js 20+ (TypeScript)
- **MCP SDK:** `@modelcontextprotocol/sdk` (official)
- **Database:** SQLite via `better-sqlite3` + FTS5 virtual table
- **Vector search:** NOT in scope for this build. Schema is prepared for `sqlite-vec`
  but no embedding logic is implemented yet.
- **HTTP framework:** `express` (for Streamable HTTP transport)
- **Transport:** Streamable HTTP on `/mcp` + stdio subcommand

---

## Project structure

```
mcp-memory-server/
  src/
    index.ts          -- entry point: detects --stdio flag or starts HTTP server
    server.ts         -- MCP server definition, tool registration
    db.ts             -- SQLite setup, schema, all query functions
    projects.ts       -- loads and applies projects.json (auto-tag logic)
    tools/
      add.ts
      search.ts
      list.ts
      crud.ts         -- get, update, delete
      listProjects.ts
  projects.json       -- project config (see below)
  data/               -- gitignored; SQLite file lives here
  Dockerfile
  package.json
  tsconfig.json
```

---

## Database schema

```sql
CREATE TABLE IF NOT EXISTS memories (
  id          TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  project     TEXT,
  source      TEXT,
  text        TEXT NOT NULL,
  metadata    TEXT
);

-- FTS5 index over text and project for fast keyword search
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
  USING fts5(text, project, content='memories', content_rowid='rowid');

-- Keep FTS index in sync via triggers
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, text, project) VALUES (new.rowid, new.text, new.project);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, text, project) VALUES ('delete', old.rowid, old.text, old.project);
  INSERT INTO memories_fts(rowid, text, project) VALUES (new.rowid, new.text, new.project);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, text, project) VALUES ('delete', old.rowid, old.text, old.project);
END;

-- Placeholder table for future sqlite-vec embeddings (do not populate yet)
-- CREATE TABLE IF NOT EXISTS memories_vec (
--   rowid     INTEGER PRIMARY KEY,
--   embedding F32_BLOB(768)
-- );
```

`id` is a `crypto.randomUUID()`. `created_at` and `updated_at` are Unix timestamps
in milliseconds. `metadata` is a JSON string, nullable.

---

## MCP tools to implement

### `add_memory`

Input:
```ts
{
  text: string,        // required
  project?: string,    // optional: 'dailybite' | 'homelab' | etc.
  source?: string,     // optional: 'claude-code' | 'copilot' | 'cursor' etc.
  metadata?: object    // optional: arbitrary JSON
}
```

Behavior:
1. If `project` is not provided, run auto-detect against `projects.json` keywords.
2. Insert into `memories` table. FTS triggers handle the index.
3. Return the new memory's `id` and resolved `project`.

---

### `search_memories`

Input:
```ts
{
  query: string,
  project?: string,    // filter to one project
  source?: string,
  limit?: number,      // default 10, max 50
  since?: number       // Unix timestamp ms: only return entries newer than this
}
```

Behavior:
1. Run FTS5 query: `SELECT rowid, rank FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank`.
2. Join back to `memories` for full row data.
3. Apply `project`, `source`, `since` filters as WHERE clauses on the join.
4. Return results sorted by FTS rank (best match first).

FTS5 query escaping: wrap the input in double quotes to avoid syntax errors on
special characters. Strip quotes from the input before wrapping.

---

### `list_memories`

Input:
```ts
{
  project?: string,
  source?: string,
  limit?: number,    // default 20
  offset?: number    // default 0
}
```

Returns rows from `memories` sorted by `created_at DESC`. No FTS involved.

---

### `get_memory`

Input: `{ id: string }`
Returns the full row or a not-found error.

---

### `update_memory`

Input:
```ts
{
  id: string,
  text?: string,
  project?: string,
  metadata?: object
}
```

Updates the provided fields. Sets `updated_at` to `Date.now()`. FTS triggers
handle the index update automatically.

---

### `delete_memory`

Input: `{ id: string }`
Deletes the row. FTS triggers clean up the index.

---

### `list_projects`

No input.
Returns the contents of `projects.json` plus a memory count per project:
```ts
[
  {
    key: 'dailybite',
    description: 'DailyBite React Native app',
    keywords: [...],
    count: 42
  },
  ...
]
```

---

## projects.json

This file lives at the project root and is loaded at server startup.
Changes require a server restart (no hot reload needed).

```json
{
  "dailybite": {
    "keywords": ["dailybite", "migros", "combino", "snack", "expo", "supabase"],
    "description": "DailyBite React Native app"
  },
  "homelab": {
    "keywords": ["proxmox", "lxc", "homeserver", "n8n", "home assistant", "raspberry", "cloudflare", "selfhost"],
    "description": "Home Server and self-hosted infra"
  },
  "swisscom": {
    "keywords": ["nexcc", "iapc", "aws", "nex", "swisscom", "devops", "pipeline", "ci/cd"],
    "description": "Swisscom NexCC DevOps"
  },
  "aeternum": {
    "keywords": ["aeternum", "driveflow", "client", "dach", "portfolio"],
    "description": "Aeternum Software"
  },
  "bbzw": {
    "keywords": ["bbzw", "m426", "abu", "schule", "lesetagebuch", "efz", "lernziel"],
    "description": "BBZW Schule"
  }
}
```

Auto-tag logic in `projects.ts`:

```ts
export function detectProject(text: string, config: ProjectConfig): string | null {
  const lower = text.toLowerCase();
  for (const [key, def] of Object.entries(config)) {
    if (def.keywords.some(kw => lower.includes(kw))) {
      return key;
    }
  }
  return null;
}
```

First match wins. Order in `projects.json` is the priority order.

---

## Transport setup

### Streamable HTTP (primary)

Express app listening on `PORT` (default `3000`).
Mount the MCP Streamable HTTP handler at `POST /mcp` and `GET /mcp`.
Use `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`.

Auth: check `Authorization: Bearer <token>` header on every request.
Token is read from `MCP_TOKEN` environment variable.
Return HTTP 401 if missing or wrong. No token required if `MCP_TOKEN` is not set
(for local dev convenience).

### stdio (secondary)

If process is started with `--stdio` flag, use `StdioServerTransport` instead of HTTP.
This is for Copilot and local clients that prefer spawning the server as a subprocess.

Entry point pattern:
```ts
const useStdio = process.argv.includes('--stdio');
if (useStdio) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  startHttpServer();
}
```

---

## Environment variables

```
PORT=3000
MCP_TOKEN=<bearer token for HTTP auth>
DB_PATH=./data/memory.db
PROJECTS_PATH=./projects.json
```

---

## Dockerfile

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
COPY projects.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Build step: `tsc` outputs to `dist/`. Include `better-sqlite3` prebuilt binaries
for linux/x64 in the image (use `npm ci` with `--omit=dev` after compiling TS).

The `data/` directory must be a mounted volume: `-v /path/on/host/data:/app/data`.
This is where the SQLite file persists across container restarts.

---

## Deployment target

- **Host:** Proxmox, LXC unprivileged (Debian 12)
- **Resources:** 512 MB RAM, 1 vCPU, 4 GB disk
- **Public URL:** `https://memory.roadtofinal.ch/mcp` via Cloudflare Tunnel
  (same setup as `n8n.roadtofinal.ch`, cloudflared config already known)
- **Auth layers:**
  1. Cloudflare Access (Email OTP)
  2. Bearer token on the MCP server itself (`MCP_TOKEN`)

---

## Client config examples (for reference, not part of the build)

```json
// Claude Desktop / Claude Code / Cursor
{
  "mcpServers": {
    "personal-memory": {
      "url": "https://memory.roadtofinal.ch/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}

// Copilot / stdio fallback
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

## What is explicitly out of scope for this build

- Embeddings and vector search (sqlite-vec). Schema has a commented placeholder.
  A follow-up task will add `@xenova/transformers` in-process and populate
  `memories_vec`. No Ollama dependency.
- Multi-user support or auth beyond a single bearer token.
- A web UI or dashboard.
- Memory decay, deduplication, or merging logic.

---

## Build order

1. `db.ts`: schema creation, all query functions (insert, search via FTS5, list, get, update, delete, count per project).
2. `projects.ts`: load `projects.json`, `detectProject()`.
3. `tools/`: one file per tool, each exports a handler function and a tool definition object.
4. `server.ts`: create `McpServer`, register all tools.
5. `index.ts`: stdio vs HTTP branching, auth middleware, start.
6. `Dockerfile`: build and verify the container starts and responds to a test `add_memory` call.

Start with `add_memory` and `search_memories`. Verify they work end-to-end before
implementing the remaining tools.
