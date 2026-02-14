// DICOM Viewer Module for RadCase
// Uses Cornerstone.js for DICOM rendering

class DicomViewer {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = null;
    this.element = null;
    this.imageIds = [];
    this.currentIndex = 0;
    this.stack = null;
    this.isInitialized = false;
    this.windowWidth = 400;
    this.windowCenter = 40;
  }

  async init() {
    if (this.isInitialized) return;
    
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.error('DICOM viewer container not found:', this.containerId);
      return;
    }

    // Create viewer structure
    this.container.innerHTML = `
      <div class="dicom-viewer-wrapper">
        <div class="dicom-canvas-container">
          <div class="dicom-element" id="${this.containerId}-element"></div>
          <div class="dicom-overlay">
            <div class="dicom-overlay-top-left">
              <span class="dicom-patient-info"></span>
            </div>
            <div class="dicom-overlay-top-right">
              <span class="dicom-ww-wc"></span>
            </div>
            <div class="dicom-overlay-bottom-left">
              <span class="dicom-slice-info"></span>
            </div>
            <div class="dicom-overlay-bottom-right">
              <span class="dicom-zoom-info"></span>
            </div>
          </div>
          <div class="dicom-loading" style="display: none;">
            <div class="dicom-spinner"></div>
            <span>Loading DICOM...</span>
          </div>
        </div>
        <div class="dicom-controls">
          <div class="dicom-scroll-controls">
            <button class="dicom-btn" id="${this.containerId}-prev" title="Previous Slice (↑)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="18,15 12,9 6,15"></polyline>
              </svg>
            </button>
            <input type="range" class="dicom-slider" id="${this.containerId}-slider" min="0" max="0" value="0">
            <button class="dicom-btn" id="${this.containerId}-next" title="Next Slice (↓)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6,9 12,15 18,9"></polyline>
              </svg>
            </button>
            <span class="dicom-slice-counter" id="${this.containerId}-counter">0/0</span>
          </div>
          <div class="dicom-tool-controls">
            <button class="dicom-btn dicom-tool-btn active" data-tool="scroll" title="Scroll Slices (S)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3v18M12 3l-4 4M12 3l4 4M12 21l-4-4M12 21l4-4"></path>
              </svg>
            </button>
            <button class="dicom-btn dicom-tool-btn" data-tool="wwwc" title="Window/Level (W)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 2a10 10 0 0 1 0 20"></path>
              </svg>
            </button>
            <button class="dicom-btn dicom-tool-btn" data-tool="pan" title="Pan (P)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"></path>
              </svg>
            </button>
            <button class="dicom-btn dicom-tool-btn" data-tool="zoom" title="Zoom (Z)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35M11 8v6M8 11h6"></path>
              </svg>
            </button>
            <button class="dicom-btn" id="${this.containerId}-reset" title="Reset View (R)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                <path d="M3 3v5h5"></path>
              </svg>
            </button>
          </div>
          <div class="dicom-preset-controls">
            <select class="dicom-preset-select" id="${this.containerId}-presets">
              <option value="default">Default</option>
              <option value="lung">Lung (W:1500 L:-600)</option>
              <option value="bone">Bone (W:2000 L:300)</option>
              <option value="brain">Brain (W:80 L:40)</option>
              <option value="abdomen">Abdomen (W:400 L:50)</option>
              <option value="liver">Liver (W:150 L:30)</option>
              <option value="stroke">Stroke (W:40 L:40)</option>
              <option value="subdural">Subdural (W:200 L:80)</option>
            </select>
          </div>
        </div>
      </div>
    `;

    this.element = document.getElementById(`${this.containerId}-element`);
    
    // Initialize Cornerstone
    try {
      cornerstone.enable(this.element);
      this.setupTools();
      this.setupEventListeners();
      this.isInitialized = true;
    } catch (e) {
      console.error('Failed to initialize Cornerstone:', e);
    }
  }

  setupTools() {
    // Add tools
    cornerstoneTools.addTool(cornerstoneTools.WwwcTool);
    cornerstoneTools.addTool(cornerstoneTools.PanTool);
    cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
    cornerstoneTools.addTool(cornerstoneTools.StackScrollMouseWheelTool);
    
    // Default: scroll mode — disable all cornerstone touch/click tools
    cornerstoneTools.setToolDisabled('Wwwc');
    cornerstoneTools.setToolDisabled('Pan');
    cornerstoneTools.setToolDisabled('Zoom');
    cornerstoneTools.setToolActive('StackScrollMouseWheel', {});
    
    // Track active touch tool (default: scroll through slices)
    this.activeTouchTool = 'scroll';
    
    // Custom touch handling for slice scrolling
    this.setupTouchScrolling();
  }

  setupTouchScrolling() {
    if (!this.element) return;
    
    let touchStartY = 0;
    let touchStartX = 0;
    let lastSliceChangeY = 0;
    let axisLocked = null; // null | 'vertical' | 'horizontal'
    const SLICE_THRESHOLD = 25; // pixels per slice
    const LOCK_THRESHOLD = 10; // pixels before locking axis
    
    const onTouchStart = (e) => {
      if (this.activeTouchTool !== 'scroll') return;
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      lastSliceChangeY = touchStartY;
      axisLocked = null;
      e.preventDefault();
    };
    
    const onTouchMove = (e) => {
      if (this.activeTouchTool !== 'scroll') return;
      if (this.imageIds.length <= 1) return;
      
      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      
      // Lock to one axis after initial movement
      if (!axisLocked) {
        const dx = Math.abs(currentX - touchStartX);
        const dy = Math.abs(currentY - touchStartY);
        if (dy > LOCK_THRESHOLD || dx > LOCK_THRESHOLD) {
          axisLocked = dy >= dx ? 'vertical' : 'horizontal';
        } else {
          e.preventDefault();
          return;
        }
      }
      
      // Only scroll slices on vertical axis
      if (axisLocked === 'vertical') {
        const deltaY = lastSliceChangeY - currentY;
        
        if (Math.abs(deltaY) >= SLICE_THRESHOLD) {
          const sliceStep = Math.sign(deltaY);
          const newIndex = Math.max(0, Math.min(this.imageIds.length - 1, this.currentIndex + sliceStep));
          if (newIndex !== this.currentIndex) {
            this.goToSlice(newIndex);
          }
          lastSliceChangeY = currentY;
        }
      }
      // Ignore horizontal axis entirely in scroll mode
      
      e.preventDefault();
    };
    
    const onTouchEnd = (e) => {
      axisLocked = null;
    };
    
    this.element.addEventListener('touchstart', onTouchStart, { passive: false });
    this.element.addEventListener('touchmove', onTouchMove, { passive: false });
    this.element.addEventListener('touchend', onTouchEnd, { passive: false });
    
    // Prevent double-tap zoom on the DICOM element
    this.element.addEventListener('dblclick', (e) => e.preventDefault());
  }

  setupEventListeners() {
    const slider = document.getElementById(`${this.containerId}-slider`);
    const prevBtn = document.getElementById(`${this.containerId}-prev`);
    const nextBtn = document.getElementById(`${this.containerId}-next`);
    const resetBtn = document.getElementById(`${this.containerId}-reset`);
    const presets = document.getElementById(`${this.containerId}-presets`);
    const toolBtns = this.container.querySelectorAll('.dicom-tool-btn');

    // Slider change
    slider.addEventListener('input', (e) => {
      this.goToSlice(parseInt(e.target.value));
    });

    // Prev/Next buttons
    prevBtn.addEventListener('click', () => this.previousSlice());
    nextBtn.addEventListener('click', () => this.nextSlice());

    // Reset button
    resetBtn.addEventListener('click', () => this.resetView());

    // Window presets
    presets.addEventListener('change', (e) => {
      this.applyPreset(e.target.value);
    });

    // Tool buttons
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setActiveTool(btn.dataset.tool);
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.isInitialized || this.imageIds.length === 0) return;
      
      switch(e.key) {
        case 'ArrowUp':
          e.preventDefault();
          this.previousSlice();
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.nextSlice();
          break;
        case 's':
        case 'S':
          this.setActiveTool('scroll');
          break;
        case 'w':
        case 'W':
          this.setActiveTool('wwwc');
          break;
        case 'p':
        case 'P':
          this.setActiveTool('pan');
          break;
        case 'z':
        case 'Z':
          this.setActiveTool('zoom');
          break;
        case 'r':
        case 'R':
          this.resetView();
          break;
      }
    });

    // Cornerstone events
    this.element.addEventListener('cornerstoneimagerendered', (e) => {
      this.updateOverlay(e.detail);
    });
  }

  setActiveTool(tool) {
    const toolMap = {
      'wwwc': 'Wwwc',
      'pan': 'Pan',
      'zoom': 'Zoom'
    };

    // Deactivate all cornerstone tools from left click / touch
    Object.values(toolMap).forEach(t => {
      cornerstoneTools.setToolPassive(t);
    });

    if (tool === 'scroll') {
      // Custom touch scroll mode — deactivate all cornerstone tools from touch/click
      this.activeTouchTool = 'scroll';
      // Deactivate everything so cornerstone doesn't intercept touch
      Object.values(toolMap).forEach(t => {
        cornerstoneTools.setToolDisabled(t);
      });
      // Re-enable mouse wheel scrolling and right-click zoom for desktop
      cornerstoneTools.setToolActive('StackScrollMouseWheel', {});
    } else if (toolMap[tool]) {
      // Activate selected cornerstone tool for both mouse and touch
      this.activeTouchTool = tool;
      // Re-enable all tools but only activate the selected one on left click/touch
      Object.values(toolMap).forEach(t => {
        cornerstoneTools.setToolEnabled(t);
      });
      cornerstoneTools.setToolActive(toolMap[tool], { mouseButtonMask: 1 });
      cornerstoneTools.setToolActive('StackScrollMouseWheel', {});
    }

    // Update UI
    const toolBtns = this.container.querySelectorAll('.dicom-tool-btn');
    toolBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
  }

  applyPreset(preset) {
    const presets = {
      'default': { ww: 400, wc: 40 },
      'lung': { ww: 1500, wc: -600 },
      'bone': { ww: 2000, wc: 300 },
      'brain': { ww: 80, wc: 40 },
      'abdomen': { ww: 400, wc: 50 },
      'liver': { ww: 150, wc: 30 },
      'stroke': { ww: 40, wc: 40 },
      'subdural': { ww: 200, wc: 80 }
    };

    const p = presets[preset];
    if (p) {
      this.setWindowLevel(p.ww, p.wc);
    }
  }

  setWindowLevel(ww, wc) {
    this.windowWidth = ww;
    this.windowCenter = wc;
    
    const viewport = cornerstone.getViewport(this.element);
    viewport.voi.windowWidth = ww;
    viewport.voi.windowCenter = wc;
    cornerstone.setViewport(this.element, viewport);
  }

  async loadSeries(seriesPath) {
    this.showLoading(true);
    
    try {
      // Fetch the list of DICOM files in the series
      const response = await fetch(`/api/dicom/series?path=${encodeURIComponent(seriesPath)}`);
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      this.imageIds = data.imageIds;
      
      if (this.imageIds.length === 0) {
        throw new Error('No DICOM images found in series');
      }

      // Define the stack
      this.stack = {
        currentImageIdIndex: 0,
        imageIds: this.imageIds
      };

      // Load and display first image
      const image = await cornerstone.loadAndCacheImage(this.imageIds[0]);
      cornerstone.displayImage(this.element, image);

      // Add stack state to the element
      cornerstoneTools.addStackStateManager(this.element, ['stack']);
      cornerstoneTools.addToolState(this.element, 'stack', this.stack);

      // Update UI
      const slider = document.getElementById(`${this.containerId}-slider`);
      slider.max = this.imageIds.length - 1;
      slider.value = 0;
      this.updateCounter();

      // Store metadata if available
      if (data.metadata) {
        this.metadata = data.metadata;
        this.updatePatientInfo();
      }

      // Apply default window if available from metadata
      if (data.metadata?.windowCenter && data.metadata?.windowWidth) {
        this.setWindowLevel(data.metadata.windowWidth, data.metadata.windowCenter);
      }

    } catch (e) {
      console.error('Failed to load DICOM series:', e);
      const msg = e?.message || e?.error || (typeof e === 'string' ? e : JSON.stringify(e));
      this.showError(msg || 'Failed to load DICOM series');
    } finally {
      this.showLoading(false);
    }
  }

  async loadImageIds(imageIds, metadata = null) {
    this.showLoading(true);
    
    try {
      this.imageIds = imageIds;
      this.metadata = metadata;
      
      if (this.imageIds.length === 0) {
        throw new Error('No DICOM images provided');
      }

      console.log(`Loading ${this.imageIds.length} DICOM images`);

      // Define the stack
      this.stack = {
        currentImageIdIndex: 0,
        imageIds: this.imageIds
      };

      // Load and display first image
      const image = await cornerstone.loadAndCacheImage(this.imageIds[0]);
      cornerstone.displayImage(this.element, image);

      // Add stack state to the element
      try {
        cornerstoneTools.clearToolState(this.element, 'stack');
      } catch(e) {}
      cornerstoneTools.addStackStateManager(this.element, ['stack']);
      cornerstoneTools.addToolState(this.element, 'stack', this.stack);

      // Update UI - find elements within our container
      this.slider = this.container.querySelector('.dicom-slider');
      this.counter = this.container.querySelector('.dicom-slice-counter');
      
      if (this.slider) {
        this.slider.max = this.imageIds.length - 1;
        this.slider.value = 0;
        console.log(`Slider configured: max=${this.slider.max}`);
      }
      
      this.currentIndex = 0;
      this.imageCache = { 0: image }; // Initialize cache with first image
      this.updateCounter();
      this.updatePatientInfo();
      
      // Re-bind events to make sure they work
      this.bindSliceControls();
      
      // Preload first several slices for smooth initial scrolling
      this.preloadAdjacent(0);

    } catch (e) {
      console.error('Failed to load DICOM images:', e);
      const msg = e?.message || e?.error || (typeof e === 'string' ? e : JSON.stringify(e));
      this.showError(msg || 'Failed to load DICOM image');
    } finally {
      this.showLoading(false);
    }
  }

  bindSliceControls() {
    const self = this;
    
    // Bind slider
    const slider = this.container.querySelector('.dicom-slider');
    if (slider) {
      this.slider = slider;
      slider.oninput = function(e) {
        self.goToSlice(parseInt(e.target.value));
      };
    }
    
    // Bind prev/next buttons
    const prevBtn = this.container.querySelector('[id$="-prev"]');
    const nextBtn = this.container.querySelector('[id$="-next"]');
    
    if (prevBtn) {
      prevBtn.onclick = function() { self.previousSlice(); };
    }
    if (nextBtn) {
      nextBtn.onclick = function() { self.nextSlice(); };
    }
    
    // Add mouse wheel scrolling on the DICOM element
    const wheelHandler = function(e) {
      e.preventDefault();
      e.stopPropagation();
      // Use smoother scroll with smaller increments
      if (e.deltaY > 0) {
        self.nextSlice();
      } else if (e.deltaY < 0) {
        self.previousSlice();
      }
    };
    
    if (this.element) {
      this.element.addEventListener('wheel', wheelHandler, { passive: false });
    }
    
    // Also bind to the canvas container for better scroll coverage
    const canvasContainer = this.container.querySelector('.dicom-canvas-container');
    if (canvasContainer) {
      canvasContainer.addEventListener('wheel', wheelHandler, { passive: false });
    }
  }

  getElement() {
    // Always get fresh reference to ensure it's valid
    if (!this._cachedElement || !document.contains(this._cachedElement)) {
      this._cachedElement = document.getElementById(this.containerId + '-element');
    }
    return this._cachedElement;
  }

  goToSlice(index) {
    if (index < 0 || index >= this.imageIds.length) return;
    if (index === this.currentIndex && this.imageCache && this.imageCache[index]) return;
    
    const element = this.getElement();
    if (!element) return;
    
    this.currentIndex = index;
    
    // Update UI immediately
    if (this.slider) this.slider.value = index;
    this.updateCounter();
    
    // Update stack state
    if (this.stack) {
      this.stack.currentImageIdIndex = index;
    }
    
    const imageId = this.imageIds[index];
    const self = this;
    
    // Check if image is already cached
    const cachedImage = this.imageCache ? this.imageCache[index] : null;
    
    if (cachedImage) {
      // Use cached image - instant display
      this.displayImageSmooth(element, cachedImage);
    } else {
      // Load and display
      cornerstone.loadAndCacheImage(imageId).then(function(image) {
        // Cache it
        if (!self.imageCache) self.imageCache = {};
        self.imageCache[index] = image;
        
        // Only display if still on this slice
        if (self.currentIndex === index) {
          self.displayImageSmooth(element, image);
        }
        
        // Preload adjacent slices
        self.preloadAdjacent(index);
      }).catch(function(e) {
        console.error('Failed to load slice ' + index);
      });
    }
  }
  
  displayImageSmooth(element, image) {
    try {
      // Get current viewport to preserve window/level, zoom, pan
      let viewport = null;
      try {
        viewport = cornerstone.getViewport(element);
      } catch(e) {}
      
      // Display the image
      cornerstone.displayImage(element, image, viewport);
    } catch(e) {
      // Fallback: re-enable and display
      try {
        cornerstone.enable(element);
        cornerstone.displayImage(element, image);
      } catch(e2) {}
    }
  }
  
  preloadAdjacent(currentIndex) {
    // Preload next 3 and previous 2 slices
    const preloadIndices = [
      currentIndex + 1, currentIndex + 2, currentIndex + 3,
      currentIndex - 1, currentIndex - 2
    ].filter(i => i >= 0 && i < this.imageIds.length);
    
    const self = this;
    preloadIndices.forEach(function(idx) {
      if (!self.imageCache || !self.imageCache[idx]) {
        cornerstone.loadAndCacheImage(self.imageIds[idx]).then(function(image) {
          if (!self.imageCache) self.imageCache = {};
          self.imageCache[idx] = image;
        }).catch(function() {});
      }
    });
  }

  previousSlice() {
    if (this.currentIndex > 0) {
      this.goToSlice(this.currentIndex - 1);
    }
  }

  nextSlice() {
    if (this.currentIndex < this.imageIds.length - 1) {
      this.goToSlice(this.currentIndex + 1);
    }
  }
  
  // Debounced scroll for smoother performance
  scrollSlice(delta) {
    const now = Date.now();
    if (this.lastScrollTime && now - this.lastScrollTime < 50) {
      // Accumulate scroll delta for rapid scrolling
      this.scrollAccumulator = (this.scrollAccumulator || 0) + delta;
      return;
    }
    
    this.lastScrollTime = now;
    const totalDelta = delta + (this.scrollAccumulator || 0);
    this.scrollAccumulator = 0;
    
    const newIndex = Math.max(0, Math.min(this.imageIds.length - 1, 
      this.currentIndex + Math.sign(totalDelta)));
    
    if (newIndex !== this.currentIndex) {
      this.goToSlice(newIndex);
    }
  }

  updateCounter() {
    const counter = this.counter || this.container.querySelector('.dicom-slice-counter');
    if (counter) {
      counter.textContent = `${this.currentIndex + 1}/${this.imageIds.length}`;
    }
  }

  updateOverlay(detail) {
    const viewport = detail.viewport;
    
    // Update WW/WC display
    const wwwcEl = this.container.querySelector('.dicom-ww-wc');
    wwwcEl.textContent = `WW: ${Math.round(viewport.voi.windowWidth)} WC: ${Math.round(viewport.voi.windowCenter)}`;
    
    // Update zoom display
    const zoomEl = this.container.querySelector('.dicom-zoom-info');
    zoomEl.textContent = `Zoom: ${(viewport.scale * 100).toFixed(0)}%`;
    
    // Update slice info
    const sliceEl = this.container.querySelector('.dicom-slice-info');
    sliceEl.textContent = `Image: ${this.currentIndex + 1}/${this.imageIds.length}`;
  }

  updatePatientInfo() {
    const infoEl = this.container.querySelector('.dicom-patient-info');
    if (this.metadata) {
      const parts = [];
      if (this.metadata.patientName) parts.push(this.metadata.patientName);
      if (this.metadata.modality) parts.push(this.metadata.modality);
      if (this.metadata.seriesDescription) parts.push(this.metadata.seriesDescription);
      infoEl.textContent = parts.join(' | ');
    } else {
      infoEl.textContent = '';
    }
  }

  resetView() {
    cornerstone.reset(this.element);
    document.getElementById(`${this.containerId}-presets`).value = 'default';
    
    // Re-apply default window levels if available
    if (this.metadata?.windowCenter && this.metadata?.windowWidth) {
      this.setWindowLevel(this.metadata.windowWidth, this.metadata.windowCenter);
    }
  }

  showLoading(show) {
    const loading = this.container.querySelector('.dicom-loading');
    loading.style.display = show ? 'flex' : 'none';
  }

  showError(message) {
    const canvas = this.container.querySelector('.dicom-element');
    canvas.innerHTML = `
      <div class="dicom-error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>${message}</p>
      </div>
    `;
  }

  destroy() {
    if (this.element) {
      cornerstone.disable(this.element);
    }
    this.isInitialized = false;
  }
}

