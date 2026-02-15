# Touch DICOM Annotation Research

> Research document for RadCase Sprint 2: Touch DICOM Annotations
> Date: 2026-02-14

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Cornerstone.js Touch Support](#cornerstonejs-touch-support)
3. [Library Comparison](#library-comparison)
   - [Pointer Events API (Native)](#option-1-pointer-events-api-native-browser)
   - [Hammer.js](#option-2-hammerjs)
   - [Fabric.js](#option-3-fabricjs)
4. [Comparison Matrix](#comparison-matrix)
5. [Recommendation](#recommendation)
6. [Implementation Sketch](#implementation-sketch)

---

## Current Architecture

RadCase uses two separate systems for DICOM viewing and annotations:

### DICOM Viewer (`dicom-viewer.js`)
- **Cornerstone.js** renders DICOM images on its own canvas
- **cornerstone-tools v3** provides viewport manipulation tools (Wwwc, Pan, Zoom, StackScrollMouseWheel)
- Custom touch scrolling via `touchstart`/`touchmove`/`touchend` on the DICOM element
- Tool activation via `cornerstoneTools.setToolActive()` with `mouseButtonMask: 1`
- Tools are mouse-oriented; touch works through cornerstone-tools' internal Touch Events forwarding

### Annotation Engine (`annotate.js`)
- Separate `<canvas>` overlay positioned absolutely over the image
- Direct Canvas 2D API drawing (arrows, circles, rectangles, lines, freehand, text)
- Mouse events: `mousedown` / `mousemove` / `mouseup` on the annotation canvas
- Basic touch support: `touchstart` / `touchmove` / `touchend` mapped to mouse handlers
- Coordinate scaling from display size to canvas natural size via `getBoundingClientRect()`
- Undo/redo via annotation array + history index
- No multi-touch support, no pressure sensitivity, no gesture disambiguation

### Key Constraint

Cornerstone.js **owns its canvas** and redraws it completely on every render cycle. Any external drawing on that canvas gets erased. The overlay canvas architecture in `annotate.js` is the correct approach and must be preserved.

---

## Cornerstone.js Touch Support

### What cornerstone-tools v3 Provides

Viewport manipulation tools with touch support:

| Tool | Gesture | Purpose |
|---|---|---|
| `ZoomTouchPinchTool` | Two-finger pinch | Zoom DICOM viewport |
| `PanMultiTouchTool` | Two-finger drag | Pan DICOM viewport |
| `WwwcTouchDragTool` | Single-finger drag | Adjust window width/center |
| `StackScrollMultiTouchTool` | Multi-touch scroll | Navigate slices |

Activation example:
```js
cornerstoneTools.addTool(cornerstoneTools.ZoomTouchPinchTool);
cornerstoneTools.setToolActive('ZoomTouchPinch', {});

cornerstoneTools.addTool(cornerstoneTools.PanMultiTouchTool);
cornerstoneTools.setToolActive('PanMultiTouch', { pointers: 2 });
```

### What It Does NOT Provide

- **No touch annotation tools.** Arrow, freehand, ellipse, rectangle tools are mouse-oriented. They declare `supportedInteractionTypes: ['Mouse', 'Touch']` but touch UX is not tuned.
- **No pressure sensitivity.** No integration with `PointerEvent.pressure`.
- **No stylus detection.** Cannot distinguish finger from Apple Pencil (`pointerType`).
- **No gesture disambiguation.** No logic to separate "user wants to draw" from "user wants to zoom/pan" on the annotation overlay.

### Maintenance Status

cornerstone-tools v3 is **officially deprecated**. The team recommends Cornerstone3D, which would require a full rewrite of RadCase's DICOM stack. Not viable for Sprint 2.

### Verdict

Use cornerstone-tools for DICOM viewport manipulation (already working). Build touch annotation support separately on the overlay canvas using a different API.

---

## Library Comparison

### Option 1: Pointer Events API (Native Browser)

The W3C [Pointer Events API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) unifies mouse, touch, and pen input into a single event model.

**Bundle size:** 0 kB (native browser API)

**Events:**

| Event | Fires when |
|---|---|
| `pointerdown` | Finger touches, mouse button pressed, pen contacts surface |
| `pointermove` | Pointer changes position |
| `pointerup` | Pointer lifts |
| `pointercancel` | System cancels pointer (palm rejection, context menu) |
| `gotpointercapture` | Element receives pointer capture |
| `lostpointercapture` | Element loses pointer capture |

**Multi-touch:** Each pointer gets a unique `pointerId`. Track them in a `Map`:

```js
const activePointers = new Map();

canvas.addEventListener('pointerdown', (e) => {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2) {
    // Two fingers: pinch-to-zoom or two-finger pan
    const [p1, p2] = [...activePointers.values()];
    const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    // Compare to previous distance/midpoint for zoom/pan
  } else if (activePointers.size === 1) {
    // Single pointer: draw annotation
  }
});

canvas.addEventListener('pointerup', (e) => {
  activePointers.delete(e.pointerId);
  canvas.releasePointerCapture(e.pointerId);
});
```

**Pressure sensitivity (Apple Pencil / stylus):**

```js
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'pen') {
    // Pressure range: 0.0 to 1.0
    const lineWidth = 1 + e.pressure * 10;
    ctx.lineWidth = lineWidth;
  }
});
```

Key `PointerEvent` properties for stylus:

| Property | Type | Description |
|---|---|---|
| `pressure` | `float [0,1]` | Normalized contact pressure |
| `tiltX` | `int [-90,90]` | Pen tilt angle (Y-Z plane) |
| `tiltY` | `int [-90,90]` | Pen tilt angle (X-Z plane) |
| `twist` | `int [0,359]` | Pen rotation around its axis |
| `pointerType` | `string` | `"mouse"`, `"pen"`, or `"touch"` |
| `width` / `height` | `float` | Contact geometry size |

**Smoother curves with `getCoalescedEvents()`:**

```js
canvas.addEventListener('pointermove', (e) => {
  // Access high-frequency samples (e.g., 240Hz Apple Pencil)
  const events = e.getCoalescedEvents?.() ?? [e];
  for (const ce of events) {
    ctx.lineTo(ce.offsetX, ce.offsetY);
  }
  ctx.stroke();
});
```

> Note: `getCoalescedEvents()` supported in Chrome 58+ and Firefox 59+, but **not Safari**. On Safari, standard ~60Hz dispatch rate is used.

**Browser support:** ~97% global coverage. Chrome 55+, Firefox 59+, Safari 13+, Edge 12+.

**Pros:**
- Zero bundle size
- Unified mouse/touch/pen input model
- Native pressure, tilt, and `pointerType` for stylus support
- `setPointerCapture()` ensures events continue even if pointer leaves element
- Works directly with existing overlay canvas, no Cornerstone conflicts
- W3C standard; future-proof
- Incremental migration: replace `mousedown`/`touchstart` with `pointerdown` etc.

**Cons:**
- Must implement gesture recognition manually (pinch-to-zoom, two-finger pan)
- Must build gesture disambiguation state machine (one finger = draw, two = zoom/pan)
- `getCoalescedEvents()` unavailable on Safari (slightly less smooth curves on iOS)
- ~100-150 lines of custom gesture code needed

---

### Option 2: Hammer.js

Gesture recognition library. npm: `hammerjs`

**Bundle size:** ~7.34 kB minified + gzipped

**Latest version:** 2.0.8 (published ~2016)

**Maintenance status:** Unmaintained. [Officially acknowledged](https://github.com/hammerjs/hammer.js/issues/1278). Active fork: `@egjs/hammerjs` (v2.0.17, maintained by NAVER).

**Built-in gesture recognizers:**

| Recognizer | Description |
|---|---|
| `Tap` | Single tap |
| `DoubleTap` | Double tap |
| `Press` | Long press / hold |
| `Pan` | Directional panning |
| `Swipe` | Fast directional swipe |
| `Pinch` | Two-finger pinch (zoom) |
| `Rotate` | Two-finger rotation |

Usage:
```js
const mc = new Hammer.Manager(canvas);
mc.add(new Hammer.Pinch());
mc.add(new Hammer.Pan({ pointers: 2 }));

mc.on('pinch', (e) => {
  // e.scale - cumulative scale factor
  applyZoom(e.scale);
});

mc.on('pan', (e) => {
  // e.deltaX, e.deltaY - cumulative displacement
  applyPan(e.deltaX, e.deltaY);
});
```

**Known problems with modern browsers:**

1. **Passive event listener violations.** Chrome 56+ treats `touchstart`/`touchmove` as passive by default. Hammer.js calls `preventDefault()` inside these handlers, producing console warnings and potentially broken gesture handling. Planned fix for Hammer 3.x, which never shipped.

2. **`touch-action` CSS conflicts.** Chrome 55+ changed behavior around `touch-action: pan-y`, breaking some pan event configurations.

3. **Mouse event issues in Chrome.** Reported conflicts when Pointer Events are also in play.

**Pros:**
- Small bundle size (7.34 kB)
- Pre-built gesture state machine with thresholds and priorities
- Well-documented API
- `recognizeWith()` / `requireFailure()` for gesture composition

**Cons:**
- **Unmaintained since 2016** -- no fixes for modern browser issues
- **Not designed for canvas drawing** -- provides gesture-level deltas, not raw per-pixel positions for strokes
- **No pressure/tilt/pointerType** -- cannot support Apple Pencil
- **Passive listener warnings** in Chrome/modern browsers
- **Dual event systems required** -- Hammer for gestures + raw events for drawing = complexity and potential conflicts
- Uses Touch Events API internally, conflicts with Pointer Events

---

### Option 3: Fabric.js

Full canvas abstraction and object model. npm: `fabric`

**Bundle size:** ~95.7 kB minified + gzipped

**Latest version:** 7.1.0 (early 2025, actively maintained)

**What it provides:**
- Interactive object model on HTML5 Canvas (Rect, Circle, Ellipse, Line, Path, Text, Image, Group)
- Built-in selection, moving, scaling, rotating of objects with handles
- SVG import/export, JSON serialization
- Free-drawing brush with configurable width/color
- Canvas event system
- Tree-shakable since v6

**Canvas ownership model:**
Fabric creates and manages its own canvas. It maintains a "lower canvas" for static rendering and an "upper canvas" for interaction. It controls the full render loop.

**Touch/mobile support:**
- Basic touch interactions (move, scale, select) work via built-in handlers
- [Documented performance issues](https://github.com/fabricjs/fabric.js/issues/3089) on mobile devices
- [Ongoing mobile support concerns](https://github.com/fabricjs/fabric.js/issues/6980)
- Community `fabric-touch` package exists, indicating built-in gaps
- No pressure sensitivity or `pointerType` detection

**Conflict with Cornerstone.js:**
This is a [known architectural issue](https://groups.google.com/g/cornerstone-platform/c/afIMkwooF74):
- Both Cornerstone and Fabric expect exclusive canvas ownership
- Both clear and redraw their canvas on every render cycle
- Using a separate overlay canvas creates 3-4 stacked canvases
- Coordinate synchronization between Cornerstone viewport transforms and Fabric object positions is non-trivial

**Impact on RadCase:**
- Would **replace** the entire `annotate.js` system, not enhance it
- Different serialization format -- incompatible with existing annotation data
- Fabric's zoom/pan would conflict with Cornerstone's zoom/pan

**Pros:**
- Actively maintained with regular releases
- Rich object model with built-in interaction handles
- JSON serialization for save/load
- SVG export capability

**Cons:**
- **95.7 kB gzipped** -- too heavy for a mobile PWA targeting <2s load times
- **Canvas ownership conflict** with Cornerstone.js
- **Full rewrite required** -- cannot incrementally adopt alongside existing `annotate.js`
- **No pressure/stylus support** -- does not expose PointerEvent properties
- **Mobile performance issues** documented in GitHub issues
- **Overkill** -- provides an entire canvas framework when RadCase only needs touch gesture handling

---

## Comparison Matrix

| Criteria | Cornerstone-Tools v3 | Pointer Events API | Hammer.js | Fabric.js |
|---|---|---|---|---|
| **Bundle Size** | Already loaded | **0 kB** | 7.34 kB | 95.7 kB |
| **Touch Annotations** | No (viewport only) | **Yes (must implement)** | Not for drawing | Yes (object model) |
| **Pinch-to-Zoom** | Viewport only | Must implement (~30 LOC) | Built-in | Built-in |
| **Two-Finger Pan** | Viewport only | Must implement (~20 LOC) | Built-in | Built-in |
| **Pressure Sensitivity** | No | **Yes (native)** | No | No |
| **Stylus / Apple Pencil** | No | **Yes (`pointerType: "pen"`)** | No | No |
| **Gesture State Machine** | Limited | Must implement (~100 LOC) | Built-in | Partial |
| **Canvas Drawing Fit** | N/A | **Excellent** | Poor | Full abstraction |
| **Maintained** | Deprecated | **W3C standard** | Unmaintained (2016) | Active |
| **Cornerstone Conflict** | N/A | **None** | None | Yes (canvas ownership) |
| **annotate.js Compat** | N/A | **Drop-in migration** | Event conflicts | Full replacement |
| **Browser Support** | N/A | **~97%** | ~95% | ~95% |

---

## Recommendation

**Use the Pointer Events API directly.** No additional libraries needed.

### Rationale

1. **Zero bundle size.** Critical for the PWA performance target of <2s mobile load times. Every kB matters on 3G/4G networks.

2. **Only option with pressure + stylus.** The Sprint 2 requirement for "pressure-sensitive drawing for Apple Pencil/stylus" can only be met by the Pointer Events API. Neither Hammer.js nor Fabric.js expose `pressure`, `tiltX`, `tiltY`, or `pointerType`.

3. **No architectural conflicts.** Works directly on the existing overlay canvas. No interference with Cornerstone's DICOM rendering. No canvas ownership battles.

4. **Incremental migration path.** Replace `mousedown`/`touchstart` with `pointerdown`, `mousemove`/`touchmove` with `pointermove`, `mouseup`/`touchend` with `pointerup`. The existing annotation logic stays the same.

5. **Full control over gesture disambiguation.** The medical imaging context has specific needs (e.g., stylus always draws, finger can draw or navigate depending on mode). A custom state machine can encode these rules precisely, rather than fighting a library's assumptions.

6. **Future-proof.** W3C standard with active spec development (Level 3 in progress). No risk of library abandonment.

### What We Need to Build

- **Gesture state machine** (~100-150 lines): Track active pointers, distinguish one-finger draw from two-finger zoom/pan, handle second-finger arrival during a draw.
- **Pinch-to-zoom handler** (~30 lines): Track distance between two pointers, apply scale.
- **Two-finger pan handler** (~20 lines): Track midpoint of two pointers, apply translation.
- **Pressure-sensitive line width** (~10 lines): Map `PointerEvent.pressure` to canvas `lineWidth`.
- **Stylus vs. finger mode** (~15 lines): Use `pointerType` to auto-select draw vs. navigate.

Total custom code: ~175-225 lines, zero new dependencies.

---

## Implementation Sketch

### 1. Replace Mouse/Touch Events with Pointer Events

Migrate `annotate.js` from three event systems to one:

```js
// BEFORE (annotate.js lines 223-231):
this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
this.canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));

// AFTER:
this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
this.canvas.addEventListener('pointerleave', (e) => this.onPointerUp(e));
```

Also set `touch-action: none` on the canvas CSS to prevent browser default gestures:

```css
.annotation-canvas {
  touch-action: none;
}
```

### 2. Gesture State Machine

```js
class GestureManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.pointers = new Map();       // pointerId -> {x, y, type}
    this.gesture = 'none';           // 'none' | 'draw' | 'pinch' | 'pan'
    this.gestureCommitTimer = null;
    this.initialPinchDistance = 0;
    this.initialPinchMidpoint = null;
    this.GESTURE_COMMIT_DELAY = 50;  // ms before committing to single-finger draw
  }

  onPointerDown(e) {
    this.pointers.set(e.pointerId, {
      x: e.clientX, y: e.clientY,
      type: e.pointerType,
      pressure: e.pressure
    });
    this.canvas.setPointerCapture(e.pointerId);

    if (this.pointers.size === 1) {
      // First finger/pen down -- delay commit to allow second finger
      if (e.pointerType === 'pen') {
        // Stylus: commit to draw immediately (no two-finger gestures with pen)
        this.gesture = 'draw';
        this.onDrawStart?.(e);
      } else {
        this.gestureCommitTimer = setTimeout(() => {
          if (this.pointers.size === 1) {
            this.gesture = 'draw';
            this.onDrawStart?.(e);
          }
        }, this.GESTURE_COMMIT_DELAY);
      }
    } else if (this.pointers.size === 2) {
      // Second finger arrived -- cancel any pending draw, switch to pinch/pan
      clearTimeout(this.gestureCommitTimer);
      if (this.gesture === 'draw') {
        this.onDrawCancel?.();
      }
      this.gesture = 'pinch';
      const [p1, p2] = [...this.pointers.values()];
      this.initialPinchDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      this.initialPinchMidpoint = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      };
    }
  }

  onPointerMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, {
      x: e.clientX, y: e.clientY,
      type: e.pointerType,
      pressure: e.pressure
    });

    if (this.gesture === 'draw') {
      this.onDrawMove?.(e);
    } else if (this.gesture === 'pinch' && this.pointers.size === 2) {
      const [p1, p2] = [...this.pointers.values()];
      const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const scale = distance / this.initialPinchDistance;
      const deltaX = midpoint.x - this.initialPinchMidpoint.x;
      const deltaY = midpoint.y - this.initialPinchMidpoint.y;
      this.onPinchMove?.(scale, deltaX, deltaY, midpoint);
    }
  }

  onPointerUp(e) {
    this.pointers.delete(e.pointerId);
    this.canvas.releasePointerCapture(e.pointerId);

    if (this.pointers.size === 0) {
      if (this.gesture === 'draw') {
        this.onDrawEnd?.(e);
      } else if (this.gesture === 'pinch') {
        this.onPinchEnd?.();
      }
      this.gesture = 'none';
      clearTimeout(this.gestureCommitTimer);
    }
  }
}
```

### 3. Pressure-Sensitive Drawing

```js
// In the draw move handler:
onDrawMove(e) {
  const coords = this.getCoords(e);

  if (this.currentTool === 'freehand') {
    // Use pressure for variable-width strokes
    let width = this.lineWidth;
    if (e.pointerType === 'pen' && e.pressure > 0) {
      // Scale line width: light touch = thin, hard press = thick
      width = this.lineWidth * (0.3 + e.pressure * 1.4);
    }

    // Use coalesced events for smoother curves
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ce of events) {
      const pt = this.getCoords(ce);
      this.currentPath.push({
        x: pt.x,
        y: pt.y,
        pressure: ce.pressure || 0.5,
        width: width
      });
    }
  }

  this.redraw();
  this.drawPreview(coords.x, coords.y);
}
```

### 4. Variable-Width Freehand Rendering

```js
drawFreehandPressure(path) {
  if (path.length < 2) return;

  // Draw each segment with its own width for pressure variation
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    this.ctx.beginPath();
    this.ctx.lineWidth = curr.width || this.lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.moveTo(prev.x, prev.y);
    this.ctx.lineTo(curr.x, curr.y);
    this.ctx.stroke();
  }
}
```

### 5. Stylus vs. Finger Mode Auto-Switching

```js
onPointerDown(e) {
  // Auto-switch mode based on input type
  if (e.pointerType === 'pen') {
    // Stylus always draws -- medical professional with Apple Pencil
    this.enterDrawMode();
  } else if (e.pointerType === 'touch') {
    // Finger defaults to navigation (pan/zoom) unless draw mode is active
    if (!this.drawModeForced) {
      this.enterNavigationMode();
    }
  }
  // pointerType === 'mouse' follows whatever tool is selected
}
```

### 6. Low-Latency Canvas for Stylus

```js
// Use desynchronized hint to reduce rendering latency on supported browsers
this.ctx = this.canvas.getContext('2d', { desynchronized: true });
```

This removes the canvas from the normal compositor pipeline, reducing stylus-to-screen latency by 1-2 frames -- noticeable improvement for Apple Pencil drawing.

### 7. Pinch-to-Zoom on Annotation Canvas

When in annotation mode, pinch gestures should zoom/pan the underlying DICOM image via Cornerstone:

```js
onPinchMove(scale, deltaX, deltaY, midpoint) {
  const viewport = cornerstone.getViewport(this.dicomElement);

  // Apply zoom
  viewport.scale *= scale;

  // Apply pan (convert screen px to image px)
  viewport.translation.x += deltaX / viewport.scale;
  viewport.translation.y += deltaY / viewport.scale;

  cornerstone.setViewport(this.dicomElement, viewport);

  // Reposition annotation canvas to match
  this.syncCanvasTransform(viewport);
}
```

---

## Summary

The Pointer Events API is the clear winner for RadCase's touch annotation needs. It is the only option that satisfies all Sprint 2 requirements (pressure sensitivity, stylus detection, zero bundle cost, no Cornerstone conflicts) while requiring only ~175-225 lines of custom gesture code built on top of the existing `annotate.js` architecture.
