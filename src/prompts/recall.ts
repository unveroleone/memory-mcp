import { z } from "zod";
import { searchMemories } from "../db.js";

export const recallSchema = {
  query: z.string().min(1).describe("What to search for"),
  project: z.string().optional().describe("Limit results to this project key"),
  tag: z.string().optional().describe("Narrow results to a specific tag, e.g. 'architecture'"),
  limit: z.number().int().min(1).max(20).optional().describe("Max results, default 10"),
};

export async function handleRecallPrompt(args: {
  query: string;
  project?: string;
  tag?: string;
  limit?: number;
}) {
  const results = searchMemories({
    query: args.query,
    project: args.project,
    tag: args.tag,
    limit: args.limit ?? 10,
  });

  const scopeParts = [args.project ? `project: ${args.project}` : "all projects"];
  if (args.tag) scopeParts.push(`tag: ${args.tag}`);
  const scope = scopeParts.join(", ");

  let body: string;
  if (results.length === 0) {
    body = `No memories found for query "${args.query}" in ${scope}.`;
  } else {
    const lines = results.map((m, i) => {
      const date = new Date(m.created_at).toISOString().slice(0, 10);
      const projectLabel = m.project ? `[${m.project}]` : "[untagged]";
      const tagsLabel = m.tags ? ` {${(JSON.parse(m.tags) as string[]).join(", ")}}` : "";
      return `${i + 1}. ${projectLabel}${tagsLabel} ${m.text}\n   saved: ${date} | id: ${m.id}`;
    });
    body = `Found ${results.length} result(s) for "${args.query}" in ${scope}:\n\n${lines.join("\n\n")}`;
  }

  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `[Memory recall]\n\n${body}\n\nYou can call update_memory or delete_memory with the id shown above.`,
        },
      },
    ],
  };
}
