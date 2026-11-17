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
4. **Export an AI-ready `.md` file.** Each cluster becomes a section of a spec
   (goal, requirements, open questions, tasks), ordered by when the group worked
   on it, with the history available as context. Hand the file to Claude Code,
   Cursor, or any other agent.

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
| Spec generation      | Deterministic clustering + Claude via DeepSpace AI routes          |
| UI                   | React 19, Tailwind v4, Base UI primitives in `src/components/ui`   |

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
