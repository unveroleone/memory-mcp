import { z } from "zod";
import { MAX_TAGS, parseTags, type Memory, type ScoredMemory, type MemoryFilters } from "../db.js";
import { loadProjects } from "../projects.js";

export const MAX_TEXT = 10000;
const MAX_TAG_LENGTH = 40;
export const DEFAULT_MAX_CHARS = 800;

// Some MCP clients serialise arrays as JSON strings; accept both, plus a single plain string.
function stringList(item: z.ZodString) {
  return z.union([
    z.array(item),
    z.string().transform((s, ctx) => {
      let values: unknown = [s];
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) values = parsed;
      } catch { /* plain string */ }
      const result = z.array(item).safeParse(values);
      if (!result.success) {
        result.error.issues.forEach((issue) => ctx.addIssue(issue));
        return z.NEVER;
      }
      return result.data;
    }),
  ]);
}

const tagItem = z.string().trim().toLowerCase().min(1).max(MAX_TAG_LENGTH);

export const tagsInput = stringList(tagItem).pipe(z.array(z.string()).max(MAX_TAGS));

export const filterListInput = stringList(z.string().trim().min(1)).pipe(z.array(z.string()).max(20));

// Clients with a stale tool list sometimes send numbers as strings; accept both.
export function intInput(min: number, max?: number) {
  const base = z.coerce.number().int().min(min);
  return max === undefined ? base : base.max(max);
}

// Accepts ISO dates ("2026-10-01", "2026-10-01T12:00:00Z") or Unix timestamps in ms or seconds.
export const timeInput = z.union([z.number(), z.string()]).transform((value, ctx) => {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return n < 1e12 ? n * 1000 : n;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid date: ${value}. Use ISO like 2026-10-01 or a Unix timestamp.` });
    return z.NEVER;
  }
  return ms;
});

export const filterSchema = {
  project: z.string().optional().describe("Only this project key, e.g. 'homelab'. Call list_projects to see keys."),
  projects: filterListInput.optional().describe("Any of these project keys, e.g. ['homelab', 'homelab-mcp']"),
  source: z.string().optional().describe("Only memories written by this agent, e.g. 'claude-code', 'copilot', 'warp', 'hermes', 'dashboard'"),
  tag: z.string().optional().describe("Only memories with this tag, e.g. 'bug'"),
  tags: filterListInput.optional().describe("Filter by several tags, e.g. ['bug', 'plex']. See tag_mode."),
  tag_mode: z.enum(["any", "all"]).optional().describe("'any' (default): at least one tag matches. 'all': every tag must be present."),
  since: timeInput.optional().describe("Created at or after this time. ISO date like '2026-10-01' or Unix timestamp."),
  until: timeInput.optional().describe("Created at or before this time. ISO date like '2026-10-31T23:59:59Z' or Unix timestamp."),
};

export function toFilters(input: {
  project?: string;
  projects?: string[];
  source?: string;
  tag?: string;
  tags?: string[];
  tag_mode?: "any" | "all";
  since?: number;
  until?: number;
}): MemoryFilters {
  return {
    project: input.project,
    projects: input.projects,
    source: input.source,
    tag: input.tag,
    tags: input.tags,
    tagMode: input.tag_mode,
    since: input.since,
    until: input.until,
  };
}

export function toToolMemory(m: Memory | ScoredMemory, maxChars?: number) {
  const truncated = maxChars !== undefined && m.text.length > maxChars;
  const result: Record<string, unknown> = {
    id: m.id,
    project: m.project,
    source: m.source,
    tags: parseTags(m.tags),
    created_at: new Date(m.created_at).toISOString(),
    updated_at: new Date(m.updated_at).toISOString(),
    text: truncated ? m.text.slice(0, maxChars) + " ..." : m.text,
  };
  if (truncated) result.truncated = true;
  if ("score" in m) {
    result.score = Math.round(m.score * 100) / 100;
    if (truncated && m.snippet) result.match = m.snippet;
  }
  return result;
}

export function unknownProjectWarning(project: string | null | undefined): string | undefined {
  if (!project) return undefined;
  const known = Object.keys(loadProjects());
  if (known.includes(project)) return undefined;
  return `Project '${project}' is not in projects.json (configured: ${known.join(", ")}). Saved anyway; check for a typo.`;
}

export function textResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
  };
}
