// RadCase Touch Gesture Handler - Sprint 2 Advanced Mobile UX
// Multi-touch gestures for DICOM viewing and annotation on mobile/tablet

class TouchGestureHandler {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      pinchZoomEnabled: true,
      twoFingerPanEnabled: true,
      singleTouchDrawEnabled: true,
      windowLevelEnabled: true,
      palmRejectionEnabled: true,
      palmRejectionThreshold: 50, // mm - touches wider than this are rejected
      minPinchDistance: 10,
      ...options
    };

    // State tracking
    this.activeTouches = new Map();
    this.gestureState = 'idle'; // idle, pinch, pan, draw, windowlevel
    this.currentMode = 'scroll'; // scroll, annotate, windowlevel, pan, zoom

    // Pinch zoom state
    this.initialPinchDistance = 0;
    this.initialScale = 1;
    this.currentScale = 1;

    // Pan state
    this.panStartX = 0;
    this.panStartY = 0;
    this.panOffsetX = 0;
    this.panOffsetY = 0;

    // Window/Level state
    this.wlStartX = 0;
    this.wlStartY = 0;
    this.initialWindow = 400;
    this.initialLevel = 40;

    // Drawing state
    this.drawingPath = [];
    this.isDrawing = false;

    // Undo/redo
    this.undoStack = [];
    this.redoStack = [];

    // Callbacks
    this.onZoom = options.onZoom || null;
    this.onPan = options.onPan || null;
    this.onWindowLevel = options.onWindowLevel || null;
    this.onDrawStart = options.onDrawStart || null;
    this.onDrawMove = options.onDrawMove || null;
    this.onDrawEnd = options.onDrawEnd || null;
    this.onSliceScroll = options.onSliceScroll || null;
    this.onGestureChange = options.onGestureChange || null;

    this.init();
  }

  init() {
    if (!this.element) return;

    // Prevent default touch behaviors on the element
    this.element.style.touchAction = 'none';
    this.element.style.userSelect = 'none';
    this.element.style.webkitUserSelect = 'none';

    this.boundHandlers = {
      touchstart: this.handleTouchStart.bind(this),
      touchmove: this.handleTouchMove.bind(this),
      touchend: this.handleTouchEnd.bind(this),
      touchcancel: this.handleTouchCancel.bind(this)
    };

    this.element.addEventListener('touchstart', this.boundHandlers.touchstart, { passive: false });
    this.element.addEventListener('touchmove', this.boundHandlers.touchmove, { passive: false });
    this.element.addEventListener('touchend', this.boundHandlers.touchend, { passive: false });
    this.element.addEventListener('touchcancel', this.boundHandlers.touchcancel, { passive: false });

    // Create and inject the touch toolbar
    this.createToolbar();
  }

  // Palm rejection - detect if touch is from a resting palm
  isPalmTouch(touch) {
    if (!this.options.palmRejectionEnabled) return false;

    // Use touch radiusX/radiusY if available (large contact = palm)
    if (touch.radiusX && touch.radiusY) {
      const radius = Math.max(touch.radiusX, touch.radiusY);
      if (radius > this.options.palmRejectionThreshold) return true;
    }

    // Use force if available (very light touches are likely accidental)
    if (touch.force !== undefined && touch.force > 0 && touch.force < 0.05) return true;

    return false;
  }

  handleTouchStart(e) {
    e.preventDefault();

    const validTouches = [];
    for (const touch of e.changedTouches) {
      if (!this.isPalmTouch(touch)) {
        validTouches.push(touch);
        this.activeTouches.set(touch.identifier, {
          startX: touch.clientX,
          startY: touch.clientY,
          currentX: touch.clientX,
          currentY: touch.clientY,
          startTime: Date.now()
        });
      }
    }

    if (validTouches.length === 0) return;

    const touchCount = this.activeTouches.size;

    if (touchCount >= 2) {
      // Two or more fingers: pinch-zoom or two-finger pan
      this.startMultiTouchGesture();
    } else if (touchCount === 1) {
      // Single finger: depends on current mode
      this.startSingleTouchGesture(validTouches[0]);
    }
  }

  handleTouchMove(e) {
    e.preventDefault();

    for (const touch of e.changedTouches) {
      const tracked = this.activeTouches.get(touch.identifier);
      if (tracked) {
        tracked.currentX = touch.clientX;
        tracked.currentY = touch.clientY;
      }
    }

    const touchCount = this.activeTouches.size;

    if (touchCount >= 2) {
      this.handleMultiTouchMove();
    } else if (touchCount === 1) {
      this.handleSingleTouchMove();
    }
  }

  handleTouchEnd(e) {
    for (const touch of e.changedTouches) {
      this.activeTouches.delete(touch.identifier);
    }

    if (this.activeTouches.size === 0) {
      this.endGesture();
    } else if (this.activeTouches.size === 1 && this.gestureState === 'pinch') {
      // Transitioned from pinch to single touch - reset
      this.gestureState = 'idle';
    }
  }

  handleTouchCancel(e) {
    for (const touch of e.changedTouches) {
      this.activeTouches.delete(touch.identifier);
    }
    if (this.activeTouches.size === 0) {
      this.gestureState = 'idle';
    }
  }

  // Multi-touch gesture handling
  startMultiTouchGesture() {
    const touches = Array.from(this.activeTouches.values());
    if (touches.length < 2) return;

    this.initialPinchDistance = this.getDistance(touches[0], touches[1]);
    this.initialScale = this.currentScale;
    this.panStartX = (touches[0].currentX + touches[1].currentX) / 2;
    this.panStartY = (touches[0].currentY + touches[1].currentY) / 2;
    this.gestureState = 'pinch';
  }

  handleMultiTouchMove() {
    const touches = Array.from(this.activeTouches.values());
    if (touches.length < 2) return;

    const currentDistance = this.getDistance(touches[0], touches[1]);
    const midX = (touches[0].currentX + touches[1].currentX) / 2;
    const midY = (touches[0].currentY + touches[1].currentY) / 2;

    if (this.options.pinchZoomEnabled && this.gestureState === 'pinch') {
      // Pinch zoom
      const scale = currentDistance / this.initialPinchDistance;
      this.currentScale = Math.max(0.5, Math.min(5, this.initialScale * scale));

      if (this.onZoom) {
        this.onZoom(this.currentScale, midX, midY);
      }
    }

    if (this.options.twoFingerPanEnabled) {
      // Two-finger pan
      const dx = midX - this.panStartX;
      const dy = midY - this.panStartY;

      if (this.onPan) {
        this.onPan(dx, dy);
      }

      this.panStartX = midX;
      this.panStartY = midY;
    }
  }

  // Single-touch gesture handling
  startSingleTouchGesture(touch) {
    const data = this.activeTouches.get(touch.identifier);
    if (!data) return;

    switch (this.currentMode) {
      case 'annotate':
        this.gestureState = 'draw';
        this.isDrawing = true;
        this.drawingPath = [{ x: data.startX, y: data.startY }];
        if (this.onDrawStart) {
          this.onDrawStart(data.startX, data.startY);
        }
        break;

      case 'windowlevel':
        this.gestureState = 'windowlevel';
        this.wlStartX = data.startX;
        this.wlStartY = data.startY;
        break;

      case 'scroll':
        this.gestureState = 'scroll';
        this.scrollStartY = data.startY;
        this.lastSliceChangeY = data.startY;
        break;

      case 'pan':
        this.gestureState = 'pan';
        this.panStartX = data.startX;
        this.panStartY = data.startY;
        break;

      case 'zoom':
        this.gestureState = 'zoom';
        this.zoomStartY = data.startY;
        break;
    }
  }

  handleSingleTouchMove() {
    const touches = Array.from(this.activeTouches.values());
    if (touches.length !== 1) return;

    const touch = touches[0];

    switch (this.gestureState) {
      case 'draw':
        this.drawingPath.push({ x: touch.currentX, y: touch.currentY });
        if (this.onDrawMove) {
          this.onDrawMove(touch.currentX, touch.currentY, this.drawingPath);
        }
        break;

      case 'windowlevel':
        if (this.onWindowLevel) {
          // Horizontal = level, Vertical = window
          const dx = touch.currentX - this.wlStartX;
          const dy = this.wlStartY - touch.currentY; // Inverted Y
          this.onWindowLevel(dx, dy);
          this.wlStartX = touch.currentX;
          this.wlStartY = touch.currentY;
        }
        break;

      case 'scroll':
        if (this.onSliceScroll) {
          const dy = this.lastSliceChangeY - touch.currentY;
          const threshold = 25;
          if (Math.abs(dy) >= threshold) {
            this.onSliceScroll(Math.sign(dy));
            this.lastSliceChangeY = touch.currentY;
          }
        }
        break;

      case 'pan':
        if (this.onPan) {
          const dx = touch.currentX - this.panStartX;
          const dy = touch.currentY - this.panStartY;
          this.onPan(dx, dy);
          this.panStartX = touch.currentX;
          this.panStartY = touch.currentY;
        }
        break;

      case 'zoom':
        if (this.onZoom) {
          const dy = this.zoomStartY - touch.currentY;
          const scaleDelta = 1 + (dy * 0.005);
          this.currentScale = Math.max(0.5, Math.min(5, this.currentScale * scaleDelta));
          this.onZoom(this.currentScale);
          this.zoomStartY = touch.currentY;
        }
        break;
    }
  }

  endGesture() {
    if (this.gestureState === 'draw' && this.isDrawing) {
      this.isDrawing = false;
      if (this.drawingPath.length > 1) {
        this.undoStack.push([...this.drawingPath]);
        this.redoStack = [];
      }
      if (this.onDrawEnd) {
        this.onDrawEnd(this.drawingPath);
      }
      this.drawingPath = [];
    }
    this.gestureState = 'idle';
  }

  // Undo/redo
  undo() {
    if (this.undoStack.length === 0) return null;
    const path = this.undoStack.pop();
    this.redoStack.push(path);
    return path;
  }

  redo() {
    if (this.redoStack.length === 0) return null;
    const path = this.redoStack.pop();
    this.undoStack.push(path);
    return path;
  }

  // Mode switching
  setMode(mode) {
    this.currentMode = mode;
    this.gestureState = 'idle';
    this.updateToolbarActive(mode);
    if (this.onGestureChange) {
      this.onGestureChange(mode);
    }
  }

  // Toolbar creation
  createToolbar() {
    if (this.toolbar) return;

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'touch-toolbar';
    this.toolbar.innerHTML = `
      <button class="touch-tool-btn active" data-mode="scroll" title="Scroll Slices">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 3v18M12 3l-4 4M12 3l4 4M12 21l-4-4M12 21l4-4"/>
        </svg>
      </button>
      <button class="touch-tool-btn" data-mode="windowlevel" title="Window/Level">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a10 10 0 0 1 0 20"/>
        </svg>
      </button>
      <button class="touch-tool-btn" data-mode="pan" title="Pan">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
        </svg>
      </button>
      <button class="touch-tool-btn" data-mode="zoom" title="Zoom">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
        </svg>
      </button>
      <button class="touch-tool-btn" data-mode="annotate" title="Annotate">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
      </button>
      <div class="touch-tool-separator"></div>
      <button class="touch-tool-btn" data-action="undo" title="Undo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7v6h6"/>
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
        </svg>
      </button>
      <button class="touch-tool-btn" data-action="redo" title="Redo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 7v6h-6"/>
          <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
        </svg>
      </button>
    `;

    // Inject toolbar styles
    this.injectStyles();

    // Event listeners for toolbar buttons
    this.toolbar.querySelectorAll('.touch-tool-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setMode(btn.dataset.mode);
      });
    });

    this.toolbar.querySelectorAll('.touch-tool-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.dataset.action === 'undo') this.undo();
        if (btn.dataset.action === 'redo') this.redo();
      });
    });

    // Only show on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      this.element.parentElement?.appendChild(this.toolbar);
    }
  }

  updateToolbarActive(mode) {
    if (!this.toolbar) return;
    this.toolbar.querySelectorAll('.touch-tool-btn[data-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  injectStyles() {
    if (document.getElementById('touch-gesture-styles')) return;

    const style = document.createElement('style');
    style.id = 'touch-gesture-styles';
    style.textContent = `
      .touch-toolbar {
        display: flex;
        gap: 4px;
        padding: 8px;
        background: rgba(18, 18, 26, 0.95);
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .touch-toolbar::-webkit-scrollbar { display: none; }

      .touch-tool-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 48px;
        min-height: 48px;
        width: 48px;
        height: 48px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px;
        color: #a1a1aa;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
        padding: 0;
      }
      .touch-tool-btn:active {
        transform: scale(0.95);
      }
      .touch-tool-btn.active {
        background: rgba(99, 102, 241, 0.3);
        border-color: #6366f1;
        color: #818cf8;
      }
      .touch-tool-separator {
        width: 1px;
        background: rgba(255, 255, 255, 0.1);
        margin: 4px 4px;
        flex-shrink: 0;
      }

      /* Gesture feedback overlay */
      .gesture-feedback {
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.75);
        color: #fff;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 13px;
        pointer-events: none;
        z-index: 100;
        opacity: 0;
        transition: opacity 0.2s;
      }
      .gesture-feedback.visible {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }

  // Utility
  getDistance(t1, t2) {
    const dx = t1.currentX - t2.currentX;
    const dy = t1.currentY - t2.currentY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  destroy() {
    if (this.element) {
      this.element.removeEventListener('touchstart', this.boundHandlers.touchstart);
      this.element.removeEventListener('touchmove', this.boundHandlers.touchmove);
      this.element.removeEventListener('touchend', this.boundHandlers.touchend);
      this.element.removeEventListener('touchcancel', this.boundHandlers.touchcancel);
    }
    if (this.toolbar && this.toolbar.parentElement) {
      this.toolbar.remove();
    }
  }
}


// Integration helper: wire TouchGestureHandler to an existing DicomViewer instance
function integrateTouchGestures(dicomViewerInstance) {
  if (!dicomViewerInstance || !dicomViewerInstance.container) return null;

  const viewerElement = dicomViewerInstance.container.querySelector('.dicom-canvas-container')
    || dicomViewerInstance.container.querySelector('.dicom-element');

  if (!viewerElement) return null;

  const handler = new TouchGestureHandler(viewerElement, {
    onZoom: (scale, cx, cy) => {
      try {
        const el = dicomViewerInstance.getElement();
        if (!el) return;
        const viewport = cornerstone.getViewport(el);
        viewport.scale = scale;
        cornerstone.setViewport(el, viewport);
      } catch (e) {}
    },
    onPan: (dx, dy) => {
      try {
        const el = dicomViewerInstance.getElement();
        if (!el) return;
        const viewport = cornerstone.getViewport(el);
        viewport.translation.x += dx;
        viewport.translation.y += dy;
        cornerstone.setViewport(el, viewport);
      } catch (e) {}
    },
    onWindowLevel: (dLevel, dWindow) => {
      try {
        const el = dicomViewerInstance.getElement();
        if (!el) return;
        const viewport = cornerstone.getViewport(el);
        viewport.voi.windowCenter += dLevel;
        viewport.voi.windowWidth += dWindow;
        viewport.voi.windowWidth = Math.max(1, viewport.voi.windowWidth);
        cornerstone.setViewport(el, viewport);
      } catch (e) {}
    },
    onSliceScroll: (direction) => {
      if (direction > 0) {
        dicomViewerInstance.nextSlice();
      } else {
        dicomViewerInstance.previousSlice();
      }
    },
    onGestureChange: (mode) => {
      // Sync with DicomViewer tool buttons
      const toolMap = { scroll: 'scroll', windowlevel: 'wwwc', pan: 'pan', zoom: 'zoom' };
      if (toolMap[mode]) {
        dicomViewerInstance.setActiveTool(toolMap[mode]);
      }
    }
  });

  return handler;
}

// Wire a TouchGestureHandler to an AnnotationCanvas so modes don't conflict.
// When the touch toolbar is in 'annotate' mode, the annotation canvas receives
// drawing events. In all other modes, annotation drawing is disabled and
// gestures (zoom, pan, window/level) are handled by the touch handler.
function integrateAnnotationCanvas(touchHandler, annotationCanvas) {
  if (!touchHandler || !annotationCanvas) return;

  // Listen for mode changes on the touch handler
  const origOnGestureChange = touchHandler.onGestureChange;
  touchHandler.onGestureChange = (mode) => {
    annotationCanvas.drawingEnabled = (mode === 'annotate');

    // When entering annotate mode, show the annotation toolbar
    const toolbar = annotationCanvas.toolbar;
    if (toolbar) {
      toolbar.style.display = (mode === 'annotate') ? '' : 'none';
    }

    // Chain the original callback
    if (origOnGestureChange) origOnGestureChange(mode);
  };

  // Set initial state based on current mode
  annotationCanvas.drawingEnabled = (touchHandler.currentMode === 'annotate');
}

// Export
window.TouchGestureHandler = TouchGestureHandler;
window.integrateTouchGestures = integrateTouchGestures;
window.integrateAnnotationCanvas = integrateAnnotationCanvas;
