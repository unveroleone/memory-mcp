import { loadProjects } from "../projects.js";
import { countByProject } from "../db.js";

export const PROJECTS_URI = "memory://projects";

export async function handleProjectsResource() {
  const projects = loadProjects();
  const counts = countByProject();

  const data = Object.entries(projects).map(([key, def]) => ({
    key,
    description: def.description,
    keywords: def.keywords,
    count: counts[key] ?? 0,
  }));

  return {
    contents: [
      {
        uri: PROJECTS_URI,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
