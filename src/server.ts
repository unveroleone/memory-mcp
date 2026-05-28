import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addMemorySchema, handleAddMemory } from "./tools/add.js";
import { searchMemoriesSchema, handleSearchMemories } from "./tools/search.js";
import { listMemoriesSchema, handleListMemories } from "./tools/list.js";
import {
  getMemorySchema, handleGetMemory,
  updateMemorySchema, handleUpdateMemory,
  deleteMemorySchema, handleDeleteMemory,
} from "./tools/crud.js";
import { listProjectsSchema, handleListProjects } from "./tools/listProjects.js";
import { ctxSchema, handleCtxPrompt } from "./prompts/ctx.js";
import { recallSchema, handleRecallPrompt } from "./prompts/recall.js";
import { addSchema, handleAddPrompt } from "./prompts/add.js";
import { PROJECTS_URI, handleProjectsResource } from "./resources/projects.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "memory-server",
    version: "1.0.0",
  });

  // Tools — model-controlled, AI decides when to call
  server.tool("add_memory", "Add a new memory entry", addMemorySchema.shape, handleAddMemory);
  server.tool("search_memories", "Search memories using full-text search", searchMemoriesSchema.shape, handleSearchMemories);
  server.tool("list_memories", "List memories with optional filters", listMemoriesSchema.shape, handleListMemories);
  server.tool("get_memory", "Get a memory by ID", getMemorySchema.shape, handleGetMemory);
  server.tool("update_memory", "Update an existing memory", updateMemorySchema.shape, handleUpdateMemory);
  server.tool("delete_memory", "Delete a memory by ID", deleteMemorySchema.shape, handleDeleteMemory);
  server.tool("list_projects", "List all configured projects with memory counts", listProjectsSchema.shape, handleListProjects);

  // Prompts — user-controlled workflow templates, cross-client (Copilot, Warp, Claude Code)
  server.prompt(
    "memory-ctx",
    "Load recent memories for a project as session context",
    ctxSchema,
    handleCtxPrompt
  );
  server.prompt(
    "memory-recall",
    "Search memories by keyword, scoped to a project",
    recallSchema,
    handleRecallPrompt
  );
  server.prompt(
    "memory-add",
    "Prepare a structured add_memory call with auto-detected project tagging",
    addSchema,
    handleAddPrompt
  );

  // Resources — application-controlled, read-only data any client can pull
  server.resource(
    "projects",
    PROJECTS_URI,
    { description: "All configured projects with keywords and memory counts", mimeType: "application/json" },
    handleProjectsResource
  );

  return server;
}
