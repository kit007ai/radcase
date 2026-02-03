// RadCase Presentation Mode
// Full-screen teaching presentations with reveal controls

class PresentationMode {
  constructor() {
    this.currentCase = null;
    this.currentImageIndex = 0;
    this.revealState = {
      diagnosis: false,
      findings: false,
      teaching: false
    };
    this.isActive = false;
    
    this.createOverlay();
    this.setupKeyboardControls();
  }

  createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'presentationOverlay';
    overlay.innerHTML = `
      <style>
        #presentationOverlay {
          position: fixed;
          inset: 0;
          background: #000;
          z-index: 9999;
          display: none;
          flex-direction: column;
        }

        #presentationOverlay.active {
          display: flex;
        }

        .pres-header {
          padding: 16px 24px;
          background: rgba(20, 20, 30, 0.95);
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .pres-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: #f4f4f5;
        }

        .pres-meta {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .pres-badge {
          padding: 4px 12px;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .pres-badge-modality {
          background: rgba(6, 182, 212, 0.2);
          color: #22d3ee;
        }

        .pres-badge-bodypart {
          background: rgba(168, 85, 247, 0.2);
          color: #c084fc;
        }

        .pres-close {
          padding: 8px 16px;
          border-radius: 8px;
          border: none;
          background: rgba(255,255,255,0.1);
          color: #f4f4f5;
          cursor: pointer;
          font-size: 0.9rem;
        }

        .pres-close:hover {
          background: rgba(255,255,255,0.2);
        }

        .pres-main {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 400px;
          overflow: hidden;
        }

        .pres-image-area {
          display: flex;
          flex-direction: column;
          background: #0a0a0f;
        }

        .pres-image-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
        }

        .pres-image {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }

        .pres-image-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 50px;
          height: 50px;
          border-radius: 50%;
          border: none;
          background: rgba(255,255,255,0.1);
          color: #f4f4f5;
          font-size: 1.5rem;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .pres-image-container:hover .pres-image-nav {
          opacity: 1;
        }

        .pres-image-nav:hover {
          background: rgba(255,255,255,0.2);
        }

        .pres-image-nav.prev { left: 24px; }
        .pres-image-nav.next { right: 24px; }

        .pres-thumbnails {
          display: flex;
          gap: 8px;
          padding: 16px;
          background: rgba(20, 20, 30, 0.95);
          overflow-x: auto;
          justify-content: center;
        }

        .pres-thumb {
          width: 80px;
          height: 80px;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          border: 2px solid transparent;
          flex-shrink: 0;
          transition: border-color 0.2s;
        }

        .pres-thumb.active {
          border-color: #6366f1;
        }

        .pres-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .pres-sidebar {
          background: rgba(20, 20, 30, 0.98);
          border-left: 1px solid rgba(255,255,255,0.1);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .pres-section {
          padding: 20px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .pres-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .pres-section-title {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #71717a;
        }

        .pres-reveal-btn {
          padding: 6px 12px;
          border-radius: 6px;
          border: none;
          background: #6366f1;
          color: white;
          font-size: 0.75rem;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .pres-reveal-btn:hover {
          opacity: 0.9;
        }

        .pres-reveal-btn.revealed {
          background: #22c55e;
        }

        .pres-content {
          color: #f4f4f5;
          line-height: 1.7;
          font-size: 1rem;
        }

        .pres-content.hidden {
          filter: blur(8px);
          user-select: none;
          pointer-events: none;
        }

        .pres-diagnosis {
          font-size: 1.25rem;
          font-weight: 600;
          color: #818cf8;
        }

        .pres-footer {
          padding: 16px 20px;
          background: rgba(20, 20, 30, 0.98);
          border-top: 1px solid rgba(255,255,255,0.1);
          margin-top: auto;
        }

        .pres-controls {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .pres-control-btn {
          flex: 1;
          padding: 12px;
          border-radius: 8px;
          border: none;
          background: rgba(255,255,255,0.05);
          color: #a1a1aa;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }

        .pres-control-btn:hover {
          background: rgba(255,255,255,0.1);
          color: #f4f4f5;
        }

        .pres-control-btn.primary {
          background: #6366f1;
          color: white;
        }

        .pres-shortcuts {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.05);
          font-size: 0.75rem;
          color: #52525b;
        }

        .pres-shortcuts kbd {
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255,255,255,0.1);
          margin-right: 4px;
        }

        @media (max-width: 900px) {
          .pres-main {
            grid-template-columns: 1fr;
          }
          .pres-sidebar {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 50vh;
            border-left: none;
            border-top: 1px solid rgba(255,255,255,0.1);
          }
        }
      </style>

      <div class="pres-header">
        <div>
          <div class="pres-title" id="presTitle">-</div>
          <div class="pres-meta">
            <span class="pres-badge pres-badge-modality" id="presModality">-</span>
            <span class="pres-badge pres-badge-bodypart" id="presBodyPart">-</span>
          </div>
        </div>
        <button class="pres-close" onclick="presentation.exit()">✕ Exit (Esc)</button>
      </div>

      <div class="pres-main">
        <div class="pres-image-area">
          <div class="pres-image-container">
            <button class="pres-image-nav prev" onclick="presentation.prevImage()">‹</button>
            <img class="pres-image" id="presImage" src="" alt="Case image">
            <button class="pres-image-nav next" onclick="presentation.nextImage()">›</button>
          </div>
          <div class="pres-thumbnails" id="presThumbnails"></div>
        </div>

        <div class="pres-sidebar">
          <div class="pres-section">
            <div class="pres-section-header">
              <span class="pres-section-title">Clinical History</span>
            </div>
            <div class="pres-content" id="presHistory">-</div>
          </div>

          <div class="pres-section">
            <div class="pres-section-header">
              <span class="pres-section-title">Diagnosis</span>
              <button class="pres-reveal-btn" id="revealDiagnosis" onclick="presentation.reveal('diagnosis')">
                Reveal (D)
              </button>
            </div>
            <div class="pres-content pres-diagnosis hidden" id="presDiagnosis">-</div>
          </div>

          <div class="pres-section">
            <div class="pres-section-header">
              <span class="pres-section-title">Key Findings</span>
              <button class="pres-reveal-btn" id="revealFindings" onclick="presentation.reveal('findings')">
                Reveal (F)
              </button>
            </div>
            <div class="pres-content hidden" id="presFindings">-</div>
          </div>

          <div class="pres-section">
            <div class="pres-section-header">
              <span class="pres-section-title">Teaching Points</span>
              <button class="pres-reveal-btn" id="revealTeaching" onclick="presentation.reveal('teaching')">
                Reveal (T)
              </button>
            </div>
            <div class="pres-content hidden" id="presTeaching">-</div>
          </div>

          <div class="pres-footer">
            <div class="pres-controls">
              <button class="pres-control-btn" onclick="presentation.revealAll()">
                👁️ Reveal All (Space)
              </button>
              <button class="pres-control-btn" onclick="presentation.hideAll()">
                🙈 Hide All (H)
              </button>
            </div>
            <div class="pres-shortcuts">
              <kbd>←</kbd><kbd>→</kbd> Navigate images
              <kbd>D</kbd><kbd>F</kbd><kbd>T</kbd> Reveal sections
              <kbd>Space</kbd> Reveal all
              <kbd>H</kbd> Hide all
              <kbd>Esc</kbd> Exit
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

  setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
      if (!this.isActive) return;
      
      switch (e.key) {
        case 'Escape':
          this.exit();
          break;
        case 'ArrowLeft':
          this.prevImage();
          break;
        case 'ArrowRight':
          this.nextImage();
          break;
        case ' ':
          e.preventDefault();
          this.revealAll();
          break;
        case 'd':
        case 'D':
          this.reveal('diagnosis');
          break;
        case 'f':
        case 'F':
          this.reveal('findings');
          break;
        case 't':
        case 'T':
          this.reveal('teaching');
          break;
        case 'h':
        case 'H':
          this.hideAll();
          break;
      }
    });
  }

  async start(caseId) {
    try {
      const res = await fetch(`/api/cases/${caseId}`);
      this.currentCase = await res.json();
      this.currentImageIndex = 0;
      this.revealState = { diagnosis: false, findings: false, teaching: false };
      
      this.render();
      this.overlay.classList.add('active');
      this.isActive = true;
      document.body.style.overflow = 'hidden';
    } catch (err) {
      console.error('Failed to load case for presentation:', err);
    }
  }

  render() {
    const c = this.currentCase;
    
    document.getElementById('presTitle').textContent = c.title || 'Untitled Case';
    document.getElementById('presModality').textContent = c.modality || '-';
    document.getElementById('presBodyPart').textContent = c.body_part || '-';
    document.getElementById('presHistory').textContent = c.clinical_history || 'No history provided';
    document.getElementById('presDiagnosis').textContent = c.diagnosis || '-';
    document.getElementById('presFindings').textContent = c.findings || '-';
    document.getElementById('presTeaching').textContent = c.teaching_points || '-';

    // Images
    if (c.images && c.images.length > 0) {
      document.getElementById('presImage').src = `/uploads/${c.images[this.currentImageIndex].filename}`;
      
      document.getElementById('presThumbnails').innerHTML = c.images.map((img, i) => `
        <div class="pres-thumb ${i === this.currentImageIndex ? 'active' : ''}" 
             onclick="presentation.goToImage(${i})">
          <img src="/thumbnails/${img.filename}" alt="Thumbnail">
        </div>
      `).join('');
    }

    this.updateRevealButtons();
  }

  updateRevealButtons() {
    ['diagnosis', 'findings', 'teaching'].forEach(key => {
      const btn = document.getElementById(`reveal${key.charAt(0).toUpperCase() + key.slice(1)}`);
      const content = document.getElementById(`pres${key.charAt(0).toUpperCase() + key.slice(1)}`);
      
      if (this.revealState[key]) {
        btn.textContent = '✓ Revealed';
        btn.classList.add('revealed');
        content.classList.remove('hidden');
      } else {
        btn.textContent = `Reveal (${key.charAt(0).toUpperCase()})`;
        btn.classList.remove('revealed');
        content.classList.add('hidden');
      }
    });
  }

  reveal(key) {
    this.revealState[key] = true;
    this.updateRevealButtons();
  }

  revealAll() {
    this.revealState = { diagnosis: true, findings: true, teaching: true };
    this.updateRevealButtons();
  }

  hideAll() {
    this.revealState = { diagnosis: false, findings: false, teaching: false };
    this.updateRevealButtons();
  }

  goToImage(index) {
    if (!this.currentCase || !this.currentCase.images) return;
    this.currentImageIndex = index;
    this.render();
  }

  prevImage() {
    if (!this.currentCase || !this.currentCase.images) return;
    this.currentImageIndex = (this.currentImageIndex - 1 + this.currentCase.images.length) % this.currentCase.images.length;
    this.render();
  }

  nextImage() {
    if (!this.currentCase || !this.currentCase.images) return;
    this.currentImageIndex = (this.currentImageIndex + 1) % this.currentCase.images.length;
    this.render();
  }

  exit() {
    this.overlay.classList.remove('active');
    this.isActive = false;
    this.currentCase = null;
    document.body.style.overflow = '';
  }
}

// Initialize
const presentation = new PresentationMode();
window.presentation = presentation;
