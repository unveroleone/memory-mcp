import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

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

async function startHttpServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

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
