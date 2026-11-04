import { projectOverview } from "../tools/listProjects.js";

export const PROJECTS_URI = "memory://projects";

export async function handleProjectsResource() {
  return {
    contents: [
      {
        uri: PROJECTS_URI,
        mimeType: "application/json",
        text: JSON.stringify(projectOverview(), null, 2),
      },
    ],
  };
}
