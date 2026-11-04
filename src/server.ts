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
  server.tool("add_memory", "Save a new memory. Skips exact duplicates (returns the existing one) and warns when the project key is not configured. Returns the saved memory without its text.", addMemorySchema.shape, handleAddMemory);
  server.tool("search_memories", "Search memories by keywords across text, tags and project. Any word can match (prefix match for 3+ chars, e.g. 'import' finds 'importing'; umlauts match plain letters); entries matching more words and tags rank first. Returns { total, has_more, memories } with a relevance score; long texts are truncated, use get_memory for the full text. Combine with project, tags, source and date filters.", searchMemoriesSchema.shape, handleSearchMemories);
  server.tool("list_memories", "List memories newest first, without a search query. Use for 'what was saved recently' or browsing one project, tag set, source or date range. Returns { total, has_more, memories }; page with offset.", listMemoriesSchema.shape, handleListMemories);
  server.tool("get_memory", "Get one memory by id with its full text", getMemorySchema.shape, handleGetMemory);
  server.tool("update_memory", "Update a memory: replace text or project, replace all tags, or add/remove single tags with add_tags/remove_tags", updateMemorySchema.shape, handleUpdateMemory);
  server.tool("delete_memory", "Delete a memory by id", deleteMemorySchema.shape, handleDeleteMemory);
  server.tool("list_projects", "List project keys with memory counts, including keys that only exist in the database (marked unconfigured)", listProjectsSchema.shape, handleListProjects);

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
