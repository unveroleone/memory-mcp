import { z } from "zod";
import { randomUUID } from "crypto";
import { insertMemory } from "../db.js";
import { detectProject, loadProjects } from "../projects.js";

// tags accepts array or JSON-encoded string — some MCP clients serialise arrays as strings
const tagsCoerce = z.union([
  z.array(z.string()),
  z.string().transform((s) => {
    try { const p = JSON.parse(s); return Array.isArray(p) ? p : [s]; } catch { return [s]; }
  }),
]).optional();

export const addMemorySchema = z.object({
  text: z.string().min(1),
  project: z.string().optional(),
  source: z.string().describe(
    "Identifier of the AI agent or tool writing this memory. Use your own name: 'claude-code', 'copilot', 'warp', 'cursor', 'gemini', 'chatgpt', or 'dashboard'. Always set this."
  ),
  tags: tagsCoerce.describe("Topic tags, e.g. ['architecture', 'auth', 'supabase']"),
  metadata: z.record(z.unknown()).optional(),
});

export async function handleAddMemory(input: z.infer<typeof addMemorySchema>) {
  const projects = loadProjects();
  const project = input.project ?? detectProject(input.text, projects) ?? undefined;

  const id = randomUUID();
  const memory = insertMemory({
    id,
    text: input.text,
    project,
    source: input.source,
    tags: input.tags,
    metadata: input.metadata as object | undefined,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ id: memory.id, project: memory.project, tags: memory.tags }),
      },
    ],
  };
}
