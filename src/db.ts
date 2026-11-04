import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH ?? "./data/memory.db";

const dir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id          TEXT PRIMARY KEY,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    project     TEXT,
    source      TEXT,
    text        TEXT NOT NULL,
    tags        TEXT,
    metadata    TEXT
  );
`);

// Migrate existing databases that predate the tags column
const existingCols = (db.pragma("table_info(memories)") as { name: string }[]).map((c) => c.name);
if (!existingCols.includes("tags")) {
  db.exec(`ALTER TABLE memories ADD COLUMN tags TEXT DEFAULT NULL`);
}

// Schema version 1: the FTS index covers text, project and tags (the raw JSON string,
// which the tokenizer splits into words) and folds diacritics so "uber" finds "über".
// The index is external content, so dropping and rebuilding it never touches memories.
const SCHEMA_VERSION = 1;
if ((db.pragma("user_version", { simple: true }) as number) < SCHEMA_VERSION) {
  db.transaction(() => {
    db.exec(`
      DROP TRIGGER IF EXISTS memories_ai;
      DROP TRIGGER IF EXISTS memories_au;
      DROP TRIGGER IF EXISTS memories_ad;
      DROP TABLE IF EXISTS memories_fts;

      CREATE VIRTUAL TABLE memories_fts USING fts5(
        text, project, tags,
        content='memories', content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );
      INSERT INTO memories_fts(memories_fts) VALUES ('rebuild');

      CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, text, project, tags) VALUES (new.rowid, new.text, new.project, new.tags);
      END;

      CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, text, project, tags) VALUES ('delete', old.rowid, old.text, old.project, old.tags);
        INSERT INTO memories_fts(rowid, text, project, tags) VALUES (new.rowid, new.text, new.project, new.tags);
      END;

      CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, text, project, tags) VALUES ('delete', old.rowid, old.text, old.project, old.tags);
      END;
    `);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
}

export const MAX_TAGS = 10;

export interface Memory {
  id: string;
  created_at: number;
  updated_at: number;
  project: string | null;
  source: string | null;
  text: string;
  tags: string | null;
  metadata: string | null;
}

export interface ScoredMemory extends Memory {
  score: number;
  snippet: string;
}

export function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function tagsToJson(tags?: string[] | null): string | null {
  return tags && tags.length > 0 ? JSON.stringify(tags) : null;
}

export function insertMemory(params: {
  id: string;
  text: string;
  project?: string | null;
  source?: string | null;
  tags?: string[] | null;
  metadata?: object | null;
}): Memory {
  const now = Date.now();
  const meta = params.metadata ? JSON.stringify(params.metadata) : null;
  const tags = tagsToJson(params.tags);

  db.prepare(`
    INSERT INTO memories (id, created_at, updated_at, project, source, text, tags, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(params.id, now, now, params.project ?? null, params.source ?? null, params.text, tags, meta);

  return {
    id: params.id,
    created_at: now,
    updated_at: now,
    project: params.project ?? null,
    source: params.source ?? null,
    text: params.text,
    tags,
    metadata: meta,
  };
}

export function findDuplicate(text: string, project: string | null): Memory | null {
  return (db.prepare(`SELECT * FROM memories WHERE text = ? AND project IS ? LIMIT 1`)
    .get(text, project) as Memory | undefined) ?? null;
}

// Turns free text into an FTS5 query: every word is a quoted term, words of 3+ chars
// also match longer forms (prefix), and terms are OR-ed so bm25 ranks entries that
// match more of the words first. Returns null when no searchable word remains.
export function buildFtsQuery(query: string): string | null {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((word) => word.length >= 2);
  const unique = [...new Set(words)].slice(0, 16);
  if (unique.length === 0) return null;
  return unique.map((word) => (word.length >= 3 ? `"${word}"*` : `"${word}"`)).join(" OR ");
}

export interface MemoryFilters {
  project?: string;
  projects?: string[];
  source?: string;
  tag?: string;
  tags?: string[];
  tagMode?: "any" | "all";
  since?: number;
  until?: number;
}

// Builds the shared WHERE clauses for search and list. `alias` is the memories table alias.
function buildFilters(filters: MemoryFilters, alias: string): { sql: string; bindings: (string | number)[] } {
  const col = (name: string) => (alias ? `${alias}.${name}` : name);
  let sql = "";
  const bindings: (string | number)[] = [];

  const projects = [...(filters.project ? [filters.project] : []), ...(filters.projects ?? [])];
  if (projects.length > 0) {
    sql += ` AND ${col("project")} IN (${projects.map(() => "?").join(", ")})`;
    bindings.push(...projects);
  }
  if (filters.source) {
    sql += ` AND ${col("source")} = ?`;
    bindings.push(filters.source);
  }
  const tags = [...(filters.tag ? [filters.tag] : []), ...(filters.tags ?? [])];
  if (tags.length > 0) {
    if (filters.tagMode === "all") {
      for (const tag of tags) {
        sql += ` AND EXISTS (SELECT 1 FROM json_each(${col("tags")}) WHERE value = ?)`;
        bindings.push(tag);
      }
    } else {
      sql += ` AND EXISTS (SELECT 1 FROM json_each(${col("tags")}) WHERE value IN (${tags.map(() => "?").join(", ")}))`;
      bindings.push(...tags);
    }
  }
  if (filters.since !== undefined) {
    sql += ` AND ${col("created_at")} >= ?`;
    bindings.push(filters.since);
  }
  if (filters.until !== undefined) {
    sql += ` AND ${col("created_at")} <= ?`;
    bindings.push(filters.until);
  }
  return { sql, bindings };
}

