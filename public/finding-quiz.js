// Finding Quiz - "Find the finding" click mode + "annotate to answer" mode

class FindingQuiz {
  constructor() {
    this.active = false;
    this.regions = [];
  }

  // "Find the Finding" click mode overlay
  startClickMode(caseId, imageId, imageUrl, onComplete) {
    this.active = true;
    const overlay = document.createElement('div');
    overlay.className = 'finding-quiz-overlay';
    overlay.innerHTML = `
      <div class="finding-quiz-content">
        <div class="finding-quiz-header">
          <h3>Find the Finding</h3>
          <p>Tap on the image where you see the abnormality</p>
          <button class="finding-quiz-close">&times;</button>
        </div>
        <div class="finding-quiz-image-wrap">
          <img src="${imageUrl}" alt="Case image" class="finding-quiz-img" crossorigin>
          <canvas class="finding-quiz-canvas"></canvas>
          <div class="finding-quiz-crosshair"></div>
        </div>
        <div class="finding-quiz-result hidden"></div>
      </div>
    `;

    const img = overlay.querySelector('.finding-quiz-img');
    const canvas = overlay.querySelector('.finding-quiz-canvas');
    const resultDiv = overlay.querySelector('.finding-quiz-result');

    overlay.querySelector('.finding-quiz-close').addEventListener('click', () => {
      overlay.remove();
      this.active = false;
    });

    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const handleClick = async (e) => {
        // Normalize coordinates to image dimensions (0-1 range)
        const imgEl = overlay.querySelector('img') || overlay.querySelector('.finding-quiz-image');
        const rect = imgEl.getBoundingClientRect();
        const clickX = (e.clientX - rect.left) / rect.width;
        const clickY = (e.clientY - rect.top) / rect.height;

        canvas.removeEventListener('click', handleClick);

        // Submit to server
        try {
          const res = await fetch('/api/quiz/finding-attempt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              case_id: caseId,
              image_id: imageId,
              click_x: clickX,
              click_y: clickY,
            }),
          });
          const data = await res.json();
          this._showClickResult(canvas, img, clickX, clickY, data, resultDiv);
          if (onComplete) onComplete(data);
        } catch (err) {
          resultDiv.textContent = 'Error submitting attempt';
          resultDiv.classList.remove('hidden');
        }
      };

      canvas.addEventListener('click', handleClick);
    };

    document.body.appendChild(overlay);
  }

  _showClickResult(canvas, img, clickX, clickY, data, resultDiv) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;

    // Draw finding regions
    for (const region of (data.regions || [])) {
      const rd = region.region_data;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);

      if (rd.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(rd.cx * w, rd.cy * h, rd.rx * w, rd.ry * h, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (rd.type === 'rect') {
        ctx.strokeRect(rd.x * w, rd.y * h, rd.w * w, rd.h * h);
      }
      ctx.setLineDash([]);
    }

    // Draw user's click
    ctx.beginPath();
    ctx.arc(clickX * w, clickY * h, 12, 0, Math.PI * 2);
    ctx.fillStyle = data.hit ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)';
    ctx.fill();
    ctx.strokeStyle = data.hit ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Cross marker
    ctx.beginPath();
    ctx.moveTo(clickX * w - 8, clickY * h);
    ctx.lineTo(clickX * w + 8, clickY * h);
    ctx.moveTo(clickX * w, clickY * h - 8);
    ctx.lineTo(clickX * w, clickY * h + 8);
    ctx.stroke();

    // Show result text
    if (data.hit) {
      resultDiv.innerHTML = '<span class="finding-result-hit">Direct Hit! You found the finding.</span>';
    } else if (data.partialCredit) {
      resultDiv.innerHTML = '<span class="finding-result-partial">Close! Partial credit - you were near the finding.</span>';
    } else {
      resultDiv.innerHTML = '<span class="finding-result-miss">Missed. The finding is highlighted in green.</span>';
    }
    resultDiv.classList.remove('hidden');
  }

  // Side-by-side comparison overlay
  showComparison(abnormalUrl, normalUrl) {
    const overlay = document.createElement('div');
    overlay.className = 'finding-compare-overlay';
    overlay.innerHTML = `
      <div class="finding-compare-content">
        <div class="finding-compare-header">
          <h3>Compare with Normal</h3>
          <button class="finding-compare-close">&times;</button>
        </div>
        <div class="finding-compare-images">
          <div class="finding-compare-pane">
            <span class="finding-compare-label">Abnormal</span>
            <img src="${abnormalUrl}" alt="Abnormal">
          </div>
          <div class="finding-compare-pane">
            <span class="finding-compare-label">Normal</span>
            <img src="${normalUrl}" alt="Normal">
          </div>
        </div>
      </div>
    `;
    overlay.querySelector('.finding-compare-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }
}

window.findingQuiz = new FindingQuiz();
