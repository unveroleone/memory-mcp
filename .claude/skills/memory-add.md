# memory-add — Guided Memory Save

Save a structured, well-tagged memory to the server.

## Steps

1. **Resolve project config** (same as memory-ctx step 1)

   Read `.mcp.json` from cwd (walk up), fall back to `~/.claude/mcp.json`.
   Extract `project` and `source`.

2. **Determine what to save**

   If the user provided text directly (e.g. `/memory-add The auth token expires after 1h`), use it as-is.
   Otherwise, ask the user: "What should I remember?"

3. **Confirm project/source tagging**

   Before saving, show a one-line preview:
   ```
   Save: "<text>" → project: <key>, source: <source>
   ```
   If the project key is null, warn the user and ask if they want to save untagged or abort.

4. **Call add_memory**

   ```json
   {
     "text": "<confirmed text>",
     "project": "<key or omit if null>",
     "source": "<source>"
   }
   ```

5. **Confirm**

   Report the returned `id` and resolved `project`:
   ```
   Saved. id: <id>, project: <key>
   ```

## Writing good memory text

- Write in plain English, first-person where natural: "The DailyBite app uses Supabase for auth."
- Include enough context to be useful without re-reading the full conversation.
- Avoid vague entries like "discussed auth" — be specific: "JWT tokens expire after 1h; refresh handled in `useSession` hook."
- One fact per memory. Don't bundle unrelated things.
