# Co-Create Build Outline

## Executive Summary

Co-Create is a **collaborative whiteboard platform** built on DeepSpace that transforms visual designs into structured Markdown specifications for AI agents to implement. The system consolidates collaborative sessions based on time and location, outputting ready-to-use documentation files.

---

## Core Concept Flow

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│  Collaborative │ → │  Session     │ → │  Consolidation   │ → │  Markdown    │
│   Whiteboard  │    │  Recording   │    │  Engine         │    │  Generator   │
└─────────────┘    └──────────────┘    └─────────────────┘    └──────────────┘
       ↑                    ↑                      ↑                  ↑
   Real-time sync      Timestamp +            Time/location     AI-ready spec
                      location data           analysis          for implementation
```

---

## Component Architecture

### 1. Canvas Whiteboard (Frontend)

**Purpose**: Collaborative diagramming surface

**Key Features to Build**:
- Infinite canvas with pan/zoom controls
- Shape primitives (rectangles, circles, arrows, text boxes)
- Connection lines between elements
- Layer management (bring forward/send back)
- Multi-user cursor tracking
- Undo/redo history via Yjs operations

**Technical Implementation**:
```typescript
// src/components/CanvasWhiteboard.tsx
- Canvas container with HTML5 drag-drop
- Element rendering (SVG/CSS-based)
- Yjs-based state synchronization
- Touch/mouse event handling
```

### 2. Session Recorder (Backend)

**Purpose**: Capture and timestamp all collaborative sessions

**Key Features to Build**:
- WebSocket room subscription management
- Operation log streaming
- User presence tracking
- Geographic location capture
- Session metadata storage (tags, participants)

**Technical Implementation**:
```typescript
// Durable Object: AppRecordRoom
- Yjs document snapshots on interval
- Location data collection from clients
- Participant list maintenance
- Room lifecycle management
```

### 3. Consolidation Engine (Scheduler)

**Purpose**: Merge and organize sessions based on time/location patterns

**Key Features to Build**:
- Session clustering algorithm
- Temporal grouping (morning/afternoon/sessions)
- Geographic proximity detection
- Pattern identification in diagrams
- Duplicate suppression
- Summary generation

**Technical Implementation**:
```typescript
// src/cron.ts + Durable Object: AppCronRoom
- Scheduled task runner
- Session analysis jobs
- Clustering logic (DBSCAN or similar)
- Location-based filtering
```

### 4. Markdown Generator (AI Interface)

**Purpose**: Convert consolidated sessions to structured documentation

**Key Features to Build**:
- Diagram element extraction
- Relationship mapping
- Context-aware formatting
- Template-based output
- Multi-format support (Mermaid, PlantUML, Flowchart)

**Technical Implementation**:
```typescript
// src/ai/tools.ts + JobRoom
- Element parsing utilities
- Relationship graph builder
- Markdown template engine
- Schema validation for AI consumption
```

### 5. AI Agent Bridge (API Layer)

**Purpose**: Expose tools and data for AI agent consumption

**Key Features to Build**:
- HTTP endpoint definitions
- MCP protocol integration
- Browser tool registration
- Streaming response support
- Authentication handling

**Technical Implementation**:
```typescript
// src/ai/agent.ts + worker.ts routes
- Tool schema definitions
- Request validation
- Response streaming
- Error handling
```

---

## Data Models

### Canvas Element Schema

```typescript
interface CanvasElement {
  id: string;
  type: 'rectangle' | 'circle' | 'arrow' | 'text';
  position: { x: number; y: number };
  dimensions: { width: number; height: number };
  content?: string;
  connections?: string[]; // IDs of connected elements
  style?: ElementStyle;
  createdAt: number; // timestamp
  updatedAt: number;
  ownerId: string;
}

interface CanvasRoomState {
  elements: Record<string, CanvasElement>;
  selection: string[];
  zoomLevel: number;
  panOffset: { x: number; y: number };
  history: YjsHistory;
}
```

### Session Metadata Schema

```typescript
interface SessionMetadata {
  roomId: string;
  sessionId: string;
  participants: Array<{
    userId: string;
    joinedAt: number;
    leftAt?: number;
  }>;
  locationData: {
    coordinates?: { lat: number; lng: number };
    accuracy?: number;
    timestamp: number;
  };
  tags: string[];
  summary?: string;
}
```

### Consolidated Output Schema

```typescript
interface ConsolidatedSession {
  originalSessions: string[]; // session IDs that merged
  timeRange: { start: number; end: number };
  locationContext: { region: string; centroid?: GeoPoint };
  elements: Map<string, CanvasElement>;
  relationships: RelationshipGraph;
  metadata: ConsolidationMetadata;
}

