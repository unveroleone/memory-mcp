import { z } from "zod";
import { searchMemories } from "../db.js";

export const searchMemoriesSchema = z.object({
  query: z.string().min(1),
  project: z.string().optional(),
  source: z.string().optional(),
  tag: z.string().optional().describe("Filter by a single tag, e.g. 'architecture'"),
  limit: z.number().int().min(1).max(50).optional(),
  since: z.number().optional(),
});

export async function handleSearchMemories(input: z.infer<typeof searchMemoriesSchema>) {
  const results = searchMemories({
    query: input.query,
    project: input.project,
    source: input.source,
    tag: input.tag,
    limit: input.limit,
    since: input.since,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(results),
      },
    ],
  };
}