// Column weights for bm25: text, project, tags. Tags are curated keywords, so they weigh most.
const BM25 = "bm25(memories_fts, 1.0, 0.5, 3.0)";

export function searchMemories(params: MemoryFilters & {
  query: string;
  limit?: number;
  offset?: number;
}): { memories: ScoredMemory[]; total: number } {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const safeQuery = buildFtsQuery(params.query);
  if (!safeQuery) return { memories: [], total: 0 };

  const filters = buildFilters(params, "m");
  const from = `
    FROM memories_fts
    JOIN memories m ON m.rowid = memories_fts.rowid
    WHERE memories_fts MATCH ?${filters.sql}
  `;
  const bindings = [safeQuery, ...filters.bindings];

  const total = (db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...bindings) as { n: number }).n;
  const rows = db.prepare(`
    SELECT m.*,
      -${BM25} AS score,
      snippet(memories_fts, 0, '', '', ' ... ', 40) AS snippet
    ${from}
    ORDER BY ${BM25}
    LIMIT ? OFFSET ?
  `).all(...bindings, limit, offset) as ScoredMemory[];

  return { memories: rows, total };
}

export function listMemories(params: MemoryFilters & {
  limit?: number;
  offset?: number;
}): { memories: Memory[]; total: number } {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const filters = buildFilters(params, "");
  const where = `WHERE 1=1${filters.sql}`;

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM memories ${where}`).get(...filters.bindings) as { n: number }).n;
  const memories = db.prepare(`SELECT * FROM memories ${where} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`)
    .all(...filters.bindings, limit, offset) as Memory[];

  return { memories, total };
}

export function getMemory(id: string): Memory | null {
  return (db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id) as Memory | undefined) ?? null;
}

export function updateMemory(params: {
  id: string;
  text?: string;
  project?: string;
  tags?: string[];
  addTags?: string[];
  removeTags?: string[];
  metadata?: object;
}): Memory | null {
  return db.transaction(() => {
    const existing = getMemory(params.id);
    if (!existing) return null;

    const updates: string[] = ["updated_at = ?"];
    const bindings: (string | number | null)[] = [Date.now()];

    if (params.text !== undefined) {
      updates.push("text = ?");
      bindings.push(params.text);
    }
    if (params.project !== undefined) {
      updates.push("project = ?");
      bindings.push(params.project);
    }
    if (params.tags !== undefined || params.addTags || params.removeTags) {
      let tags = params.tags ?? parseTags(existing.tags);
      if (params.addTags) tags = [...tags, ...params.addTags];
      if (params.removeTags) {
        const remove = new Set(params.removeTags);
        tags = tags.filter((tag) => !remove.has(tag));
      }
      updates.push("tags = ?");
      bindings.push(tagsToJson([...new Set(tags)].slice(0, MAX_TAGS)));
    }
    if (params.metadata !== undefined) {
      updates.push("metadata = ?");
      bindings.push(JSON.stringify(params.metadata));
    }

    bindings.push(params.id);
    db.prepare(`UPDATE memories SET ${updates.join(", ")} WHERE id = ?`).run(...bindings);

    return getMemory(params.id);
  })();
}

export function deleteMemory(id: string): boolean {
  const result = db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function countByProject(): Record<string, number> {
  const rows = db.prepare(
    `SELECT project, COUNT(*) as count FROM memories GROUP BY project`
  ).all() as { project: string | null; count: number }[];

  return Object.fromEntries(rows.map((r) => [r.project ?? "untagged", r.count]));
}

export interface ProjectStat {
  name: string;
  count: number;
  tags: string[];
  last_updated: number | null;
}

export function getProjectStats(): ProjectStat[] {
  const rows = db.prepare(`
    SELECT
      project AS name,
      COUNT(*) AS count,
      MAX(updated_at) AS last_updated,
      GROUP_CONCAT(tags) AS all_tags
    FROM memories
    WHERE project IS NOT NULL
    GROUP BY project
    ORDER BY last_updated DESC
  `).all() as { name: string; count: number; last_updated: number | null; all_tags: string | null }[];

  return rows.map((r) => {
    const tagSet = new Set<string>();
    if (r.all_tags) {
      for (const chunk of r.all_tags.split(",")) {
        try {
          const parsed = JSON.parse(chunk);
          if (Array.isArray(parsed)) parsed.forEach((t: string) => tagSet.add(t));
        } catch { /* skip */ }
      }
    }
    return { name: r.name, count: r.count, tags: [...tagSet].slice(0, 20), last_updated: r.last_updated };
  });
}

export interface StatsData {
  total: number;
  by_source: { source: string; count: number }[];
  by_day: { date: string; count: number }[];
  top_tags: { tag: string; count: number }[];
}

export function getStats(): StatsData {
  const total = (db.prepare(`SELECT COUNT(*) as n FROM memories`).get() as { n: number }).n;

  const by_source = db.prepare(`
    SELECT COALESCE(source, 'unknown') as source, COUNT(*) as count
    FROM memories
    GROUP BY source
    ORDER BY count DESC
  `).all() as { source: string; count: number }[];

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const by_day = db.prepare(`
    SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as count
    FROM memories
    WHERE created_at > ?
    GROUP BY date
    ORDER BY date ASC
  `).all(thirtyDaysAgo) as { date: string; count: number }[];

  const top_tags = db.prepare(`
    SELECT j.value as tag, COUNT(*) as count
    FROM memories m, json_each(m.tags) j
    WHERE m.tags IS NOT NULL
    GROUP BY j.value
    ORDER BY count DESC
    LIMIT 15
  `).all() as { tag: string; count: number }[];

  return { total, by_source, by_day, top_tags };
}
