// RadCase Annotation Engine
// Canvas-based image annotation with arrows, circles, rectangles, text, and highlighter
// Supports pressure-sensitive input (Apple Pencil / stylus) via PointerEvents

class AnnotationCanvas {
  constructor(container, imageUrl) {
    this.container = container;
    this.imageUrl = imageUrl;
    this.annotations = [];
    this.currentTool = 'arrow';
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;
    this.color = '#ef4444';
    this.lineWidth = 3;
    this.history = [];
    this.historyIndex = -1;
    this.activeTextInput = null;
    this.drawingEnabled = true; // Can be disabled by touch gesture handler

    this.init();
  }

  init() {
    // Create container structure
    this.container.innerHTML = `
      <div class="annotation-wrapper" style="position: relative; width: 100%; height: 100%;">
        <div class="annotation-toolbar">
          <div class="ann-toolbar-drag-handle" title="Drag to reposition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
          </div>
          <div class="tool-group">
            <button class="tool-btn active" data-tool="arrow" title="Arrow (A)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button class="tool-btn" data-tool="circle" title="Circle (C)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
            </button>
            <button class="tool-btn" data-tool="rect" title="Rectangle (R)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </button>
            <button class="tool-btn" data-tool="line" title="Line (L)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/></svg>
            </button>
            <button class="tool-btn" data-tool="freehand" title="Freehand (F)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </button>
            <button class="tool-btn" data-tool="highlighter" title="Highlighter (H)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="tool-btn" data-tool="text" title="Text (T)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
            </button>
          </div>
          <div class="tool-group">
            <input type="color" class="color-picker" value="#ef4444" title="Color">
            <select class="size-picker" title="Line Width">
              <option value="2">Thin</option>
              <option value="3" selected>Medium</option>
              <option value="5">Thick</option>
              <option value="8">Extra Thick</option>
            </select>
          </div>
          <div class="tool-group">
            <button class="tool-btn" data-action="undo" title="Undo (Ctrl+Z)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            </button>
            <button class="tool-btn" data-action="redo" title="Redo (Ctrl+Y)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
            </button>
            <button class="tool-btn" data-action="clear" title="Clear All">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
          <div class="tool-group">
            <button class="tool-btn save-btn" data-action="save" title="Save">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              <span>Save</span>
            </button>
          </div>
        </div>
        <div class="canvas-container" style="position: relative; overflow: hidden;">
          <img class="annotation-image" style="max-width: 100%; display: block;">
          <canvas class="annotation-canvas" style="position: absolute; top: 0; left: 0; cursor: crosshair; touch-action: none;"></canvas>
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .annotation-toolbar {
        display: flex;
        gap: 16px;
        padding: 12px;
        background: var(--bg-secondary, #12121a);
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
        flex-wrap: wrap;
      }
      .tool-group {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .ann-toolbar-drag-handle {
        display: none;
      }
      .tool-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 12px;
        min-width: 48px;
        min-height: 48px;
        border-radius: 10px;
        border: 1px solid var(--border, rgba(255,255,255,0.1));
        background: rgba(255, 255, 255, 0.05);
        color: #a1a1aa;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.2s;
        flex-shrink: 0;
      }
      .tool-btn:active {
        transform: scale(0.95);
      }
      .tool-btn:hover {
        border-color: #6366f1;
      }
      .tool-btn.active {
        background: rgba(99, 102, 241, 0.3);
        border-color: #6366f1;
        color: #818cf8;
      }
      .save-btn {
        background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
        border: none !important;
        color: #fff !important;
        padding: 8px 16px !important;
      }
      .color-picker {
        width: 40px;
        height: 36px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        background: transparent;
      }
      .size-picker {
        padding: 8px;
        border-radius: 8px;
        border: 1px solid var(--border, rgba(255,255,255,0.1));
        background: var(--bg-tertiary, #1a1a25);
        color: var(--text-primary, #f4f4f5);
      }
      .canvas-container {
        background: #000;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 400px;
      }
      .annotation-text-input {
        position: absolute;
        background: rgba(0, 0, 0, 0.85);
        border: 2px solid var(--accent, #6366f1);
        border-radius: 4px;
        color: #fff;
        font-family: Inter, sans-serif;
        font-weight: bold;
        font-size: 16px;
        padding: 4px 8px;
        min-width: 100px;
        outline: none;
        z-index: 10;
      }

      /* Mobile responsive annotations — floating toolbar handled in mobile.css */
      @media (max-width: 768px) {
        .canvas-container {
          min-height: 300px;
        }
      }
    `;
    document.head.appendChild(style);

    // Get elements
    this.wrapper = this.container.querySelector('.annotation-wrapper');
    this.toolbar = this.container.querySelector('.annotation-toolbar');
    this.canvasContainer = this.container.querySelector('.canvas-container');
    this.image = this.container.querySelector('.annotation-image');
    this.canvas = this.container.querySelector('.annotation-canvas');
    this.ctx = this.canvas.getContext('2d');

    // Load image
    this.image.onload = () => this.setupCanvas();
    this.image.src = this.imageUrl;

    // Event listeners
    this.setupEventListeners();
  }

