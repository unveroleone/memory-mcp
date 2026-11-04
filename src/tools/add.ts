import { z } from "zod";
import { randomUUID } from "crypto";
import { findDuplicate, insertMemory } from "../db.js";
import { detectProject, loadProjects } from "../projects.js";
import { MAX_TEXT, tagsInput, textResult, toToolMemory, unknownProjectWarning } from "./shared.js";

export const addMemorySchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT).describe("The fact to remember: what happened, why, how it was verified, relevant paths or versions, with a date."),
  project: z.string().trim().min(1).optional().describe("Project key from list_projects. If omitted, it is detected from keywords in the text."),
  source: z.string().describe(
    "Identifier of the AI agent or tool writing this memory. Use your own name: 'claude-code', 'copilot', 'warp', 'cursor', 'gemini', 'chatgpt', 'hermes', or 'dashboard'. Always set this."
  ),
  tags: tagsInput.optional().describe("2 to 5 lowercase topic tags, e.g. ['architecture', 'auth', 'supabase']. Max 10."),
  metadata: z.record(z.unknown()).optional(),
});

export async function handleAddMemory(input: z.infer<typeof addMemorySchema>) {
  const projects = loadProjects();
  const project = input.project ?? detectProject(input.text, projects) ?? null;

  const duplicate = findDuplicate(input.text, project);
  if (duplicate) {
    const { text: _text, ...existing } = toToolMemory(duplicate);
    return textResult({ duplicate: true, message: "An identical memory already exists; nothing was added.", memory: existing });
  }

  const memory = insertMemory({
    id: randomUUID(),
    text: input.text,
    project,
    source: input.source,
    tags: input.tags,
    metadata: input.metadata as object | undefined,
  });

  const { text: _text, ...created } = toToolMemory(memory);
  const warning = unknownProjectWarning(memory.project);
  return textResult({ memory: created, ...(warning ? { warning } : {}) });
}
