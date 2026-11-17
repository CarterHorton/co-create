# Co-Create Build Outline

## Concept in one line

A group call with a shared whiteboard, whose every change is versioned like
Git, and whose contents are clustered by **canvas proximity + time** into a
Markdown spec that AI agents can implement.

```
 Call + whiteboard ──▶ Change history ──▶ Clustering ──▶ spec.md
 (LiveKit + canvas)    (commit log)       (space+time)   (AI-written, human-reviewed)
```

"Location" always means **x/y position on the canvas**. There is no GPS /
geolocation anywhere in this product.

---

## Building blocks DeepSpace already gives us

| Need                     | Use                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Real-time shared canvas  | `useCanvas(boardId)` → `shapes`, `addShape`, `moveShape`, `updateShape`, `undo/redo` |
| Shape timestamps/authors | Every `CanvasShapeClient` has `createdBy`, `createdAt`, `updatedAt`                  |
| Live cursors / viewports | `viewports` from `useCanvas`, presence hooks                                         |
| Audio/video call         | `integration.post('livekit/generate-token', { roomName })` + `livekit-client`        |
| Persistent data          | Collections in `src/schemas/` (RecordRoom, RBAC)                                     |
| AI calls                 | `src/ai/*` routes (Claude via the platform), background jobs for long runs           |

Backend: `AppCanvasRoom` is already bound in `worker.ts` / `wrangler.toml`.

---

## Data model

```ts
// Canvas shape (provided by DeepSpace; we define `type` + `props`)
type ShapeType = 'sticky' | 'box' | 'text' | 'arrow' | 'frame'
props: {
  text?: string
  color?: string
  from?: string; to?: string   // arrows: shape ids they connect
}

// boards collection — one per whiteboard / call
interface Board {
  id: string
  title: string
  canvasId: string        // passed to useCanvas
  callRoom: string        // LiveKit room name
  createdBy: string
  headCommitId?: string
}

// commits collection — the Git-style history
interface Commit {
  id: string
  boardId: string
  parentId?: string       // linear history first; branches later
  authorId: string
  createdAt: string
  message: string         // auto ("Added 3 notes near 'Auth'") or user-written
  ops: ShapeOp[]          // diff vs parent: add / update / move / delete
  snapshot?: CanvasShape[]// full state every N commits for fast checkout
}

// specs collection — generated exports
interface Spec {
  id: string
  boardId: string
  commitId: string        // exact board state the spec was built from
  markdown: string
  clusters: Cluster[]     // kept so the UI can highlight groups on the board
}
```

### Why not real Git?

Running `isomorphic-git` in the browser is possible, but a canvas isn't text
files, merges of x/y positions are meaningless to Git, and we'd still need
storage for the repo. A commit log of shape diffs in a collection gives the same
user-facing features (history, diff, restore, branch) with far less machinery.
Revisit only if users want to push a board into an actual repo.

---

## How a spec is produced

1. **Pick a commit** (default: HEAD at the end of the call).
2. **Cluster shapes** — deterministic, runs in the browser or a worker:
   - Spatial: single-linkage / DBSCAN on shape centers (ε ≈ 1.5× median shape
     size). Shapes inside a `frame` are always one cluster.
   - Temporal: split a spatial cluster when `createdAt` gaps exceed a threshold
     (e.g. 5 min) — same place, different conversation.
   - Edges: arrows connect clusters into a dependency graph.
3. **Order sections** by each cluster's earliest `createdAt` (the order the
   group discussed them), then by graph dependencies.
4. **Ask Claude to write the spec** from structured input (clusters, texts,
   edges, authors, timestamps, optionally the call transcript later). Fixed
   output template:

   ```md
   # <Board title>
   ## Context
   ## Goals
   ## <Cluster title>
   - Requirements …
   - Open questions …
   ## Tasks (ordered, with dependencies)
   ## Source
   board <id> @ commit <id>, generated <date>
   ```

5. **Human review → download / copy / expose via agent tool** (`specs.get`).

---

## Phases

Each phase ends with something usable.

### Phase 1 — Whiteboard (start here)
- [x] `boards` schema + board list on `/home` (create / open / delete)
- [x] `/board/:id` page with `useCanvas`: sticky notes, boxes, text, arrows,
      drag to move, resize, pan/zoom, multi-user cursors (PresenceRoom)
- [x] Apply DESIGN.md to the canvas chrome (toolbar, hard corners, mono UI)
- [x] **Done when:** two browser windows edit the same board live —
      verified by `tests/board.spec.ts` (run: `npx deepspace test run tests/board.spec.ts`).

Code: `src/components/board/` (`Whiteboard.tsx`, `useBoard.ts` for optimistic
local edits, `shapes.ts`), `src/pages/(app)/(protected)/board/[id].tsx`.

### Phase 2 — Group call
- [ ] Install `livekit-client`; "Join call" mints a token with
      `livekit/generate-token` (signed-in users only) and connects
- [ ] Participant tiles / mute in a side rail next to the board
- **Done when:** two users can talk while drawing on the same board.

### Phase 3 — Version history
- [ ] `commits` schema; auto-commit after N seconds of quiet or on demand
- [ ] History timeline: scrub to preview old states, diff highlight, restore
- [ ] (Later) branch from a commit to try an alternative layout
- **Done when:** you can replay how a board evolved during a call.

### Phase 4 — Clustering
- [ ] Pure function `clusterShapes(shapes, opts) → Cluster[]` with unit tests
- [ ] Overlay that outlines detected clusters on the board; let users merge /
      split / rename clusters before export
- **Done when:** clusters match what a person would draw circles around.

### Phase 5 — Spec export
- [ ] Server route that sends clusters to Claude and stores a `Spec`
- [ ] Preview + edit + download `.md`; copy-to-clipboard
- [ ] Expose `specs` through the app's agent tools so Claude Code can pull a
      spec directly (`npx deepspace agent invoke …`)
- **Done when:** a board turns into a spec an agent can act on unmodified.

### Later
- Call transcription feeding the spec (what was *said* near each cluster)
- Spec diffing between commits ("what changed since last call")
- Templates per spec type (feature, bug, research)

---

## Decisions to make

1. **Commit cadence:** auto-commit on idle (recommended) vs. explicit commit only.
2. **Call UI:** full video tiles vs. audio-first with small avatars (recommended
   to start: audio-first, it leaves room for the board).
3. **Board access:** anyone with the link vs. invited members only.
4. **Who pays for AI/LiveKit:** app owner credits (default) vs. per-user.
