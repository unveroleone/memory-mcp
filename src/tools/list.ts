import { z } from "zod";
import { listMemories } from "../db.js";

export const listMemoriesSchema = z.object({
  project: z.string().optional(),
  source: z.string().optional(),
  limit: z.number().int().min(1).optional(),
  offset: z.number().int().min(0).optional(),
});

export async function handleListMemories(input: z.infer<typeof listMemoriesSchema>) {
  const results = listMemories({
    project: input.project,
    source: input.source,
    limit: input.limit,
    offset: input.offset,
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
