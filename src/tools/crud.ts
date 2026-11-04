import { z } from "zod";
import { getMemory, updateMemory, deleteMemory } from "../db.js";
import { MAX_TEXT, tagsInput, textResult, toToolMemory, unknownProjectWarning } from "./shared.js";

export const getMemorySchema = z.object({
  id: z.string().describe("Memory id from search_memories or list_memories"),
});

export const updateMemorySchema = z.object({
  id: z.string(),
  text: z.string().trim().min(1).max(MAX_TEXT).optional().describe("Replace the text"),
  project: z.string().trim().min(1).optional().describe("Move to this project key"),
  tags: tagsInput.optional().describe("Replace all tags with this list"),
  add_tags: tagsInput.optional().describe("Add these tags, keeping the existing ones"),
  remove_tags: tagsInput.optional().describe("Remove these tags if present"),
  metadata: z.record(z.unknown()).optional(),
});

export const deleteMemorySchema = z.object({
  id: z.string(),
});

export async function handleGetMemory(input: z.infer<typeof getMemorySchema>) {
  const memory = getMemory(input.id);
  if (!memory) return textResult({ error: "Memory not found", id: input.id }, true);
  return textResult(toToolMemory(memory));
}

export async function handleUpdateMemory(input: z.infer<typeof updateMemorySchema>) {
  const updated = updateMemory({
    id: input.id,
    text: input.text,
    project: input.project,
    tags: input.tags,
    addTags: input.add_tags,
    removeTags: input.remove_tags,
    metadata: input.metadata as object | undefined,
  });

  if (!updated) return textResult({ error: "Memory not found", id: input.id }, true);

  const warning = input.project !== undefined ? unknownProjectWarning(updated.project) : undefined;
  return textResult({ memory: toToolMemory(updated), ...(warning ? { warning } : {}) });
}

export async function handleDeleteMemory(input: z.infer<typeof deleteMemorySchema>) {
  const deleted = deleteMemory(input.id);
  return textResult({ deleted, id: input.id });
}
