# Co-Create

> **A collaborative whiteboard platform that transforms your diagrams into AI-ready specifications.**

[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![DeepSpace](https://img.shields.io/badge/powered%20by-DeepSpace-orange.svg)](https://deep.space)

## 🎯 Vision

Co-Create is a collaborative whiteboard platform where teams can **diagram thought processes and design solutions**. The app intelligently consolidates this work based on **time created and location** to generate **Markdown documentation files** that can be easily handed off to AI agents for rapid product development.

## ✨ What Makes This Special

- **Live Collaborative Whiteboarding** - Real-time multiplayer canvas for brainstorming, flowcharts, and system diagrams
- **Smart Consolidation** - Automatically organizes ideas by creation time and geographic location
- **AI-Ready Documentation** - Converts visual designs into structured Markdown specifications
- **Seamless AI Handoff** - Export ready-to-use spec files that AI agents can interpret and implement

## 🚀 Features

### Planned Roadmap

#### Phase 1: Collaborative Whiteboard Core
- [ ] Real-time collaborative canvas (using Yjs for sync)
- [ ] Diagram tools (shapes, arrows, text boxes)
- [ ] Infinite canvas with pan/zoom
- [ ] Multiple room/workspace support
- [ ] Room-based organization with deep linking

#### Phase 2: Smart Consolidation Engine
- [ ] Time-based session tracking
- [ ] Location-aware grouping (geolocation integration)
- [ ] Automatic pattern detection in diagrams
- [ ] Timeline view of all sessions
- [ ] Session merging and comparison tools

#### Phase 3: Markdown Generator
- [ ] Visual-to-text conversion engine
- [ ] Structured output generation (Mermaid, PlantUML, etc.)
- [ ] Metadata extraction (tags, timestamps, contributors)
- [ ] Template-based formatting
- [ ] Export to .md with proper structure

#### Phase 4: AI Integration Layer
- [ ] API endpoints for AI agent consumption
- [ ] Schema validation for AI outputs
- [ ] Tool definitions for common actions
- [ ] Streaming response support
- [ ] Multiple AI model compatibility

#### Phase 5: Team Features
- [ ] User authentication and management
- [ ] Role-based access control
- [ ] Real-time presence indicators
- [ ] Comments and annotations
- [ ] Version history and rollback

## 🏗️ Architecture

### Technology Stack

- **Framework**: DeepSpace (real-time collaborative framework)
- **Runtime**: Cloudflare Workers + Durable Objects
- **State Sync**: Yjs (CRDT-based collaboration)
- **Database**: SQLite via Durable Objects
- **UI**: React 19 with Tailwind CSS
- **AI Integration**: AI SDK v7

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                    Client Application                     │
│  (React SPA - Vite build, Cloudflare Edge)               │
└─────────────────────────────────────────────────────────┘
                           ↕ WebSocket
┌─────────────────────────────────────────────────────────┐
│                   DeepSpace Rooms                         │
│  ┌──────────────┬──────────────┬────────────────────┐   │
│  │ CanvasRoom   │ RecordRoom   │ PresenceRoom       │   │
│  └──────────────┴──────────────┴────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           ↕ SQLite (DOs)
┌─────────────────────────────────────────────────────────┐
│                   Cloudflare Durable Objects              │
│  - CanvasRooms: Collaborative whiteboard sessions         │
│  - RecordRooms: Persistent data storage                  │
│  - PresenceRooms: Real-time user presence                 │
│  - CronRooms: Scheduled consolidation tasks               │
│  - JobRooms: Background AI processing                     │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User creates/edits diagram** → CanvasRoom syncs via Yjs
2. **Session metadata tracked** → RecordRoom timestamps + location
3. **Scheduled consolidation** → CronRoom triggers processing
4. **AI generation** → JobRoom executes AI agent calls
5. **Markdown output** → Available for download/handoff

## 🛠️ Getting Started

### Prerequisites

- Node.js 22+ 
- npm 11.6+ or pnpm

### Installation

```bash
# Navigate to project directory
cd co-create

# Install dependencies
npm install

# Configure DeepSpace authentication
npx deepspace auth login
```

### Local Development

```bash
# Start local dev server (Vite + Miniflare)
npm run dev

# Or use DeepSpace CLI
npx deepspace dev start
```

### Deployment

```bash
# Push code to cloud repo
npx deepspace push

# Deploy to <app>.app.space
npx deepspace deploy
```

## 📋 Commands Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development server |
| `npm run build` | Build production bundle |
| `npm run test` | Run all tests |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npx deepspace auth login` | Authenticate with DeepSpace |
| `npx deepspace push` | Sync to cloud repo |
| `npx deepspace add <feature>` | Add optional features (messaging, etc.) |

## 🤖 AI Agent Integration

The app exposes tools via HTTP, MCP, and browser tool interfaces that AI agents can consume:

```typescript
// Example AI agent usage pattern
const spec = await aiAgent.generateSpecification({
  canvasData: canvasContent,
  sessionId: currentSession.id,
  locationContext: locationData,
});

// Output is Markdown ready for implementation
console.log(spec.markdown);
```

### Available Tool Categories (see `src/ai/tools.ts`)

- **Canvas tools**: Diagram manipulation and analysis
- **Consolidation tools**: Session merging and pattern detection
- **Export tools**: Format conversion to various AI-friendly formats
- **AI interface tools**: Model selection, prompt management

## 📁 Project Structure

```
co-create/
├── src/
│   ├── ai/          # AI integration and tool definitions
│   ├── server/      # HTTP routes and middleware
│   └── cron/        # Scheduled tasks for consolidation
├── public/          # Static assets
├── tests/           # Test suite
├── src/server/      # Route handlers
├── deepspace.migrations.json  # Database migrations
└── wrangler.toml    # Cloudflare configuration
```

## 🔧 Configuration

### DeepSpace Setup

```bash
# Initial authentication
npx deepspace auth login

# Add features (optional)
npx deepspace add messaging
npx deepspace add ai-tools
```

### Environment Variables

See `wrangler.toml` for production configuration:

- `DEEPSPACE_APP_ID` - Unique app identifier
- `APP_NAME` - Application name
- `ALLOW_DEBUG_ROUTES` - Enable debug endpoints (dev only)
- Platform bindings for API, R2, and auth services

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Workflow

```bash
# Create a workspace for your task
npx deepspace workspace new -t "implement whiteboard sync"

# Commit changes to the workspace
npm run commit

# Sync with main codebase
npx deepspace workspace sync

# Land the changes
npx deepspace workspace land
```

## 📚 Documentation Links

- [DeepSpace Docs](https://docs.deep.space)
- [Yjs Collaboration Guide](https://yjs.dev)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)

## 🐛 Reporting Issues

Please use the provided reporting tools to collect diagnostics and submit issues with GitHub CLI.

```bash
npx deepspace report bug --help
```

## 📄 License

MIT License - See LICENSE file for details

---

## 🎯 Next Steps

To start building:

1. **Set up DeepSpace authentication** (`npx deepspace auth login`)
2. **Explore existing routes and schemas** in `src/` directory
3. **Implement the whiteboard canvas** component
4. **Connect AI tools** to generate Markdown from diagrams

The foundation is ready - start creating! 🚀
