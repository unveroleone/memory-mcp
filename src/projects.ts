import fs from "fs";
import path from "path";

export interface ProjectDef {
  keywords: string[];
  description: string;
}

export type ProjectConfig = Record<string, ProjectDef>;

const PROJECTS_PATH = process.env.PROJECTS_PATH ?? "./projects.json";

export function loadProjects(): ProjectConfig {
  const resolved = path.resolve(PROJECTS_PATH);
  const raw = fs.readFileSync(resolved, "utf-8");
  return JSON.parse(raw) as ProjectConfig;
}

export function detectProject(text: string, config: ProjectConfig): string | null {
  const lower = text.toLowerCase();
  for (const [key, def] of Object.entries(config)) {
    if (def.keywords.some((kw) => lower.includes(kw))) {
      return key;
    }
  }
  return null;
}