interface Relationships {
  type: 'references' | 'depends_on' | 'extends' | 'implements';
  sourceId: string;
  targetId: string;
  label?: string;
  confidence: number; // AI-assessed confidence
}
```

---

## Development Phases

### Phase 1: Foundation (Weeks 1-2)

**Goals**: Core whiteboard with basic collaboration

**Tasks**:
1. [ ] Set up DeepSpace project scaffolding
2. [ ] Implement CanvasRoom Yjs sync
3. [ ] Build basic canvas UI (shapes, pan/zoom)
4. [ ] Add WebSocket connection handling
5. [ ] Create session recording Durable Object
6. [ ] Write unit tests for core components

**Deliverable**: Functional whiteboard with 2-user collaboration

### Phase 2: Session Management (Weeks 3-4)

**Goals**: Recording and organization

**Tasks**:
1. [ ] Implement presence tracking room
2. [ ] Add location data collection (with permission)
3. [ ] Create session timeline view
4. [ ] Build room search/filter UI
5. [ ] Implement room creation/editing flows
6. [ ] Add export to image functionality

**Deliverable**: Full session recording and organization

### Phase 3: Consolidation Engine (Weeks 5-7)

**Goals**: Smart session merging and analysis

**Tasks**:
1. [ ] Build clustering algorithm for sessions
2. [ ] Implement location-based grouping
3. [ ] Create time-range analysis logic
4. [ ] Add duplicate element suppression
5. [ ] Build summary generation (AI-assisted)
6. [ ] Create consolidation UI dashboard

**Deliverable**: Automatic session consolidation feature

### Phase 4: Markdown Generation (Weeks 8-10)

**Goals**: Convert diagrams to structured documentation

**Tasks**:
1. [ ] Parse canvas elements to text representations
2. [ ] Build relationship graph builder
3. [ ] Implement Mermaid.js output generator
4. [ ] Create PlantUML converter
5. [ ] Add template customization UI
6. [ ] Export metadata (contributors, timestamps)
7. [ ] Validate output structure

**Deliverable**: Markdown file generation from diagrams

### Phase 5: AI Integration (Weeks 11-13)

**Goals**: Enable AI agent handoff and consumption

**Tasks**:
1. [ ] Define tool schemas for AI agents
2. [ ] Build HTTP endpoints for tool access
3. [ ] Implement MCP protocol integration
4. [ ] Add browser tool registration
5. [ ] Create streaming response handlers
6. [ ] Build authentication middleware
7. [ ] Document API usage patterns

**Deliverable**: Production-ready AI agent interface

### Phase 6: Polish & Deployment (Weeks 14-15)

**Goals**: Production readiness and launch prep

**Tasks**:
1. [ ] Comprehensive testing suite
2. [ ] Performance optimization
3. [ ] Security audit
4. [ ] Documentation completion
5. [ ] Cloudflare deployment setup
6. [ ] Migration scripts
7. [ ] Error handling improvements

**Deliverable**: Production-ready application

---

## Key API Endpoints (Planned)

### Consolidation Service

```typescript
// POST /api/consolidate
/**
 * Trigger consolidation for a session or session group
 * Response: { sessionId, consolidatedElements, relationships }
 */
export async function consolidateSessions(params: {
  roomIds: string[];
  timeWindowMinutes?: number;
  locationRadiusKm?: number;
}): Promise<ConsolidatedResult>;

// GET /api/consolidate/history
/** Get past consolidation operations */
export async function getConsolidationHistory(params: {
  roomId: string;
  limit?: number;
}): Promise<ConsolidationRecord[]>;
```

### AI Tool Interface

```typescript
// POST /api/ai/generate-spec
/** Generate Markdown specification from canvas data */
export async function generateSpecification(request: {
  roomIds: string[];
  format: 'mermaid' | 'plantuml' | 'flowchart';
  template?: TemplateConfig;
}): Promise<{
  markdown: string;
  metadata: ExportMetadata;
  relationships: RelationshipSummary;
}>;

// POST /api/ai/tools/list
/** List available tools for AI consumption */
export async function listTools(): Promise<ToolDefinition[]>;
```

---

## Critical Dependencies

### Must-Have (Core)

- [x] DeepSpace SDK (already installed v0.44.2)
- [x] Yjs (already installed - CRDT sync)
- [ ] Cloudflare Durable Objects (DOs)
- [ ] Hono router (already installed)
- [ ] SQLite via DO bindings

### Nice-to-Have (Enhancement)

- AI model integration (Anthropic/Google/OpenAI)
- Geo-location services (for location grouping)
- Mermaid.js library (diagram rendering)
- PlantUML converter
- Image export utilities

---

## Security Considerations

1. **Authentication**: DeepSpace JWT handling via existing auth routes
2. **Room Access**: Role-based room membership checks in RecordRoom/CanvasRoom
3. **Location Data**: Opt-in with clear user consent
4. **Data Privacy**: No PII in canvas content by default
5. **Rate Limiting**: Implement for AI endpoint calls

---

## Success Metrics

### Early Version (V0.1)
- [ ] 2+ concurrent users can edit same diagram
- [ ] Session recording captures all operations
- [ ] Location data collected with permission
- [ ] Basic consolidation works manually

### Mid Version (V0.5)
- [ ] Automatic session clustering functional
- [ ] Markdown generation produces valid output
- [ ] AI agent can consume via API
- [ ] >90% diagram parse accuracy

### Target Version (V1.0)
- [ ] Seamless collaboration experience
- [ ] One-click export to AI-ready spec
- [ ] <2s latency for sync operations
- [ ] 95+ user satisfaction score

---

## Quick Start for Developers

```bash
# 1. Initial setup
npx deepspace auth login
npm install

# 2. Explore existing structure
cat src/ai/tools.ts           # AI tool definitions
cat worker.ts                 # Worker routes and DOs
cat src/cron.ts               # Scheduled tasks

# 3. Start local development
npm run dev

# 4. Deploy when ready
npm run build
npx deepspace deploy
```

---

## Open Questions (To Decide)

1. **AI Model Provider**: Which AI services to integrate? (Anthropic, Google, or keep model-agnostic?)
2. **Location Precision**: How granular should location grouping be? (City-level vs specific coordinates)
3. **Export Formats**: Mermaid.js only, or multiple diagram formats?
4. **Team Features**: Should Phase 1 include auth/teams, or focus on core whiteboard first?
5. **AI Handoff**: Provide full tool definitions for any AI agent, or specific partner integrations?

---

## Contact & Support

For questions about this build outline:
- Review existing code in `src/` directory
- Check DeepSpace documentation at https://docs.deep.space
- See AGENTS.md for project-specific commands
