# memory-recall — Scoped Memory Search

Fast, project-scoped memory search. Never queries the full database.

## Steps

1. **Resolve project config** (same as memory-ctx step 1)

   Read `.mcp.json` from cwd (walk up), fall back to `~/.claude/mcp.json`.
   Extract `project` and `source`.

2. **Build the query**

   If the user provided a query (e.g. `/memory-recall auth token`), use it directly.
   Otherwise, infer a query from the current task or last user message.

3. **Call search_memories**

   ```json
   {
     "query": "<query>",
     "project": "<key or omit if null>",
     "limit": 10
   }
   ```

   If `project` is null, warn the user that results are unfiltered across all projects.

4. **Present results**

   Format each result as:
   ```
   [<project>] <text>
     saved: <human-readable date> | id: <id>
   ```

   If no results found, say so clearly and suggest broadening the query or checking the project key in `.mcp.json`.

5. **Offer follow-up actions**

   After showing results, offer:
   - "Update a memory" → call `update_memory`
   - "Delete a memory" → call `delete_memory`
   - "See all memories for this project" → call `list_memories`

## Notes

- Always scope to `project` unless the user explicitly says "search everything" or "all projects".
- `since` filter: if the user says "recent" or "this week", convert to a Unix timestamp in ms and pass it.
- Use `limit: 5` for quick lookups, `limit: 20` when the user wants a broad view.
