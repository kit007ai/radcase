# Sprint 2 Task Breakdown - Advanced Mobile UX

**Deadline:** Feb 17, 2026
**Status:** ~85% scaffolded, integration + gaps remain

> This breakdown reflects actual codebase state. Most Sprint 2 modules exist as
> standalone implementations. The remaining work is filling functional gaps,
> wiring integrations, and hardening for production.

---

## Phase 1: PWA + Performance (Foundation)

These tasks enable offline use, installability, and fast mobile loads.
Everything in Phase 2 and 3 depends on the service worker and caching layer
working correctly.

### Task 1.1: Implement IndexedDB helpers in Service Worker
**Description:** The service worker's `getStoredData()` and `removeStoredData()`
are stubbed with TODO comments (sw.js:283-292). Background sync for progress
and annotations silently fails without them. Implement a proper IndexedDB
wrapper (`radcase-offline` database) with stores for `pending-progress`,
`pending-annotations`, and `offline-cases`.

- **Files to modify:** `public/sw.js`
- **Complexity:** M
- **Dependencies:** None (blocking Task 1.3, 3.5)

### Task 1.2: Persist push subscriptions to database
**Description:** The `/api/push-subscription` endpoint (server.js:2012) logs
subscriptions but doesn't persist them. Create a `push_subscriptions` table and
store endpoint + keys so the server can actually send push notifications later.

- **Files to modify:** `server.js`
- **Complexity:** S
- **Dependencies:** None

### Task 1.3: Verify service worker registration flow
**Description:** SW registration happens inside `PerformanceOptimizer.init()`
(performance-optimizer.js:341). Verify this runs reliably on first visit, handles
update lifecycle (skipWaiting, clients.claim), and that the install/activate
events in sw.js correctly populate the cache. Test the offline fallback path
end-to-end.

- **Files to modify:** `public/performance-optimizer.js`, `public/sw.js`
- **Complexity:** S
- **Dependencies:** Task 1.1

### Task 1.4: Add offline case storage with IndexedDB
**Description:** Enable downloading cases for offline viewing. Add an IndexedDB
`offline-cases` object store. Implement UI to mark cases for offline access
(download button on case cards). Cache case metadata + images into IndexedDB.
Serve from IndexedDB when network is unavailable.

- **Files to modify:** `public/sw.js`, `public/index.html` (UI for download button), `public/pwa-manager.js`
- **Complexity:** L
- **Dependencies:** Task 1.1

### Task 1.5: Create critical CSS and lazy-load non-essential styles
**Description:** The tech spec calls for `public/critical.css` and
`public/lazy-loader.js` but neither exists. Extract above-the-fold critical CSS
from `index.html` inline styles. Defer loading of `mobile.css` and other
non-critical styles. Add `IntersectionObserver`-based lazy loading for case card
images (the performance-optimizer has some of this but no dedicated lazy loader
for images throughout the app).

- **Files to create:** `public/critical.css`, `public/lazy-loader.js`
- **Files to modify:** `public/index.html`
- **Complexity:** M
- **Dependencies:** None

### Task 1.6: Add WebP/AVIF image format support
**Description:** Serve thumbnails in WebP format for supporting browsers. Modify
the Sharp thumbnail pipeline in server.js to generate WebP variants. Add
`<picture>` element or `Accept` header detection to serve optimal format. Falls
back to existing JPEG/PNG.

- **Files to modify:** `server.js`, `public/index.html` (image rendering)
- **Complexity:** M
- **Dependencies:** None

### Task 1.7: Implement code splitting for initial load
**Description:** All JS files load on every page. Defer non-critical scripts
(`touch-gestures.js`, `swipe-quiz.js`, `sync-manager.js`, `micro-learning.js`)
by adding `defer` or loading them on demand when their features are activated.
Only `performance-optimizer.js` and `pwa-manager.js` need to load eagerly.

