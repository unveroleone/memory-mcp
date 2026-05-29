import { z } from "zod";
import { randomUUID } from "crypto";
import { insertMemory } from "../db.js";
import { detectProject, loadProjects } from "../projects.js";

export const addMemorySchema = z.object({
  text: z.string().min(1),
  project: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional().describe("Topic tags, e.g. ['architecture', 'auth', 'supabase']"),
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
