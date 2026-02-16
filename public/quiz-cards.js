// Quiz Cards - MCQ swipe card component: rendering, tap-to-answer, swipe-to-advance, animations

class QuizCardComponent {
  constructor() {
    this.swipeThreshold = 80;
    this.currentCard = null;
  }

  render(container, card, xpPreview, onAnswer, onNext) {
    this.currentCard = card;
    const el = document.createElement('div');
    el.className = 'quiz-mcq-card';

    const imageHtml = card.imageUrl
      ? `<div class="quiz-card-image"><img src="${this._escapeHtml(card.imageUrl)}" alt="Case image" loading="eager" onerror="this.parentElement.style.display='none'"></div>`
      : '';

    const tags = [];
    if (card.modality) tags.push(card.modality);
    if (card.body_part || card.specialty) tags.push(card.body_part || card.specialty);
    if (card.difficulty) tags.push(`Diff: ${card.difficulty}`);

    el.innerHTML = `
      ${imageHtml}
      <div class="quiz-card-body">
        <div class="quiz-card-meta">
          <div class="quiz-card-tags">
            ${tags.map(t => `<span class="quiz-tag">${this._escapeHtml(t)}</span>`).join('')}
          </div>
          <span class="quiz-card-xp-preview">+${xpPreview} XP</span>
        </div>
        <h3 class="quiz-card-question">${this._escapeHtml(card.question || 'What is the most likely diagnosis?')}</h3>
        <div class="quiz-options">
          ${card.options.map((opt, i) => `
            <button class="quiz-option-btn" data-index="${i}">
              <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
              <span class="quiz-option-text">${this._escapeHtml(opt)}</span>
            </button>
          `).join('')}
        </div>
        ${card.clinical_history ? `<div class="quiz-card-clinical"><strong>Clinical:</strong> ${this._escapeHtml(card.clinical_history)}</div>` : ''}
      </div>
      <div class="quiz-card-feedback hidden">
        <div class="quiz-feedback-header"></div>
        <div class="quiz-feedback-explanation"></div>
        <button class="btn btn-primary quiz-next-btn">Next &rarr;</button>
      </div>
    `;

    // Option click handlers
    const optionBtns = el.querySelectorAll('.quiz-option-btn');
    optionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (el.dataset.answered) return;
        el.dataset.answered = 'true';
        const idx = parseInt(btn.dataset.index);

        // Highlight selected and correct
        optionBtns.forEach(b => {
          b.disabled = true;
          const bIdx = parseInt(b.dataset.index);
          if (bIdx === card.correctAnswer) b.classList.add('quiz-option-correct');
          if (bIdx === idx && idx !== card.correctAnswer) b.classList.add('quiz-option-wrong');
          if (bIdx === idx) b.classList.add('quiz-option-selected');
        });

        // Show feedback
        const correct = idx === card.correctAnswer;
        const feedback = el.querySelector('.quiz-card-feedback');
        const header = el.querySelector('.quiz-feedback-header');
        const explanation = el.querySelector('.quiz-feedback-explanation');

        header.textContent = correct ? 'Correct!' : `Incorrect - Answer: ${card.options[card.correctAnswer]}`;
        header.className = 'quiz-feedback-header ' + (correct ? 'quiz-feedback-correct' : 'quiz-feedback-wrong');

        let explanationHtml = '';
        if (card.explanation) explanationHtml += `<p>${this._escapeHtml(card.explanation)}</p>`;
        if (card.findings && card.findings !== card.explanation) explanationHtml += `<p><strong>Findings:</strong> ${this._escapeHtml(card.findings)}</p>`;
        if (card.teaching_points && card.teaching_points !== card.explanation) explanationHtml += `<p><strong>Teaching:</strong> ${this._escapeHtml(card.teaching_points)}</p>`;
        explanation.innerHTML = explanationHtml || '<p>No additional explanation available.</p>';
        feedback.classList.remove('hidden');

        // Scroll feedback into view
        feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        onAnswer(idx);
      });
    });

    // Next button
    el.querySelector('.quiz-next-btn').addEventListener('click', () => {
      // Animate card out
      el.classList.add('quiz-card-exit');
      setTimeout(() => onNext(), 300);
    });

    // Swipe gestures for advancing
    this._attachSwipeGestures(el, onNext);

    container.innerHTML = '';
    container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => el.classList.add('quiz-card-enter'));
  }

  _attachSwipeGestures(card, onNext) {
    let startX = 0, startY = 0, currentX = 0, tracking = false;

    const onStart = (x, y) => {
      if (!card.dataset.answered) return;
      startX = x;
      startY = y;
      currentX = x;
      tracking = true;
      card.style.transition = 'none';
    };

    const onMove = (x) => {
      if (!tracking) return;
      currentX = x;
      const dx = currentX - startX;
      // Only allow right swipe and limit left
      const clampedDx = Math.max(-30, dx);
      const rotation = clampedDx * 0.05;
      card.style.transform = `translateX(${clampedDx}px) rotate(${rotation}deg)`;
      card.style.opacity = 1 - Math.abs(clampedDx) / 400;
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      const dx = currentX - startX;

      card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

      if (dx > this.swipeThreshold) {
        // Swipe right - next card
        card.style.transform = `translateX(${window.innerWidth}px) rotate(15deg)`;
        card.style.opacity = '0';
        setTimeout(() => onNext(), 300);
      } else {
        // Snap back
        card.style.transform = '';
        card.style.opacity = '';
      }
    };

    // Touch events
    card.addEventListener('touchstart', (e) => {
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    card.addEventListener('touchmove', (e) => {
      onMove(e.touches[0].clientX);
    }, { passive: true });
    card.addEventListener('touchend', () => onEnd(), { passive: true });

    // Mouse events
    card.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      onStart(e.clientX, e.clientY);
    });
    const mouseMoveHandler = (e) => onMove(e.clientX);
    const mouseUpHandler = () => {
      onEnd();
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };
    card.addEventListener('mousedown', () => {
      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', mouseUpHandler);
    });
  }

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Singleton
window.quizCards = new QuizCardComponent();
if (window.quizEngine) {
  window.quizEngine.setCardComponent(window.quizCards);
}
