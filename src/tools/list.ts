import { z } from "zod";
import { listMemories } from "../db.js";
import { DEFAULT_MAX_CHARS, filterSchema, textResult, toFilters, toToolMemory } from "./shared.js";

export const listMemoriesSchema = z.object({
  ...filterSchema,
  limit: z.number().int().min(1).max(50).optional().describe("Max results, default 20"),
  offset: z.number().int().min(0).optional().describe("Skip this many results for paging, default 0"),
  max_chars: z.number().int().min(100).max(10000).optional().describe(`Truncate each text to this many characters, default ${DEFAULT_MAX_CHARS}. Use get_memory for the full text.`),
});

export async function handleListMemories(input: z.infer<typeof listMemoriesSchema>) {
  const offset = input.offset ?? 0;
  const { memories, total } = listMemories({
    ...toFilters(input),
    limit: input.limit ?? 20,
    offset,
  });
  const maxChars = input.max_chars ?? DEFAULT_MAX_CHARS;

  return textResult({
    total,
    offset,
    returned: memories.length,
    has_more: offset + memories.length < total,
    memories: memories.map((m) => toToolMemory(m, maxChars)),
  });
}
