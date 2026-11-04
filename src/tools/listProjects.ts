import { z } from "zod";
import { loadProjects } from "../projects.js";
import { countByProject } from "../db.js";

export const listProjectsSchema = z.object({});

// Configured projects plus any project keys that only exist in the database,
// so memories saved under an unconfigured key stay discoverable.
export function projectOverview() {
  const projects = loadProjects();
  const counts = countByProject();

  const configured = Object.entries(projects).map(([key, def]) => ({
    key,
    description: def.description,
    keywords: def.keywords,
    count: counts[key] ?? 0,
  }));
  const unconfigured = Object.entries(counts)
    .filter(([key]) => !(key in projects))
    .map(([key, count]) => ({
      key,
      description: key === "untagged" ? "Memories saved without a project" : "Not in projects.json; only exists in the database",
      keywords: [] as string[],
      count,
      unconfigured: true,
    }));

  return [...configured, ...unconfigured];
}

export async function handleListProjects(_input: z.infer<typeof listProjectsSchema>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(projectOverview()) }],
  };
}
