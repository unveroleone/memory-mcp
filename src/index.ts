import express from "express";
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import {
  listMemories,
  countMemories,
  getMemory,
  insertMemory,
  updateMemory,
  deleteMemory,
  searchMemoriesWithCount,
  getProjectStats,
  type Memory as DbMemory,
} from "./db.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const MCP_TOKEN = process.env.MCP_TOKEN;

function checkAuth(req: express.Request, res: express.Response): boolean {
  if (!MCP_TOKEN) return true;
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${MCP_TOKEN}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function dbMemoryToApi(m: DbMemory) {
  return {
    id: m.id,
    project: m.project ?? "",
    content: m.text,
    tags: m.tags ? (JSON.parse(m.tags) as string[]) : [],
    source: m.source ?? "",
    created_at: new Date(m.created_at).toISOString(),
    updated_at: new Date(m.updated_at).toISOString(),
  };
}

async function startHttpServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // --- REST API for Dashboard ---

  app.get("/api/projects", (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const stats = getProjectStats();
      res.json({
        projects: stats.map((s) => ({
          name: s.name,
          count: s.count,
          tags: s.tags,
          last_updated: s.last_updated ? new Date(s.last_updated).toISOString() : null,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/api/memories", (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const project = req.query.project as string | undefined;
      const search = req.query.search as string | undefined;
      const tag = req.query.tags as string | undefined;
      const limit = Math.min(Number(req.query.limit ?? 30), 100);
      const offset = Number(req.query.offset ?? 0);

      if (search) {
        const { memories, total } = searchMemoriesWithCount({ query: search, project, tag, limit, offset });
        return res.json({ memories: memories.map(dbMemoryToApi), total });
      }

      const memories = listMemories({ project, tag, limit, offset });
      const total = countMemories({ project, tag });
      res.json({ memories: memories.map(dbMemoryToApi), total });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/api/memories/:id", (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const memory = getMemory(req.params.id);
      if (!memory) return res.status(404).json({ error: "Not found" });
      res.json(dbMemoryToApi(memory));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/memories", (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const { content, project, tags, source } = req.body as {
        content: string; project?: string; tags?: string[]; source?: string;
      };
      if (!content) return res.status(400).json({ error: "content is required" });
      const memory = insertMemory({
        id: randomUUID(),
        text: content,
        project: project ?? null,
        source: source ?? "dashboard",
        tags: tags ?? null,
      });
      res.status(201).json(dbMemoryToApi(memory));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.put("/api/memories/:id", (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const { content, project, tags } = req.body as {
        content?: string; project?: string; tags?: string[];
      };
      const updated = updateMemory({
        id: req.params.id,
        text: content,
        project,
        tags,
      });
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(dbMemoryToApi(updated));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete("/api/memories/:id", (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const deleted = deleteMemory(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- MCP Transport ---

  app.post("/mcp", async (req, res) => {
    if (!checkAuth(req, res)) return;
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    if (!checkAuth(req, res)) return;
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    if (!checkAuth(req, res)) return;
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  app.listen(PORT, () => {
    console.log(`MCP memory server listening on port ${PORT}`);
    if (!MCP_TOKEN) {
      console.warn("Warning: MCP_TOKEN is not set. Auth is disabled.");
    }
  });
}

async function startStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const useStdio = process.argv.includes("--stdio");
if (useStdio) {
  startStdio().catch(console.error);
} else {
  startHttpServer().catch(console.error);
}
