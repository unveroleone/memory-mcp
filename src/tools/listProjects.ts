import { z } from "zod";
import { loadProjects } from "../projects.js";
import { countByProject } from "../db.js";

export const listProjectsSchema = z.object({});

// Every project key in the database. A key in projects.json only adds a description
// and keywords.
export function projectOverview() {
  const projects = loadProjects();
  const counts = countByProject();

  const configured = Object.entries(projects).map(([key, def]) => ({
    key,
    description: def.description,
    keywords: def.keywords,
    count: counts[key] ?? 0,
  }));
  const others = Object.entries(counts)
    .filter(([key]) => !(key in projects))
    .map(([key, count]) => ({
      key,
      description: key === "untagged" ? "Memories saved without a project" : "",
      keywords: [] as string[],
      count,
    }));

  return [...configured, ...others];
}

export async function handleListProjects(_input: z.infer<typeof listProjectsSchema>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(projectOverview()) }],
  };
}
