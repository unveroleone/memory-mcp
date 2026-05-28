# memory-ctx — Session Memory Context

Load relevant memories for the current project at the start of a session.

## Steps

1. **Resolve project config**

   Read `.mcp.json` from the current working directory (walk up to root if not found in cwd).
   If still not found, read `~/.claude/mcp.json`.
   Extract:
   - `project` — the project key (may be null)
   - `source` — defaults to `"claude-code"` if not set

2. **Load recent memories**

   Call `list_memories` with:
   - `project` from config (omit param if null)
   - `limit: 10`

   Then call `search_memories` with a short query derived from the current task or working directory name, same `project` filter.

3. **Surface as context**

   Summarize the loaded memories in a short block at the top of your response:

   ```
   --- Memory context (project: <key>) ---
   - <summary of memory 1>
   - <summary of memory 2>
   ...
   ----------------------------------------
   ```

   If no memories exist for this project yet, say so briefly and continue.

4. **Announce the scope**

   Tell the user which project key is active and that all memory operations in this session will be scoped to it.

## Notes

- Never load memories from other projects unless the user explicitly asks.
- If `project` is null and no default exists, load unfiltered with `limit: 5` and warn the user that no project is configured.
- Suggest the user add a `.mcp.json` to their project root if none was found.
