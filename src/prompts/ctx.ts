import { z } from "zod";
import { listMemories } from "../db.js";

export const ctxSchema = {
  project: z.string().optional().describe("Project key to scope the context (e.g. 'dailybite', 'homelab')"),
};

export async function handleCtxPrompt(args: { project?: string }) {
  const memories = listMemories({ project: args.project, limit: 15 });

  const scope = args.project ? `project: ${args.project}` : "all projects (no project filter)";

  let body: string;
  if (memories.length === 0) {
    body = `No memories found for ${scope}. This is a fresh context.`;
  } else {
    const lines = memories.map((m) => {
      const date = new Date(m.created_at).toISOString().slice(0, 10);
      const tag = m.project ? `[${m.project}]` : "[untagged]";
      return `- ${tag} ${m.text}  (${date}, id: ${m.id})`;
    });
    body = `Recent memories for ${scope}:\n\n${lines.join("\n")}`;
  }

  const instruction = args.project
    ? `\n\nAll memory tool calls in this session should use project="${args.project}" unless the user says otherwise.`
    : `\n\nNo project is scoped. Add a .mcp.json file to your project root with {"project":"<key>"} to auto-scope memory operations.`;

  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `[Memory context loaded]\n\n${body}${instruction}`,
        },
      },
    ],
  };
}
