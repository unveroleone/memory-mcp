import { z } from "zod";
import { searchMemories } from "../db.js";
import { DEFAULT_MAX_CHARS, filterSchema, intInput, textResult, toFilters, toToolMemory } from "./shared.js";

export const searchMemoriesSchema = z.object({
  query: z.string().min(1).max(500).describe("Keywords or a question, e.g. 'plex import sonarr'. Any word can match; more matching words rank higher."),
  ...filterSchema,
  limit: intInput(1, 50).optional().describe("Max results, default 10"),
  offset: intInput(0).optional().describe("Skip this many results for paging, default 0"),
  max_chars: intInput(100, 10000).optional().describe(`Truncate each text to this many characters, default ${DEFAULT_MAX_CHARS}. Use get_memory for the full text.`),
});

export async function handleSearchMemories(input: z.infer<typeof searchMemoriesSchema>) {
  const offset = input.offset ?? 0;
  const { memories, total } = searchMemories({
    query: input.query,
    ...toFilters(input),
    limit: input.limit ?? 10,
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
