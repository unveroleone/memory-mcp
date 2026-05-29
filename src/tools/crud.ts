import { z } from "zod";
import { getMemory, updateMemory, deleteMemory } from "../db.js";

export const getMemorySchema = z.object({
  id: z.string(),
});

const tagsCoerce = z.union([
  z.array(z.string()),
  z.string().transform((s) => {
    try { const p = JSON.parse(s); return Array.isArray(p) ? p : [s]; } catch { return [s]; }
  }),
]).optional();

export const updateMemorySchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  project: z.string().optional(),
  tags: tagsCoerce.describe("Replace tags with this new list"),
  metadata: z.record(z.unknown()).optional(),
});

export const deleteMemorySchema = z.object({
  id: z.string(),
});

export async function handleGetMemory(input: z.infer<typeof getMemorySchema>) {
  const memory = getMemory(input.id);
  if (!memory) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: "Memory not found", id: input.id }) }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(memory) }],
  };
}

export async function handleUpdateMemory(input: z.infer<typeof updateMemorySchema>) {
  const updated = updateMemory({
    id: input.id,
    text: input.text,
    project: input.project,
    tags: input.tags,
    metadata: input.metadata as object | undefined,
  });

  if (!updated) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: "Memory not found", id: input.id }) }],
      isError: true,
    };
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify(updated) }],
  };
}

export async function handleDeleteMemory(input: z.infer<typeof deleteMemorySchema>) {
  const deleted = deleteMemory(input.id);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ deleted, id: input.id }) }],
  };
}
