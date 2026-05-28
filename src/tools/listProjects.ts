import { z } from "zod";
import { loadProjects } from "../projects.js";
import { countByProject } from "../db.js";

export const listProjectsSchema = z.object({});

export async function handleListProjects(_input: z.infer<typeof listProjectsSchema>) {
  const projects = loadProjects();
  const counts = countByProject();

  const result = Object.entries(projects).map(([key, def]) => ({
    key,
    description: def.description,
    keywords: def.keywords,
    count: counts[key] ?? 0,
  }));

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}
