/**
 * Key Findings Overlay - SVG overlay for annotated key findings on case images
 * Renders arrows, circles, and rectangles over case images to highlight key findings.
 * Supports show/hide, animated reveal, and editor mode for attendings/fellows.
 */
window.keyFindingsOverlay = {
  svgElement: null,
  findings: [],
  visible: true,
  containerEl: null,

  // Mount the SVG overlay on top of an image container
  init(containerEl) {
    this.containerEl = containerEl;
    this.destroy(); // clean up any existing

    // Create SVG element absolutely positioned over container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'key-findings-svg');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
    containerEl.style.position = 'relative';
    containerEl.appendChild(svg);
    this.svgElement = svg;
  },

  // Load findings from API
  async loadFindings(caseId) {
    try {
      const res = await fetch(`/api/cases/${caseId}/key-findings`);
      const data = await res.json();
      this.findings = data.findings || [];
      this.render();
    } catch (e) { console.error('Failed to load key findings:', e); }
  },

  // Render all findings as SVG elements
  render() {
    if (!this.svgElement) return;
    this.svgElement.innerHTML = '';

    // Add defs for arrow markers
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `<marker id="kf-arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1"/>
    </marker>`;
    this.svgElement.appendChild(defs);

    this.findings.forEach((finding, index) => {
      const region = typeof finding.region_data === 'string'
        ? JSON.parse(finding.region_data)
        : finding.region_data;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'key-finding-group');
      g.style.opacity = '0';
      g.style.transition = 'opacity 0.4s ease';

      // Create shape based on type
      if (region.type === 'arrow') {
        const x1 = region.x * 100 + '%';
        const y1 = region.y * 100 + '%';
        const rad = (region.angle || 0) * Math.PI / 180;
        const x2 = (region.x + Math.cos(rad) * (region.length || 0.08)) * 100 + '%';
        const y2 = (region.y + Math.sin(rad) * (region.length || 0.08)) * 100 + '%';

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#6366f1'); line.setAttribute('stroke-width', '2');
        line.setAttribute('marker-end', 'url(#kf-arrowhead)');
        g.appendChild(line);
      } else if (region.type === 'circle') {
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', region.cx * 100 + '%');
        ellipse.setAttribute('cy', region.cy * 100 + '%');
        ellipse.setAttribute('rx', region.rx * 100 + '%');
        ellipse.setAttribute('ry', region.ry * 100 + '%');
        ellipse.setAttribute('stroke', '#6366f1'); ellipse.setAttribute('stroke-width', '2');
        ellipse.setAttribute('fill', 'rgba(99,102,241,0.1)');
        g.appendChild(ellipse);
      } else if (region.type === 'rect') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', region.x * 100 + '%');
        rect.setAttribute('y', region.y * 100 + '%');
        rect.setAttribute('width', region.width * 100 + '%');
        rect.setAttribute('height', region.height * 100 + '%');
        rect.setAttribute('stroke', '#6366f1'); rect.setAttribute('stroke-width', '2');
        rect.setAttribute('fill', 'rgba(99,102,241,0.1)');
        g.appendChild(rect);
      }

      // Add label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const labelX = (region.x || region.cx || 0) * 100;
      const labelY = ((region.y || region.cy || 0) - 0.03) * 100;
      label.setAttribute('x', labelX + '%'); label.setAttribute('y', labelY + '%');
      label.setAttribute('fill', '#6366f1'); label.setAttribute('font-size', '12');
      label.setAttribute('font-family', 'Inter, sans-serif'); label.setAttribute('font-weight', '600');
      label.textContent = finding.label;
      g.appendChild(label);

      // Tooltip on hover/tap
      g.style.pointerEvents = 'all';
      g.style.cursor = 'pointer';
      if (finding.description) {
        g.setAttribute('data-tooltip', finding.description);
        g.addEventListener('click', () => this.showTooltip(g, finding));
      }

      this.svgElement.appendChild(g);

      // Staggered fade-in animation
      setTimeout(() => { g.style.opacity = '1'; }, 200 * index);
    });
  },

  showTooltip(groupEl, finding) {
    // Remove existing tooltips
    document.querySelectorAll('.kf-tooltip').forEach(t => t.remove());
    const tooltip = document.createElement('div');
    tooltip.className = 'kf-tooltip';
    tooltip.innerHTML = `<strong>${finding.label}</strong><p>${finding.description || ''}</p>`;
    this.containerEl.appendChild(tooltip);
    // Position near the finding
    const rect = groupEl.getBoundingClientRect();
    const containerRect = this.containerEl.getBoundingClientRect();
    tooltip.style.left = (rect.left - containerRect.left) + 'px';
    tooltip.style.top = (rect.bottom - containerRect.top + 8) + 'px';
    setTimeout(() => tooltip.remove(), 4000);
    document.addEventListener('click', function handler(e) {
      if (!tooltip.contains(e.target)) {
        tooltip.remove();
        document.removeEventListener('click', handler);
      }
    }, { once: false });
  },

  toggle() {
    this.visible = !this.visible;
    if (this.svgElement) {
      this.svgElement.style.display = this.visible ? 'block' : 'none';
    }
  },

  // Animated reveal (for study mode step 3)
  animateReveal() {
    if (!this.svgElement) return;
    const groups = this.svgElement.querySelectorAll('.key-finding-group');
    groups.forEach((g, i) => {
      g.style.opacity = '0';
      setTimeout(() => { g.style.opacity = '1'; }, 200 * i);
    });
  },

  // Editor: place a new finding by clicking on image
  startEditor(caseId, imageId, onSave) {
    if (!this.containerEl) return;
    this.containerEl.style.cursor = 'crosshair';
    const handler = (e) => {
      const rect = this.containerEl.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      this.containerEl.style.cursor = '';
      this.containerEl.removeEventListener('click', handler);
      this.showEditorForm(caseId, imageId, x, y, onSave);
    };
    this.containerEl.addEventListener('click', handler);
  },

  showEditorForm(caseId, imageId, x, y, onSave) {
    const form = document.createElement('div');
    form.className = 'kf-editor-form';
    form.innerHTML = `
      <h4>Add Key Finding</h4>
      <label>Label<input type="text" id="kfLabel" class="form-input" required></label>
      <label>Description<textarea id="kfDesc" class="form-textarea"></textarea></label>
      <label>Type<select id="kfType" class="form-select">
        <option value="arrow">Arrow</option>
        <option value="circle">Circle</option>
        <option value="rect">Rectangle</option>
      </select></label>
      <div class="kf-editor-actions">
        <button class="btn btn-secondary btn-sm" id="kfCancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="kfSave">Save</button>
      </div>
    `;
    this.containerEl.appendChild(form);
    form.querySelector('#kfCancel').onclick = () => form.remove();
    form.querySelector('#kfSave').onclick = async () => {
      const label = form.querySelector('#kfLabel').value;
      const description = form.querySelector('#kfDesc').value;
      const findingType = form.querySelector('#kfType').value;
      if (!label) return;
      let regionData;
      if (findingType === 'arrow') {
        regionData = { type: 'arrow', x, y, angle: 225, length: 0.08 };
      } else if (findingType === 'circle') {
        regionData = { type: 'circle', cx: x, cy: y, rx: 0.06, ry: 0.06 };
      } else {
        regionData = { type: 'rect', x: x - 0.05, y: y - 0.05, width: 0.1, height: 0.1 };
      }
      try {
        await fetch(`/api/cases/${caseId}/key-findings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            image_id: imageId,
            finding_type: findingType,
            region_data: JSON.stringify(regionData),
            label,
            description
          })
        });
        form.remove();
        this.loadFindings(caseId);
        if (onSave) onSave();
      } catch (e) { console.error('Failed to save finding:', e); }
    };
  },

  destroy() {
    if (this.svgElement) { this.svgElement.remove(); this.svgElement = null; }
    this.findings = [];
  }
};

// Listen for study mode events
document.addEventListener('study:show-findings', (e) => {
  const caseId = e.detail?.caseId;
  if (caseId) {
    const container = document.querySelector('.case-viewer');
    if (container) {
      keyFindingsOverlay.init(container);
      keyFindingsOverlay.loadFindings(caseId);
    }
  }
});