// Styles for DICOM viewer
const dicomStyles = `
  .dicom-viewer-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #000;
    border-radius: 8px;
    overflow: hidden;
  }

  .dicom-canvas-container {
    flex: 1;
    position: relative;
    min-height: 400px;
  }

  .dicom-element {
    width: 100%;
    height: 100%;
    background: #000;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .dicom-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    padding: 12px;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 12px;
    color: #0f0;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
  }

  .dicom-overlay-top-left {
    position: absolute;
    top: 12px;
    left: 12px;
  }

  .dicom-overlay-top-right {
    position: absolute;
    top: 12px;
    right: 12px;
    text-align: right;
  }

  .dicom-overlay-bottom-left {
    position: absolute;
    bottom: 12px;
    left: 12px;
  }

  .dicom-overlay-bottom-right {
    position: absolute;
    bottom: 12px;
    right: 12px;
    text-align: right;
  }

  .dicom-loading {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.8);
    color: #fff;
    gap: 12px;
  }

  .dicom-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255,255,255,0.2);
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: dicom-spin 1s linear infinite;
  }

  @keyframes dicom-spin {
    to { transform: rotate(360deg); }
  }

  .dicom-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #ef4444;
    gap: 12px;
    text-align: center;
    padding: 20px;
  }

  .dicom-controls {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px;
    background: #1a1a25;
    border-top: 1px solid rgba(255,255,255,0.1);
    flex-wrap: wrap;
  }

  .dicom-scroll-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 200px;
  }

  .dicom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    color: #a1a1aa;
    cursor: pointer;
    transition: all 0.2s;
  }

  .dicom-btn:hover {
    background: rgba(99, 102, 241, 0.2);
    border-color: #6366f1;
    color: #fff;
  }

  .dicom-tool-btn.active {
    background: rgba(99, 102, 241, 0.3);
    border-color: #6366f1;
    color: #818cf8;
  }

  .dicom-slider {
    flex: 1;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
    outline: none;
  }

  .dicom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background: #6366f1;
    border-radius: 50%;
    cursor: pointer;
  }

  .dicom-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: #6366f1;
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  .dicom-slice-counter {
    font-size: 13px;
    color: #a1a1aa;
    min-width: 50px;
    text-align: center;
  }

  .dicom-tool-controls {
    display: flex;
    gap: 4px;
  }

  .dicom-preset-controls {
    display: flex;
    gap: 8px;
  }

  .dicom-preset-select {
    padding: 8px 12px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: #f4f4f5;
    font-size: 13px;
    cursor: pointer;
    outline: none;
  }

  .dicom-preset-select:hover {
    border-color: #6366f1;
  }

  .dicom-preset-select option {
    background: #1a1a25;
    color: #f4f4f5;
  }
`;

// Inject styles
if (!document.getElementById('dicom-viewer-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'dicom-viewer-styles';
  styleEl.textContent = dicomStyles;
  document.head.appendChild(styleEl);
}

// Export for use
window.DicomViewer = DicomViewer;
