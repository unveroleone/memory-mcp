import { z } from "zod";
import { detectProject, loadProjects } from "../projects.js";

export const addSchema = {
  text: z.string().min(1).describe("The memory text to save"),
  project: z.string().optional().describe("Project key — auto-detected from text if omitted"),
  tags: z.array(z.string()).optional().describe("Topic tags, e.g. ['architecture', 'auth']"),
  source: z.string().optional().describe("Client identifier, e.g. 'claude-code', 'copilot', 'cursor'"),
};

export async function handleAddPrompt(args: {
  text: string;
  project?: string;
  tags?: string[];
  source?: string;
}) {
  const projects = loadProjects();
  const resolvedProject = args.project ?? detectProject(args.text, projects);
  const resolvedSource = args.source ?? "unknown";

  const preview = JSON.stringify(
    {
      text: args.text,
      project: resolvedProject ?? null,
      tags: args.tags ?? null,
      source: resolvedSource,
    },
    null,
    2
  );

  const warnings: string[] = [];

  if (resolvedProject === null) {
    warnings.push("No project could be detected from the text and none was provided. The memory will be saved without a project. Consider adding a project key.");
  }
  if (!args.tags || args.tags.length === 0) {
    warnings.push("No tags provided. Tags are essential for search and filtering. Add 2–5 relevant tags (e.g. 'architecture', 'auth', 'bug', 'infra', 'deployment') before calling add_memory.");
  }

  const warningBlock = warnings.length > 0
    ? "\n\n" + warnings.map((w) => `WARNING: ${w}`).join("\n")
    : "";

  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `[Memory add]\n\nCall the add_memory tool with these parameters:\n\n${preview}${warningBlock}`,
        },
      },
    ],
  };
}
