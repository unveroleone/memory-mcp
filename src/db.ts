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

  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
    USING fts5(text, project, content='memories', content_rowid='rowid');

  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, text, project) VALUES (new.rowid, new.text, new.project);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, text, project) VALUES ('delete', old.rowid, old.text, old.project);
    INSERT INTO memories_fts(rowid, text, project) VALUES (new.rowid, new.text, new.project);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, text, project) VALUES ('delete', old.rowid, old.text, old.project);
  END;
`);

// Migrate existing databases that predate the tags column
const existingCols = (db.pragma("table_info(memories)") as { name: string }[]).map((c) => c.name);
if (!existingCols.includes("tags")) {
  db.exec(`ALTER TABLE memories ADD COLUMN tags TEXT DEFAULT NULL`);
}

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

export function searchMemories(params: {
  query: string;
  project?: string;
  source?: string;
  tag?: string;
  limit?: number;
  since?: number;
}): Memory[] {
  const limit = Math.min(params.limit ?? 10, 50);
  const safeQuery = `"${params.query.replace(/"/g, "")}"`;

  let sql = `
    SELECT m.*
    FROM memories_fts f
    JOIN memories m ON m.rowid = f.rowid
    WHERE memories_fts MATCH ?
  `;
  const bindings: (string | number)[] = [safeQuery];

  if (params.project) {
    sql += ` AND m.project = ?`;
    bindings.push(params.project);
  }
  if (params.source) {
    sql += ` AND m.source = ?`;
    bindings.push(params.source);
  }
  if (params.tag) {
    sql += ` AND EXISTS (SELECT 1 FROM json_each(m.tags) WHERE value = ?)`;
    bindings.push(params.tag);
  }
  if (params.since !== undefined) {
    sql += ` AND m.created_at > ?`;
    bindings.push(params.since);
  }

  sql += ` ORDER BY f.rank LIMIT ?`;
  bindings.push(limit);

  return db.prepare(sql).all(...bindings) as Memory[];
}

export function listMemories(params: {
  project?: string;
  source?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}): Memory[] {
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  let sql = `SELECT * FROM memories WHERE 1=1`;
  const bindings: (string | number)[] = [];

  if (params.project) {
    sql += ` AND project = ?`;
    bindings.push(params.project);
  }
  if (params.source) {
    sql += ` AND source = ?`;
    bindings.push(params.source);
  }
  if (params.tag) {
    sql += ` AND EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)`;
    bindings.push(params.tag);
  }

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  bindings.push(limit, offset);

  return db.prepare(sql).all(...bindings) as Memory[];
}

export function getMemory(id: string): Memory | null {
  return db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id) as Memory | null;
}

export function updateMemory(params: {
  id: string;
  text?: string;
  project?: string;
  tags?: string[];
  metadata?: object;
}): Memory | null {
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
  if (params.tags !== undefined) {
    updates.push("tags = ?");
    bindings.push(tagsToJson(params.tags));
  }
  if (params.metadata !== undefined) {
    updates.push("metadata = ?");
    bindings.push(JSON.stringify(params.metadata));
  }

  bindings.push(params.id);
  db.prepare(`UPDATE memories SET ${updates.join(", ")} WHERE id = ?`).run(...bindings);

  return getMemory(params.id);
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
