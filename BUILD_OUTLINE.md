# Co-Create Build Outline

## Concept in one line

A group call with a shared whiteboard, whose every change is versioned like
Git, and whose contents are grouped by **canvas proximity, arrows and time**
into a Markdown spec that AI agents can implement. The app itself uses **no
AI**: the spec is built deterministically from the board.

```
 Call + whiteboard ──▶ Version history ──▶ Sections ──▶ spec.md
 (LiveKit + canvas)    (saved snapshots)    (proximity,   (rule-based, same
                                             arrows, time)  board → same file)
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
| Agent access to specs    | Built-in record tools (`records.query`) over HTTP/MCP — see `src/ai/tools.ts`        |
| Guest boards             | Nothing from DeepSpace: `localStorage` in the browser (`useLocalBoard`)              |

Backend: `AppCanvasRoom` is already bound in `worker.ts` / `wrangler.toml`.

---

## Data model

```ts
// Canvas shape (DeepSpace CanvasShapeClient; we define `type` + `props`)
type ShapeType = 'sticky' | 'box' | 'text' | 'arrow'
props: {
  text?: string
  color?: 'white' | 'gray' | 'blue' | 'black'      // stickies
  from?: string; to?: string                         // arrows: shape ids
  route?: 'straight' | 'elbow' | 'curve'             // arrows
  bend?: { x: number; y: number }                    // arrows: handle offset
  originalCreatedAt?: string                         // set when a version restore re-adds a shape
}

// boards — one per whiteboard (shapes live in the CanvasRoom keyed by its id)
interface Board { title: string; ownerId: string }

// versions — the Git-style history: full snapshots (boards are small)
interface Version {
  boardId: string
  message: string          // auto: "Added 3 notes, moved 2" — or typed by the user
  authorName: string
  snapshot: CanvasShape[]  // JSON column
  shapeCount: number
}

// specs — Markdown published for agents
interface Spec { boardId: string; title: string; markdown: string }
```

Guest boards keep the same shapes and versions in `localStorage` instead.

### Why not real Git?

Running `isomorphic-git` in the browser is possible, but a canvas isn't text
files, merges of x/y positions are meaningless to Git, and we'd still need
storage for the repo. A log of board snapshots in a collection gives the same
user-facing features (history, diff, restore) with far less machinery.
Revisit only if users want to push a board into an actual repo.

---

## How a spec is produced (no AI)

Code: `src/spec/buildSpec.ts` (pure, unit-tested in `buildSpec.test.ts`).

1. **Sections.** Notes whose edges are within 60 px of each other are chained
   into one section (so a row of stickies is one group). Overlap counts, so
   drawing a box around notes groups them. Empty notes are ignored.
2. **Titles.** A section is titled by its text label, else its box, else the
   first line of its earliest note.
3. **Order.** Arrows between sections order the sections; arrows inside a
   section order its notes. Ties and arrow cycles fall back to creation time.
4. **Connections.** Every arrow is written under the note it starts from,
   linking across sections by anchor (`→ [2. Billing](#2-billing): Charge card`).
5. **Output.** Title, an overview table (sections, note counts, what each
   comes after), one `##` section per group, and a "Suggested order of work"
   checklist. Same board in → same file out.

Users steer the result by arranging the board: move notes together or apart,
draw a box around notes to force a group, add a text label to name it, draw
arrows to set order. The **Show sections** overlay previews the grouping.

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
- [x] Install `livekit-client`; "Join call" mints a token with
      `livekit/generate-token` (signed-in users only) and connects
- [x] Call rail beside the board: participant tiles, speaking highlight,
      mute, camera on/off, leave (audio-first; tiles grow to show video)
- [x] **Done when:** two users can talk while drawing on the same board —
      verified by `tests/call.spec.ts` (fake mic/camera in headless Chromium).

Code: `src/components/call/` (`useCall.ts`, `CallRail.tsx`). LiveKit is set
to `billing: 'user'` in `src/integrations.ts` — required so each person gets
their own LiveKit identity (token minting is free).

### Phase 3 — Version history
- [x] `versions` collection: full snapshots with an auto-written summary
      ("Added 2 notes, moved 1") — saved automatically 10 s after the last
      edit (only by clients that edited), or on demand with your own message
- [x] History panel: list versions, preview any version read-only, export it,
      restore it (shapes keep their ids, so arrows survive; unsaved changes
      are saved first, and the restore is itself a version)
- [x] Guest boards keep their history in `localStorage` (last 50 versions)
- [x] **Done when:** you can replay how a board evolved during a call —
      verified by `tests/history.spec.ts` (guest board and two users).

Code: `src/history/` (`diff.ts` pure + tested, `stores.ts`, `useVersioning.ts`,
`HistoryPanel.tsx`), `src/schemas/versions-schema.ts`. Sidebar tabs (Call /
History) in `src/components/board/BoardSidebar.tsx` keep the call connected
while you browse history.

### Phase 4 — Sections overlay
- [x] Pure grouping by proximity (`clusterByProximity`) with unit tests
- [x] **Sections** toggle outlines each group on the board with its
      number and title, computed by the same `buildSections` the export uses,
      and updates live as notes move
- [x] Merge / split / rename without extra UI: move notes together or apart,
      draw a box around notes to force a group, add a text label to name it
- [x] **Done when:** sections match what a person would draw circles around —
      `tests/try.spec.ts` checks two far-apart notes are two sections and
      become one when dragged together.

### Phase 5 — Spec export (no AI)
- [x] Rule-based Markdown builder (`src/spec/buildSpec.ts`) + tests
- [x] Export dialog: preview, copy, download `<board>.md` (cloud and guest)
- [ ] Publish a spec to the `specs` collection so agents can fetch it with the
      app's record tools (`npx deepspace agent invoke …`)
- **Done when:** a board turns into a spec an agent can act on unmodified.

### Extras built along the way
- [x] **Guest mode** (`/try`): one board saved only in this browser, no
      account, no calls, Markdown export works. Linked from every sign-in
      prompt and the landing page. Verified by `tests/try.spec.ts`.
- [x] **Arrow styles**: straight, elbow, curve. Select an arrow to switch its
      style or drag its handle to reshape it (curve passes through the
      handle; elbow handle slides the middle segment).

### Later
- Call transcription feeding the spec (what was *said* near each cluster)
- Spec diffing between commits ("what changed since last call")
- Templates per spec type (feature, bug, research)

---

## Decisions to make

1. **Version cadence** — built as the recommended default (auto-save on idle, plus
   manual saves). Easy to change if you'd rather save only by hand.
2. ~~**Call UI**~~ — decided: audio-first rail; video is opt-in per person.
3. **Board access:** anyone with the link vs. invited members only.
4. ~~**AI cost**~~ — no AI in the app. LiveKit token minting is free.
