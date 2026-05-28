import { z } from "zod";
import { detectProject, loadProjects } from "../projects.js";

export const addSchema = {
  text: z.string().min(1).describe("The memory text to save"),
  project: z.string().optional().describe("Project key — auto-detected from text if omitted"),
  source: z.string().optional().describe("Client identifier, e.g. 'claude-code', 'copilot', 'cursor'"),
};

export async function handleAddPrompt(args: {
  text: string;
  project?: string;
  source?: string;
}) {
  const projects = loadProjects();
  const resolvedProject = args.project ?? detectProject(args.text, projects);
  const resolvedSource = args.source ?? "unknown";

  const preview = JSON.stringify(
    {
      text: args.text,
      project: resolvedProject ?? null,
      source: resolvedSource,
    },
    null,
    2
  );

  const warning =
    resolvedProject === null
      ? "\n\nWARNING: No project could be detected from the text and none was provided. The memory will be saved without a project tag. Consider adding a project key."
      : "";

  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `[Memory add]\n\nCall the add_memory tool with these parameters:\n\n${preview}${warning}`,
        },
      },
    ],
  };
}
