// RadCase Annotation Engine
// Canvas-based image annotation with arrows, circles, rectangles, and text

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
    
    this.init();
  }

  init() {
    // Create container structure
    this.container.innerHTML = `
      <div class="annotation-wrapper" style="position: relative; width: 100%; height: 100%;">
        <div class="annotation-toolbar">
          <div class="tool-group">
            <button class="tool-btn active" data-tool="arrow" title="Arrow (A)">➡️</button>
            <button class="tool-btn" data-tool="circle" title="Circle (C)">⭕</button>
            <button class="tool-btn" data-tool="rect" title="Rectangle (R)">⬜</button>
            <button class="tool-btn" data-tool="line" title="Line (L)">📏</button>
            <button class="tool-btn" data-tool="freehand" title="Freehand (F)">✏️</button>
            <button class="tool-btn" data-tool="text" title="Text (T)">💬</button>
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
            <button class="tool-btn" data-action="undo" title="Undo (Ctrl+Z)">↩️</button>
            <button class="tool-btn" data-action="redo" title="Redo (Ctrl+Y)">↪️</button>
            <button class="tool-btn" data-action="clear" title="Clear All">🗑️</button>
          </div>
          <div class="tool-group">
            <button class="tool-btn save-btn" data-action="save" title="Save">💾 Save</button>
          </div>
        </div>
        <div class="canvas-container" style="position: relative; overflow: hidden;">
          <img class="annotation-image" style="max-width: 100%; display: block;">
          <canvas class="annotation-canvas" style="position: absolute; top: 0; left: 0; cursor: crosshair;"></canvas>
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
      .tool-btn {
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid var(--border, rgba(255,255,255,0.1));
        background: var(--bg-tertiary, #1a1a25);
        color: var(--text-primary, #f4f4f5);
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.2s;
      }
      .tool-btn:hover {
        border-color: var(--accent, #6366f1);
      }
      .tool-btn.active {
        background: var(--accent, #6366f1);
        border-color: var(--accent, #6366f1);
      }
      .save-btn {
        background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
        border: none !important;
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

      /* Mobile responsive annotations */
      @media (max-width: 768px) {
        .annotation-toolbar {
          padding: 8px;
          gap: 8px;
        }
        .tool-group {
          gap: 6px;
        }
        .tool-btn {
          padding: 10px 14px;
          min-height: 44px;
          min-width: 44px;
          font-size: 1.1rem;
        }
        .save-btn {
          width: 100%;
          margin-top: 8px;
        }
        .tool-group:last-child {
          width: 100%;
        }
        .canvas-container {
          min-height: 300px;
        }
      }

      @media (max-width: 480px) {
        .annotation-toolbar {
          flex-direction: column;
          gap: 8px;
        }
        .tool-group {
          width: 100%;
          justify-content: space-between;
        }
        .tool-btn {
          flex: 1;
          padding: 12px 8px;
          font-size: 0.9rem;
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

    // Canvas events
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
    this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
    this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));

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

  onMouseDown(e) {
    const coords = this.getCoords(e);
    this.isDrawing = true;
    this.startX = coords.x;
    this.startY = coords.y;

    if (this.currentTool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        this.addAnnotation({
          type: 'text',
          x: coords.x,
          y: coords.y,
          text,
          color: this.color,
          fontSize: this.lineWidth * 6
        });
      }
      this.isDrawing = false;
    } else if (this.currentTool === 'freehand') {
      this.currentPath = [{ x: coords.x, y: coords.y }];
    }
  }

  onMouseMove(e) {
    if (!this.isDrawing) return;
    const coords = this.getCoords(e);

    if (this.currentTool === 'freehand') {
      this.currentPath.push({ x: coords.x, y: coords.y });
    }

    this.redraw();
    this.drawPreview(coords.x, coords.y);
  }

  onMouseUp(e) {
    if (!this.isDrawing) return;
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

  onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
  }

  onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
  }

  onTouchEnd(e) {
    e.preventDefault();
    this.onMouseUp(e);
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
    if (this.onSave) {
      this.onSave(data);
    }
    return data;
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

  drawPreview(endX, endY) {
    if (this.currentTool === 'freehand' && this.currentPath) {
      this.drawFreehand(this.currentPath, this.color, this.lineWidth);
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
      case 'text':
        this.drawText(ann.x, ann.y, ann.text, ann.fontSize);
        break;
    }
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
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(path[0].x, path[0].y);
    
    for (let i = 1; i < path.length; i++) {
      this.ctx.lineTo(path[i].x, path[i].y);
    }
    this.ctx.stroke();
  }

  drawText(x, y, text, fontSize) {
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
    this.ctx.fillStyle = this.color;
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