- **Files to modify:** `public/index.html`
- **Complexity:** S
- **Dependencies:** None

---

## Phase 2: Touch Annotations (DICOM Interaction)

These tasks enhance the annotation and DICOM viewing experience for
touch/stylus input. Depends on Phase 1 service worker being functional
for offline annotation saving.

### Task 2.1: Add pressure-sensitive drawing to annotation engine
**Description:** `annotate.js` maps touch events to mouse events (line 229-351)
with no pressure data. Add `PointerEvent` support to detect pressure
(`event.pressure`), tiltX/tiltY for Apple Pencil. Vary stroke width based on
pressure. The `touch-gestures.js` handler has palm rejection logic but
`annotate.js` doesn't use it.

- **Files to modify:** `public/annotate.js`
- **Complexity:** M
- **Dependencies:** None

### Task 2.2: Add highlighter and text annotation tools
**Description:** `annotate.js` has arrow, circle, rect, line, and freehand
tools. The spec requires highlighter (semi-transparent strokes) and text
placement. Add a highlighter tool (freehand with ~30% opacity, wider stroke)
and a text tool (tap to place, input overlay for text entry).

- **Files to modify:** `public/annotate.js`
- **Complexity:** M
- **Dependencies:** None

### Task 2.3: Integrate touch gesture handler with annotation canvas
**Description:** `touch-gestures.js` and `annotate.js` operate independently.
When the touch toolbar's "annotate" mode is active, it should delegate drawing
events to the AnnotationCanvas. When "pan"/"zoom" modes are active, annotation
drawing should be disabled. Wire the two systems together so they share the
canvas without conflicting.

- **Files to modify:** `public/touch-gestures.js`, `public/annotate.js`, `public/index.html` (integration glue)
- **Complexity:** L
- **Dependencies:** Task 2.1

### Task 2.4: Touch-friendly annotation toolbar
**Description:** The annotation toolbar uses emoji buttons (annotate.js:27-30)
that are small and hard to tap. Replace with SVG icons matching the
touch-gestures.js toolbar style. Ensure minimum 48px tap targets. Add a
floating, repositionable toolbar for mobile so it doesn't cover the image.

- **Files to modify:** `public/annotate.js`, `public/mobile.css`
- **Complexity:** M
- **Dependencies:** Task 2.2

### Task 2.5: Save annotations to IndexedDB for offline access
**Description:** Annotations currently save via `POST /api/annotations`. Add
offline fallback: save to IndexedDB when offline, queue for background sync
when connection returns. Integrate with the service worker's background sync
(which already has the sync handler, but needs IndexedDB from Task 1.1).

- **Files to modify:** `public/annotate.js`, `public/sw.js`
- **Complexity:** M
- **Dependencies:** Task 1.1, Task 2.3

---

## Phase 3: Micro-Learning + Cross-Device Sync

These tasks complete the learning experience and enable multi-device usage.
Depends on Phase 1 for offline/caching and Phase 2 for annotation sync.

### Task 3.1: Add voice-over case descriptions
**Description:** The tech spec requires `public/voice-narrator.js` for
hands-free learning using Web Speech API (`speechSynthesis`). Create a narrator
module that reads case descriptions, findings, and diagnoses aloud. Add a
speaker icon toggle to case view and micro-learning sessions. Handle speech
queue, pause/resume, and rate control.

- **Files to create:** `public/voice-narrator.js`
- **Files to modify:** `public/index.html`, `public/micro-learning.js`
- **Complexity:** M
- **Dependencies:** None

### Task 3.2: Add bookmarks UI to case cards and case viewer
**Description:** The bookmark API exists (server.js:2064-2105) with full
GET/POST/DELETE endpoints and a `bookmarks` table. But there's no UI for it.
Add a bookmark/heart icon to case cards in the library grid and in the case
detail view. Show a "Bookmarks" filter option in the library. Sync bookmark
state via the existing SyncManager.

