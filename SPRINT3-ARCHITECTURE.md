# Sprint 3: Architecture Optimization

**Goal:** Transform RadCase from a prototype architecture into a production-grade, maintainable codebase.

**Deadline:** Feb 17, 2026 (alongside Sprint 2 completion)

---

## Phase 1: Break Apart index.html (4,133 lines → ~300 lines)

The monolithic index.html contains HTML templates, inline CSS, and inline JS all tangled together. This is the #1 architectural debt.

### Task 1.1: Extract all inline CSS into external stylesheets
**Description:** index.html contains massive `<style>` blocks. Extract ALL inline CSS into organized external stylesheets:
- `public/styles/base.css` — reset, typography, CSS variables, design tokens
- `public/styles/layout.css` — grid, flexbox layouts, page structure
- `public/styles/components.css` — cards, buttons, modals, forms, badges
- `public/styles/views.css` — view-specific styles (library, case detail, quiz, settings)
- `public/styles/animations.css` — transitions, keyframes, loading states
- `public/styles/dark-hud.css` — the RadIntel dark HUD theme (glassmorphism, gradients, glow effects)

Keep `critical.css` for above-the-fold inline styles only.

- **Files to modify:** `public/index.html`
- **Files to create:** `public/styles/*.css`
- **Complexity:** L
- **Dependencies:** None

### Task 1.2: Extract inline JavaScript into modules
**Description:** index.html contains significant inline `<script>` blocks with initialization logic, event handlers, and global functions. Extract into:
- `public/app.js` — main application initialization, router, view manager
- `public/api.js` — all fetch/API calls centralized
- `public/ui.js` — DOM manipulation helpers, toast notifications, modal management
- `public/state.js` — application state management (currently scattered global variables)

Use ES modules (`type="module"`) with `import`/`export` for clean dependency management.

- **Files to modify:** `public/index.html`
- **Files to create:** `public/app.js`, `public/api.js`, `public/ui.js`, `public/state.js`
- **Complexity:** L
- **Dependencies:** Task 1.1

### Task 1.3: Create HTML templates
**Description:** After CSS and JS extraction, the remaining HTML should be clean semantic markup. Organize into logical sections with clear comments. Target: index.html under 400 lines — just the HTML skeleton with `<link>` and `<script>` tags.

- **Files to modify:** `public/index.html`
- **Complexity:** M
- **Dependencies:** Task 1.1, 1.2

---

## Phase 2: Add Vite Build System

Replace raw file serving with a modern build pipeline for bundling, minification, tree-shaking, and hot reload during development.

### Task 2.1: Initialize Vite project
**Description:** Set up Vite in the RadCase project:
- `npm install vite --save-dev`
- Create `vite.config.js` with:
  - `root: 'public'` (or restructure to `src/`)
  - Dev server proxy for `/api` routes to Express backend (port 3456)
  - Build output to `dist/`
- Add npm scripts: `dev` (Vite dev server), `build` (production build), `preview`
- Configure Express to serve from `dist/` in production

- **Files to create:** `vite.config.js`
- **Files to modify:** `package.json`, `server.js`
- **Complexity:** M
- **Dependencies:** Task 1.2 (JS must be modules first)

### Task 2.2: Configure CSS processing
**Description:** Set up Vite's CSS pipeline:
- CSS modules or scoped styles for component isolation
- PostCSS with autoprefixer for cross-browser compatibility
- CSS minification in production builds
- Import CSS files from JS modules

- **Files to create:** `postcss.config.js`
- **Files to modify:** `vite.config.js`, `package.json`
- **Complexity:** S
- **Dependencies:** Task 2.1

### Task 2.3: Configure asset handling and code splitting
**Description:** Set up proper asset pipeline:
- Image optimization (WebP/AVIF conversion in build)
- Font loading optimization
- Automatic code splitting for route-based chunks
- Dynamic imports for heavy modules (DICOM viewer, annotation engine)
- Service worker remains outside Vite (self-updating)
- Source maps for debugging

- **Files to modify:** `vite.config.js`
- **Complexity:** M
- **Dependencies:** Task 2.1

### Task 2.4: Update deployment pipeline
**Description:** Update the systemd service and any deployment scripts:
- `npm run build` as pre-start step
- Express serves `dist/` in production
- Dev workflow: `npm run dev` for Vite HMR + Express API
- Environment-based configuration (dev vs production)

- **Files to modify:** `server.js`, `package.json`, systemd service file
- **Complexity:** S
- **Dependencies:** Task 2.1, 2.2, 2.3

---

## Phase 3: React Migration

Migrate the frontend from vanilla DOM manipulation to React with the dark HUD theme preserved. Use Vite's React plugin for fast builds and HMR.

### Task 3.1: Set up React with Vite
**Description:** Add React to the project:
- `npm install react react-dom`
- `npm install -D @vitejs/plugin-react`
- Update `vite.config.js` with React plugin
- Create `src/main.jsx` entry point
- Create `src/App.jsx` root component with React Router
- Set up CSS Modules or styled-components for component styling
- Port the Dark HUD theme variables into a shared theme file

- **Files to create:** `src/main.jsx`, `src/App.jsx`, `src/theme.js`
- **Files to modify:** `vite.config.js`, `package.json`
- **Complexity:** M
- **Dependencies:** Task 2.1

### Task 3.2: Build core layout and routing
**Description:** Create the app shell and route structure:
- `src/components/Layout.jsx` — sidebar, header, main content area
- `src/components/Navbar.jsx` — navigation with dark HUD styling
- React Router routes: Library, Case Detail, Quiz, Settings, Admin
- `src/hooks/useApi.js` — custom hook wrapping all API calls
- `src/context/AuthContext.jsx` — authentication state
- `src/context/ThemeContext.jsx` — dark HUD theme provider