  setupCanvas() {
    const rect = this.image.getBoundingClientRect();
    this.canvas.width = this.image.naturalWidth;
    this.canvas.height = this.image.naturalHeight;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.redraw();
  }

  setupEventListeners() {
    // Tool buttons
    this.toolbar.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.toolbar.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTool = btn.dataset.tool;
      });
    });

    // Action buttons
    this.toolbar.querySelectorAll('.tool-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        switch (btn.dataset.action) {
          case 'undo': this.undo(); break;
          case 'redo': this.redo(); break;
          case 'clear': this.clear(); break;
          case 'save': this.save(); break;
        }
      });
    });

    // Color picker
    this.toolbar.querySelector('.color-picker').addEventListener('change', (e) => {
      this.color = e.target.value;
    });

    // Size picker
    this.toolbar.querySelector('.size-picker').addEventListener('change', (e) => {
      this.lineWidth = parseInt(e.target.value);
    });

    // Pointer events (unified mouse + touch + stylus)
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointerleave', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); this.undo(); }
        if (e.key === 'y') { e.preventDefault(); this.redo(); }
      } else {
        switch (e.key.toLowerCase()) {
          case 'a': this.setTool('arrow'); break;
          case 'c': this.setTool('circle'); break;
          case 'r': this.setTool('rect'); break;
          case 'l': this.setTool('line'); break;
          case 'f': this.setTool('freehand'); break;
          case 'h': this.setTool('highlighter'); break;
          case 't': this.setTool('text'); break;
        }
      }
    });

    // Resize handler
    window.addEventListener('resize', () => {
      const rect = this.image.getBoundingClientRect();
      this.canvas.style.width = rect.width + 'px';
      this.canvas.style.height = rect.height + 'px';
    });

    // Mobile: make toolbar draggable via the drag handle
    this.setupToolbarDrag();
  }

  setupToolbarDrag() {
    const handle = this.toolbar.querySelector('.ann-toolbar-drag-handle');
    if (!handle) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;

    const onStart = (e) => {
      // Only enable drag on mobile (floating toolbar)
      if (!window.matchMedia('(max-width: 768px)').matches) return;
      isDragging = true;
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      const rect = this.toolbar.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      this.toolbar.style.left = Math.max(0, origLeft + dx) + 'px';
      this.toolbar.style.top = Math.max(0, origTop + dy) + 'px';
      this.toolbar.style.right = 'auto';
      this.toolbar.style.bottom = 'auto';
      e.preventDefault();
    };

    const onEnd = () => { isDragging = false; };

    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  }

  setTool(tool) {
    this.currentTool = tool;
    this.toolbar.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
  }

  getCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  // Compute effective lineWidth from pointer pressure.
  // For mouse (pointerType "mouse"), pressure is typically 0 or 0.5 — use default lineWidth.
  // For pen/touch with real pressure data, scale from 1px (at pressure 0.1) to lineWidth*2 (at pressure 1.0).
  getPressureWidth(e, baseWidth) {
    if (e.pointerType !== 'pen') {
      return baseWidth;
    }
    const pressure = e.pressure;
    if (pressure <= 0) return baseWidth;
    const clamped = Math.max(0.1, Math.min(1.0, pressure));
    // Linear interpolation: 0.1 -> 1px, 1.0 -> baseWidth * 2
    return 1 + ((clamped - 0.1) / 0.9) * (baseWidth * 2 - 1);
  }

  onPointerDown(e) {
    // Ignore multi-touch — let touch-gestures.js handle pinch/pan
    if (e.pointerType === 'touch' && this._activePointerId != null) return;
    if (!this.drawingEnabled && e.pointerType === 'touch') return;

    e.preventDefault();
    // Capture the pointer so we get events even if it leaves the canvas
    this.canvas.setPointerCapture(e.pointerId);
    this._activePointerId = e.pointerId;

    const coords = this.getCoords(e);
    this.isDrawing = true;
    this.startX = coords.x;
    this.startY = coords.y;

    if (this.currentTool === 'text') {
      this.isDrawing = false;
      this.showTextInput(e, coords);
    } else if (this.currentTool === 'freehand') {
      const pw = this.getPressureWidth(e, this.lineWidth);
      this.currentPath = [{ x: coords.x, y: coords.y, width: pw }];
    } else if (this.currentTool === 'highlighter') {
      const pw = this.getPressureWidth(e, this.lineWidth * 3);
      this.currentPath = [{ x: coords.x, y: coords.y, width: pw }];
    }
  }

  onPointerMove(e) {
    if (!this.isDrawing || e.pointerId !== this._activePointerId) return;
    e.preventDefault();
    const coords = this.getCoords(e);

    if (this.currentTool === 'freehand') {
      const pw = this.getPressureWidth(e, this.lineWidth);
      this.currentPath.push({ x: coords.x, y: coords.y, width: pw });
    } else if (this.currentTool === 'highlighter') {
      const pw = this.getPressureWidth(e, this.lineWidth * 3);
      this.currentPath.push({ x: coords.x, y: coords.y, width: pw });
    }

    this.redraw();
    this.drawPreview(coords.x, coords.y, e);
  }

  onPointerUp(e) {
    if (!this.isDrawing || e.pointerId !== this._activePointerId) return;
    this._activePointerId = null;
    const coords = this.getCoords(e);
    this.isDrawing = false;

    if (this.currentTool === 'freehand' && this.currentPath) {
      this.addAnnotation({
        type: 'freehand',
        path: this.currentPath,
        color: this.color,
        lineWidth: this.lineWidth
      });
      this.currentPath = null;
    } else if (this.currentTool === 'highlighter' && this.currentPath) {
      this.addAnnotation({
        type: 'highlighter',
        path: this.currentPath,
        color: '#facc15', // yellow default for highlighter
        lineWidth: this.lineWidth * 3
      });
      this.currentPath = null;
    } else if (this.currentTool !== 'text') {
      this.addAnnotation({
        type: this.currentTool,
        startX: this.startX,
        startY: this.startY,
        endX: coords.x,
        endY: coords.y,
        color: this.color,
        lineWidth: this.lineWidth
      });
    }
  }

  // Text tool: show an inline input overlay instead of prompt()
  showTextInput(pointerEvent, coords) {
    if (this.activeTextInput) {
      this.commitTextInput();
    }

    const canvasRect = this.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.canvas.width;
    const scaleY = canvasRect.height / this.canvas.height;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'annotation-text-input';
    input.style.left = (canvasRect.left - this.canvasContainer.getBoundingClientRect().left + (coords.x / this.canvas.width) * canvasRect.width) + 'px';
    input.style.top = (canvasRect.top - this.canvasContainer.getBoundingClientRect().top + (coords.y / this.canvas.height) * canvasRect.height) + 'px';
    input.style.color = this.color;

    this.canvasContainer.appendChild(input);
    this.activeTextInput = { input, coords, color: this.color };

    // Focus after a microtask so the pointerdown doesn't steal it
    requestAnimationFrame(() => input.focus());

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitTextInput();
      } else if (e.key === 'Escape') {
        this.cancelTextInput();
      }
    });

    input.addEventListener('blur', () => {
      // Slight delay to allow Enter keydown to fire first
      setTimeout(() => {
        if (this.activeTextInput && this.activeTextInput.input === input) {
          this.commitTextInput();
        }
      }, 100);
    });
  }

  commitTextInput() {
    if (!this.activeTextInput) return;
    const { input, coords, color } = this.activeTextInput;
    const text = input.value.trim();
    if (text) {
      const fontSize = Math.max(16, Math.min(20, this.lineWidth * 5));
      this.addAnnotation({
        type: 'text',
        x: coords.x,
        y: coords.y,
        text,
        color,
        fontSize
      });
    }
    input.remove();
    this.activeTextInput = null;
  }

  cancelTextInput() {
    if (!this.activeTextInput) return;
    this.activeTextInput.input.remove();
    this.activeTextInput = null;
  }

  addAnnotation(annotation) {
    // Remove any redo history
    this.annotations = this.annotations.slice(0, this.historyIndex + 1);
    this.annotations.push(annotation);
    this.historyIndex = this.annotations.length - 1;
    this.redraw();
  }

  undo() {
    if (this.historyIndex >= 0) {
      this.historyIndex--;
      this.redraw();
    }
  }

  redo() {
    if (this.historyIndex < this.annotations.length - 1) {
      this.historyIndex++;
      this.redraw();
    }
  }

  clear() {
    if (confirm('Clear all annotations?')) {
      this.annotations = [];
      this.historyIndex = -1;
      this.redraw();
    }
  }

  save() {
    const data = this.annotations.slice(0, this.historyIndex + 1);
    if (navigator.onLine) {
      if (this.onSave) {
        this.onSave(data);
      }
    } else {
      this.saveOffline(data);
    }
    return data;
  }

  async saveOffline(data) {
    const record = {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      image_id: this.imageId || null,
      case_id: this.caseId || null,
      annotations: data,
      timestamp: Date.now()
    };
    try {
      const db = await this.openOfflineDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('pending-annotations', 'readwrite');
        const store = tx.objectStore('pending-annotations');
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      });
      // Register background sync
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register('sync-annotations');
      }
      if (typeof toast === 'function') {
        toast('Annotations saved offline — will sync when online', 'info');
      }
    } catch (err) {
      console.error('Failed to save annotations offline:', err);
      if (typeof toast === 'function') {
        toast('Failed to save annotations offline', 'error');
      }
    }
  }

  openOfflineDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('radcase-offline', 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const name of ['pending-progress', 'pending-annotations', 'offline-cases']) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  load(annotations) {
    this.annotations = annotations || [];
    this.historyIndex = this.annotations.length - 1;
    this.redraw();
  }

  redraw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = 0; i <= this.historyIndex; i++) {
      this.drawAnnotation(this.annotations[i]);
    }
  }

  drawPreview(endX, endY, pointerEvent) {
    if (this.currentTool === 'freehand' && this.currentPath) {
      this.drawFreehand(this.currentPath, this.color, this.lineWidth);
    } else if (this.currentTool === 'highlighter' && this.currentPath) {
      this.drawHighlighter(this.currentPath, '#facc15', this.lineWidth * 3);
    } else {
      this.drawAnnotation({
        type: this.currentTool,
        startX: this.startX,
        startY: this.startY,
        endX,
        endY,
        color: this.color,
        lineWidth: this.lineWidth
      });
    }
  }

  drawAnnotation(ann) {
    this.ctx.strokeStyle = ann.color;
    this.ctx.fillStyle = ann.color;
    this.ctx.lineWidth = ann.lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.globalAlpha = 1.0;

    switch (ann.type) {
      case 'arrow':
        this.drawArrow(ann.startX, ann.startY, ann.endX, ann.endY);
        break;
      case 'circle':
        this.drawCircle(ann.startX, ann.startY, ann.endX, ann.endY);
        break;
      case 'rect':
        this.drawRect(ann.startX, ann.startY, ann.endX, ann.endY);
        break;
      case 'line':
        this.drawLine(ann.startX, ann.startY, ann.endX, ann.endY);
        break;
      case 'freehand':
        this.drawFreehand(ann.path, ann.color, ann.lineWidth);
        break;
      case 'highlighter':
        this.drawHighlighter(ann.path, ann.color, ann.lineWidth);
        break;
      case 'text':
        this.drawText(ann.x, ann.y, ann.text, ann.fontSize, ann.color);
        break;
    }

    // Reset alpha after drawing
    this.ctx.globalAlpha = 1.0;
  }

  drawArrow(fromX, fromY, toX, toY) {
    const headLen = 15 + this.lineWidth * 2;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    this.ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    this.ctx.closePath();
    this.ctx.fill();
  }

  drawCircle(startX, startY, endX, endY) {
    const radiusX = Math.abs(endX - startX) / 2;
    const radiusY = Math.abs(endY - startY) / 2;
    const centerX = Math.min(startX, endX) + radiusX;
    const centerY = Math.min(startY, endY) + radiusY;

    this.ctx.beginPath();
    this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    this.ctx.stroke();
  }

  drawRect(startX, startY, endX, endY) {
    this.ctx.beginPath();
    this.ctx.strokeRect(startX, startY, endX - startX, endY - startY);
  }

  drawLine(startX, startY, endX, endY) {
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();
  }

  drawFreehand(path, color, lineWidth) {
    if (path.length < 2) return;

    this.ctx.strokeStyle = color;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // If path points have per-point width data (pressure-sensitive),
    // draw segment by segment with varying width.
    const hasPressure = path[0].width !== undefined;

    if (hasPressure) {
      for (let i = 1; i < path.length; i++) {
        this.ctx.beginPath();
        this.ctx.lineWidth = path[i].width;
        this.ctx.moveTo(path[i - 1].x, path[i - 1].y);
        this.ctx.lineTo(path[i].x, path[i].y);
        this.ctx.stroke();
      }
    } else {
      // Legacy path without pressure data
      this.ctx.lineWidth = lineWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        this.ctx.lineTo(path[i].x, path[i].y);
      }
      this.ctx.stroke();
    }
  }

  drawHighlighter(path, color, lineWidth) {
    if (path.length < 2) return;

    this.ctx.save();
    this.ctx.globalAlpha = 0.3;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.strokeStyle = color;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    const hasPressure = path[0].width !== undefined;

    if (hasPressure) {
      for (let i = 1; i < path.length; i++) {
        this.ctx.beginPath();
        this.ctx.lineWidth = path[i].width;
        this.ctx.moveTo(path[i - 1].x, path[i - 1].y);
        this.ctx.lineTo(path[i].x, path[i].y);
        this.ctx.stroke();
      }
    } else {
      this.ctx.lineWidth = lineWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        this.ctx.lineTo(path[i].x, path[i].y);
      }
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  drawText(x, y, text, fontSize, color) {
    this.ctx.font = `bold ${fontSize}px Inter, sans-serif`;

    // Draw background
    const metrics = this.ctx.measureText(text);
    const padding = 6;
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(
      x - padding,
      y - fontSize - padding,
      metrics.width + padding * 2,
      fontSize + padding * 2
    );

    // Draw text
    this.ctx.fillStyle = color || this.color;
    this.ctx.fillText(text, x, y);
  }

  // Export annotated image
  exportImage() {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = this.canvas.width;
    exportCanvas.height = this.canvas.height;
    const exportCtx = exportCanvas.getContext('2d');

    // Draw original image
    exportCtx.drawImage(this.image, 0, 0);

    // Draw annotations
    exportCtx.drawImage(this.canvas, 0, 0);

    return exportCanvas.toDataURL('image/png');
  }
}

// Export for use
window.AnnotationCanvas = AnnotationCanvas;