- **Files to modify:** `public/index.html` (case card template, case detail view, filter bar)
- **Complexity:** M
- **Dependencies:** None

### Task 3.3: Implement device-specific UI preferences
**Description:** SyncManager supports `syncPreferences()` but no UI exists to
set per-device preferences (e.g., default view mode, font size, annotation
color). Add a simple preferences panel under settings. Store locally in
`localStorage` and sync via the existing `sync:preferences` event type.

- **Files to modify:** `public/index.html`, `public/sync-manager.js`
- **Complexity:** S
- **Dependencies:** None

### Task 3.4: Add conflict resolution for sync
**Description:** SyncManager sends events but has no conflict resolution when
the same case is modified on two devices simultaneously. Implement
last-write-wins with timestamp comparison for progress updates. For
annotations, keep both versions and let user choose. Add visual indicator
when a conflict is detected.

- **Files to modify:** `public/sync-manager.js`, `server.js`
- **Complexity:** L
- **Dependencies:** None

### Task 3.5: Wire micro-learning session resumption across devices
**Description:** Micro-learning sessions track progress in `localStorage`
(micro-learning.js). When a session is interrupted, the user should be able
to resume on another device. Persist session state (current case index, time
remaining, answers) to the server via the existing sync infrastructure. On
load, check for an active session to resume.

- **Files to modify:** `public/micro-learning.js`, `public/sync-manager.js`
- **Complexity:** M
- **Dependencies:** Task 1.1, Task 3.4

### Task 3.6: Add study reminder push notifications
**Description:** The PWA push infrastructure exists (sw.js handles push events,
pwa-manager.js subscribes). Add server-side logic to actually send push
notifications: a scheduled job that checks each user's last study activity and
sends a reminder if they haven't studied in 24h. Use `web-push` npm package.

- **Files to modify:** `server.js`, `package.json`
- **Complexity:** M
- **Dependencies:** Task 1.2

### Task 3.7: Enhance spaced repetition algorithm for mobile
**Description:** The quiz system exists but the spec calls for a
"mobile-optimized spaced repetition algorithm." Adjust the micro-learning case
selection to weight cases based on previous quiz performance (correct/incorrect
history), time since last review, and difficulty. Use the existing
`/api/cases/micro-learning` endpoint's specialty/difficulty params plus add
a `lastReviewed` filter.

- **Files to modify:** `server.js` (micro-learning endpoint query), `public/micro-learning.js`
- **Complexity:** M
- **Dependencies:** None

---

## Implementation Order (Dependency Graph)

```
Phase 1 (parallel start):
  1.1 IndexedDB helpers ─┬─> 1.3 SW verification ──> 1.4 Offline cases
  1.2 Push persistence   │
  1.5 Critical CSS        │
  1.6 WebP support        │
  1.7 Code splitting      │
                          │
Phase 2 (after 1.1):      │
  2.1 Pressure drawing ──> 2.3 Gesture+Annotation integration
  2.2 Highlighter+Text ──> 2.4 Touch toolbar
                     2.3 + 1.1 ──> 2.5 Offline annotations

Phase 3 (after 1.1, 1.2):
  3.1 Voice narrator
  3.2 Bookmarks UI
  3.3 Device preferences
  3.4 Conflict resolution ──> 3.5 Session resumption
  1.2 ──> 3.6 Push notifications
  3.7 Spaced repetition
```

## Summary

| Phase | Tasks | S | M | L | Est. Total |
|-------|-------|---|---|---|------------|
| Phase 1: PWA + Performance | 7 | 3 | 3 | 1 | 7 tasks |
| Phase 2: Touch Annotations | 5 | 0 | 4 | 1 | 5 tasks |
| Phase 3: Micro-Learning + Sync | 7 | 1 | 5 | 1 | 7 tasks |
| **Total** | **19** | **4** | **12** | **3** | **19 tasks** |

**Complexity key:** S = a few hours, M = half-day to full day, L = 1-2 days