- **Files to create:** `src/components/*.jsx`, `src/hooks/*.js`, `src/context/*.jsx`
- **Complexity:** L
- **Dependencies:** Task 3.1

### Task 3.3: Migrate case library and case card
**Description:** The case card (library grid, search results, bookmarks) is the most-used UI element. Build as React components:
- `src/components/CaseCard.jsx` — props: case data, view mode (grid/list), bookmark state
- `src/components/CaseLibrary.jsx` — grid/list view, search, filtering, pagination
- `src/components/CaseDetail.jsx` — full case view with DICOM viewer, annotations, AI analysis
- Use React state for filters, search, view mode

- **Files to create:** `src/components/CaseCard.jsx`, `src/components/CaseLibrary.jsx`, `src/components/CaseDetail.jsx`
- **Complexity:** L
- **Dependencies:** Task 3.2

### Task 3.4: Migrate quiz and interactive features
**Description:** Port quiz, micro-learning, and spaced repetition to React:
- `src/components/Quiz.jsx` — quiz interface with scoring
- `src/components/MicroLearning.jsx` — spaced repetition cards
- `src/components/AnnotationCanvas.jsx` — DICOM annotation overlay (integrate with existing canvas logic)
- `src/components/VoiceNarrator.jsx` — TTS-powered case narration

- **Files to create:** `src/components/Quiz.jsx`, `src/components/MicroLearning.jsx`, `src/components/AnnotationCanvas.jsx`, `src/components/VoiceNarrator.jsx`
- **Complexity:** L
- **Dependencies:** Task 3.2

### Task 3.5: Migrate modals, toolbars, and shared UI
**Description:** Extract reusable UI primitives:
- `src/components/ui/Dialog.jsx` — accessible modal (focus trap, ESC, aria-modal)
- `src/components/ui/Toolbar.jsx` — responsive toolbar (collapses on mobile, 48px touch targets)
- `src/components/ui/Toast.jsx` — notification system
- `src/components/ui/Button.jsx`, `Badge.jsx`, `Card.jsx` — atomic components
- All styled with dark HUD theme

- **Files to create:** `src/components/ui/*.jsx`
- **Complexity:** M
- **Dependencies:** Task 3.1

### Task 3.6: Remove legacy vanilla JS
**Description:** Once all views are ported to React:
- Remove old `public/*.js` files (app.js, ui.js, state.js, etc.)
- Remove inline scripts from index.html
- Update index.html to just mount the React root (`<div id="root">`)
- Verify all functionality works through React
- Run full test suite

- **Files to modify:** `public/index.html`, remove `public/*.js`
- **Complexity:** M
- **Dependencies:** Task 3.3, 3.4, 3.5

---

## Phase 4: Server Refactoring (if time permits)

Server.js is 2,556 lines — manageable but could be cleaner.

### Task 4.1: Extract route handlers
**Description:** Split server.js route handlers into separate files:
- `routes/cases.js` — case CRUD, search, filtering
- `routes/auth.js` — login, register, session management
- `routes/dicom.js` — DICOM upload, viewing, thumbnails
- `routes/quiz.js` — quiz, micro-learning, spaced repetition
- `routes/sync.js` — sync, push notifications, WebSocket
- `routes/admin.js` — admin endpoints

Use Express Router for each module.

- **Files to create:** `routes/*.js`
- **Files to modify:** `server.js`
- **Complexity:** L
- **Dependencies:** None (can be done in parallel with Phase 1-3)

### Task 4.2: Extract middleware
**Description:** Pull middleware into dedicated files:
- `middleware/auth.js` — authentication checks
- `middleware/upload.js` — multer configuration
- `middleware/security.js` — rate limiting, CORS, helmet
- `middleware/error.js` — error handling

- **Files to create:** `middleware/*.js`
- **Files to modify:** `server.js`
- **Complexity:** M
- **Dependencies:** Task 4.1

---

## Implementation Order

```
Phase 1 (sequential — must be done in order):
  1.1 Extract CSS ──> 1.2 Extract JS ──> 1.3 Clean HTML

Phase 2 (after Phase 1):
  2.1 Init Vite ──> 2.2 CSS processing ──> 2.3 Code splitting ──> 2.4 Deploy

Phase 3 (after Task 2.1):
  3.1 React setup ──> 3.2 Layout/routing ──> 3.3 Case library
                                         ──> 3.4 Quiz/interactive
                  ──> 3.5 Shared UI components
  3.6 Remove legacy (after 3.3, 3.4, 3.5)

Phase 4 (independent — can run in parallel):
  4.1 Extract routes ──> 4.2 Extract middleware
```

## Success Criteria
- [ ] index.html under 400 lines
- [ ] All CSS in external stylesheets
- [ ] All JS in ES modules
- [ ] Vite dev server with HMR working
- [ ] Production build generates optimized bundle
- [ ] Full React frontend with component architecture
- [ ] React Router handling all views
- [ ] Reusable UI component library (Dialog, Toolbar, Toast, etc.)
- [ ] Server routes modularized
- [ ] All existing functionality preserved
- [ ] Dark HUD theme maintained
- [ ] Tests still pass

## Summary

| Phase | Tasks | Complexity | Priority |
|-------|-------|-----------|----------|
| Phase 1: Break Apart index.html | 3 | 2L + 1M | 🔴 Critical |
| Phase 2: Vite Build System | 4 | 2M + 2S | 🟡 High |
| Phase 3: React Migration | 6 | 3L + 3M | 🔴 Critical |
| Phase 4: Server Refactoring | 2 | 1L + 1M | 🟢 Nice to have |
| **Total** | **15** | | |
