# Co-Create

> Whiteboard with your team on a live call. Co-Create turns what you drew into a
> Markdown spec an AI agent can build from.

## The idea

1. **A group call with a shared whiteboard.** Everyone in the call sees and
   edits the same canvas in real time: sticky notes, boxes, arrows, text.
2. **Every change is versioned, like Git.** Edits are recorded as a history of
   commits (who changed what, and when), so you can scrub back through how the
   idea evolved, branch off an alternative, or restore an earlier state.
3. **Time + proximity become structure.** Elements placed close together on the
   board, and elements created around the same moment in the call, are almost
   always part of the same thought. Co-Create clusters them by **spatial
   proximity** (where they sit on the canvas) and **temporal proximity** (when
   they were created / edited), and uses arrows as explicit relationships.
4. **Export an AI-ready `.md` file — built without AI.** Each group of nearby
   notes becomes a section; arrows set the order of sections and of notes, and
   creation time breaks ties. Same board in, same file out. Hand the file to
   Claude Code, Cursor, or any other agent.

> "Location" in this project always means **position on the canvas**, not the
> participants' physical/GPS location.

## Status

Early scaffold. What exists today:

- DeepSpace app scaffold (auth, records, Durable Objects, AI tool routes).
- Landing page with the Co-Create theme (`src/pages/index.tsx`, `src/themes.css`).
- Boards list (`/home`) and the collaborative whiteboard (`/board/:id`):
  stickies, boxes, text, arrows, pan/zoom, live cursors.
- Group call beside each board (LiveKit): join/leave, mute, camera, speaking
  indicator.
- Arrow styles (straight / elbow / curve) with a drag handle to reshape them.
- Box-select (left-drag), Shift-click, move and delete many shapes at once;
  middle mouse or Space+drag to pan.
- Named sections: select notes and assign them to a section such as
  "Authentication"; the export groups them under that heading.
- **Export .md** on every board: preview, copy, download. **Sections**
  outlines the groups the export will use, live as you move notes.
- Version history: auto-saved versions with a summary of what changed,
  manual saves with a message, preview, export, and restore any version.
- Guest mode at `/try`: try the whiteboard without an account; everything is
  saved only in your browser and there are no calls.

See [BUILD_OUTLINE.md](./BUILD_OUTLINE.md) for the build plan and
[DESIGN.md](./DESIGN.md) for the visual design system.

## Stack

| Concern              | Tool                                                              |
| -------------------- | ----------------------------------------------------------------- |
| App framework / host | [DeepSpace](https://docs.deep.space) on Cloudflare Workers         |
| Shared whiteboard    | DeepSpace `useCanvas` + `CanvasRoom` Durable Object               |
| Who's here / cursors | DeepSpace presence (`useCanvas` viewports, presence hooks)         |
| Group audio/video    | LiveKit via DeepSpace's `livekit/*` integration + `livekit-client` |
| Version history      | A `commits` collection of canvas diffs/snapshots (Git-style log)   |
| Spec generation      | Rule-based, in the browser: `src/spec/buildSpec.ts` (no AI)        |
| Guest boards         | `localStorage` only (`/try`): no account, no calls                 |
| UI                   | React 19, Tailwind v4, Base UI primitives in `src/components/ui`   |

## Keyboard shortcuts

Hover any toolbar button to see its shortcut. "Ctrl" is ⌘ on a Mac.

| Key | Action | Key | Action |
|---|---|---|---|
| `V` | Select tool | `1` / `2` / `3` | Straight / elbow / curve arrows |
| `N` | Sticky note tool | `G` | Show / hide sections |
| `B` | Box tool | `E` | Export .md |
| `T` | Text tool | `+` / `-` / `0` | Zoom in / out / reset |
| `A` | Arrow tool | `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Del` | Delete selection | `Ctrl+A` | Select all |
| `Enter` | Edit selected note (Enter again to finish, Shift+Enter for a new line) | `Space`+drag / middle mouse | Pan |

## Handing a board to an agent

1. On a board, click **Export .md** → **Download**, or **Publish for agents**.
2. A coding agent (Claude Code, Codex, …) logged in with the DeepSpace CLI can
   then pull it directly:

```bash
npx deepspace agent invoke co-create specs_list --json
npx deepspace agent invoke co-create spec_get --input '{"boardId":"<board id>"}' --json
```

The board id is the last part of the board's URL. Guest boards (`/try`) can
only download — they never reach the server.

## Getting started

Prerequisites: Node.js 22.15+ (or 24 / 26) and npm 11.6+.

```bash
npm install
npx deepspace auth login
npm run dev            # = npx deepspace dev start (Vite + Miniflare)
```

Useful commands:

| Command              | What it does                                   |
| -------------------- | ---------------------------------------------- |
| `npm run dev`        | Local dev server                               |
| `npm run validate`   | Typecheck + unit tests                         |
| `npm run lint`       | ESLint                                         |
| `npm test`           | Playwright suites via `deepspace test run`     |
| `npm run deploy`     | Deploy to `co-create.app.space`                |
| `npx deepspace add --list` | Optional features (e.g. `canvas`, `ai-chat`) |

## Project layout

```
src/
  pages/            file-based routes (index.tsx = static landing,
                    (app)/ = signed-in app with DeepSpace providers)
  components/ui/    Base UI component kit
  schemas/          collection schemas (add commits/boards here)
  ai/               AI tools + chat routes
  server/           HTTP / action / realtime routes
  cron.ts, jobs.ts  scheduled + background work
worker.ts           Worker entry + Durable Object classes
wrangler.toml       Cloudflare config (app id, DO bindings)
```

## Docs

- DeepSpace: <https://docs.deep.space/llms.txt> (append `.md` to any page)
  - Canvas: <https://docs.deep.space/guides/canvas.md>
  - LiveKit rooms: <https://docs.deep.space/guides/livekit.md>
  - AI chat: <https://docs.deep.space/guides/ai-chat.md>
- [AGENTS.md](./AGENTS.md) — instructions for coding agents working in this repo.
