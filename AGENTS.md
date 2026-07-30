# AGENTS.md — Agent Instructions for FlyGPlot

## Build / Test / Lint

```bash
cd frontend && npx tsc --noEmit         # TypeScript check
cd frontend && npm run build             # Full production build
cd server && node --check <file>.js     # Syntax check individual files
```

## Code Style

- **Frontend:** TypeScript, React 19, Zustand stores, CSS variables for theming
- **Backend:** Node.js ESM (`import`/`export`), Express 5 route handlers
- **Naming:** PascalCase components, camelCase functions/vars, UPPER_CASE for sidebar labels
- **Inline styles preferred** over separate CSS files for component-specific layout; global CSS in `index.css`
- One commit per feature with conventional commit format (`feat:`, `fix:`, `chore:`)

## Key Conventions

- All tabs wrapped in `WorkspaceLayout` shared component (300px control panel | 1fr content)
- State managed through Zustand `useAppStore` — do not add local state that belongs globally
- Backend external API calls use `AbortController` + timeout pattern from `constants.js`
- Cache all external API responses via `cacheSet`/`cacheGet` in SQLite
- Frontend data served via `StaticJsonDataClient` — swappable via `setDataClient()`

## Important Constraints

- `better-sqlite3` is a native module — must be rebuilt if Node.js version changes (`npm rebuild better-sqlite3`)
- Enrichr requires `multipart/form-data` (not URL-encoded)
- g:Profiler is the primary enrichment backend (native Drosophila); Enrichr is fallback
- FlyBase API is unreliable — always have an Ensembl fallback path
- Co-expression engine reads JSON synchronously — large batches block the event loop
- SVG NetworkView uses `viewBox`-based zoom/pan (not CSS transforms)

## Working Directory

All commands run from project root unless specified. Frontend in `frontend/`, backend in `server/`.
