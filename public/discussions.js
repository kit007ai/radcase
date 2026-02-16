window.discussionPanel = {
  caseId: null,
  discussions: [],
  container: null,
  expanded: false,

  init(containerEl, caseId) {
    this.container = containerEl;
    this.caseId = caseId;
    this.discussions = [];
    this.expanded = false;
    this.render();
    this.loadDiscussions();
  },

  async loadDiscussions() {
    try {
      const res = await fetch(`/api/discussions/case/${this.caseId}`, { credentials: 'include' });
      const data = await res.json();
      this.discussions = data.discussions || [];
      this.renderDiscussions();
    } catch (e) { console.error('Failed to load discussions:', e); }
  },

  render() {
    this.container.innerHTML = `
      <div class="discussion-panel">
        <div class="discussion-header" id="discussionToggle">
          <h4>Discussion (<span id="discussionCount">0</span>)</h4>
          <span class="discussion-chevron">▼</span>
        </div>
        <div class="discussion-body" id="discussionBody" style="display:none;">
          <div class="discussion-list" id="discussionList"></div>
          <div class="discussion-compose" id="discussionCompose"></div>
        </div>
      </div>
    `;
    // Toggle expand/collapse
    this.container.querySelector('#discussionToggle').addEventListener('click', () => {
      this.expanded = !this.expanded;
      const body = this.container.querySelector('#discussionBody');
      const chevron = this.container.querySelector('.discussion-chevron');
      body.style.display = this.expanded ? 'block' : 'none';
      chevron.textContent = this.expanded ? '▲' : '▼';
    });
    this.renderComposeBox();
  },

  renderDiscussions() {
    const listEl = this.container.querySelector('#discussionList');
    const countEl = this.container.querySelector('#discussionCount');
    if (!listEl) return;

    const totalCount = this.discussions.reduce((sum, d) => sum + 1 + (d.replies ? d.replies.length : 0), 0);
    if (countEl) countEl.textContent = totalCount;

    if (this.discussions.length === 0) {
      listEl.innerHTML = '<p class="discussion-empty">No discussions yet. Be the first to comment!</p>';
      return;
    }

    listEl.innerHTML = this.discussions.map(d => this.renderComment(d, 0)).join('');
  },

  renderComment(comment, depth) {
    const typeBadge = this.getTypeBadge(comment.discussion_type);
    const roleBadge = comment.trainee_level ? `<span class="discussion-role-badge role-${comment.trainee_level}">${comment.trainee_level}</span>` : '';
    const pinned = comment.pinned ? '<span class="discussion-pinned">📌 Pinned</span>' : '';
    const upvoted = comment.user_upvoted ? 'upvoted' : '';

    const repliesHtml = (comment.replies || []).map(r => this.renderComment(r, depth + 1)).join('');

    return `
      <div class="discussion-comment depth-${Math.min(depth, 2)} ${comment.discussion_type === 'teaching_pearl' ? 'pearl' : ''}" data-id="${comment.id}">
        ${pinned}
        <div class="discussion-comment-header">
          <span class="discussion-author">${comment.display_name || comment.username}</span>
          ${roleBadge}
          ${typeBadge}
          <span class="discussion-time">${this.timeAgo(comment.created_at)}</span>
        </div>
        <div class="discussion-content">${escapeHtml(comment.content)}</div>
        <div class="discussion-actions">
          <button class="discussion-upvote-btn ${upvoted}" onclick="discussionPanel.toggleUpvote(${comment.id})">
            ▲ <span>${comment.upvotes || 0}</span>
          </button>
          ${depth < 2 ? `<button class="discussion-reply-btn" onclick="discussionPanel.showReplyBox(${comment.id})">Reply</button>` : ''}
        </div>
        <div class="discussion-reply-box" id="replyBox-${comment.id}"></div>
        ${repliesHtml ? `<div class="discussion-replies">${repliesHtml}</div>` : ''}
      </div>
    `;
  },

  getTypeBadge(type) {
    const badges = {
      teaching_pearl: '<span class="discussion-type-badge pearl">⭐ Teaching Pearl</span>',
      question: '<span class="discussion-type-badge question">❓ Question</span>',
      answer: '<span class="discussion-type-badge answer">✅ Answer</span>',
      comment: ''
    };
    return badges[type] || '';
  },

  renderComposeBox() {
    const compose = this.container.querySelector('#discussionCompose');
    if (!compose) return;
    compose.innerHTML = `
      <div class="discussion-compose-inner">
        <textarea class="discussion-textarea" id="discussionInput" placeholder="Add to the discussion..." rows="2"></textarea>
        <div class="discussion-compose-actions">
          <select class="discussion-type-select" id="discussionTypeSelect">
            <option value="comment">Comment</option>
            <option value="question">Question</option>
            <option value="teaching_pearl">Teaching Pearl</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="discussionPanel.postComment()">Post</button>
        </div>
      </div>
    `;
  },

  showReplyBox(parentId) {
    const box = document.getElementById(`replyBox-${parentId}`);
    if (!box) return;
    if (box.innerHTML) { box.innerHTML = ''; return; } // toggle off
    box.innerHTML = `
      <div class="discussion-reply-compose">
        <textarea class="discussion-textarea" id="replyInput-${parentId}" placeholder="Write a reply..." rows="2"></textarea>
        <button class="btn btn-primary btn-sm" onclick="discussionPanel.postReply(${parentId})">Reply</button>
      </div>
    `;
  },

  async postComment() {
    const input = document.getElementById('discussionInput');
    const typeSelect = document.getElementById('discussionTypeSelect');
    if (!input || !input.value.trim()) return;
    try {
      await fetch(`/api/discussions/case/${this.caseId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ content: input.value.trim(), discussion_type: typeSelect.value })
      });
      input.value = '';
      this.loadDiscussions();
    } catch (e) { console.error('Failed to post comment:', e); }
  },

  async postReply(parentId) {
    const input = document.getElementById(`replyInput-${parentId}`);
    if (!input || !input.value.trim()) return;
    try {
      await fetch(`/api/discussions/case/${this.caseId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ content: input.value.trim(), discussion_type: 'comment', parent_id: parentId })
      });
      this.loadDiscussions();
    } catch (e) { console.error('Failed to post reply:', e); }
  },

  async toggleUpvote(discussionId) {
    try {
      const res = await fetch(`/api/discussions/${discussionId}/upvote`, {
        method: 'POST', credentials: 'include'
      });
      const data = await res.json();
      // Update inline
      const btn = this.container.querySelector(`.discussion-comment[data-id="${discussionId}"] .discussion-upvote-btn`);
      if (btn) {
        btn.classList.toggle('upvoted', data.upvoted);
        btn.querySelector('span').textContent = data.upvotes;
      }
    } catch (e) { console.error('Failed to toggle upvote:', e); }
  },

  timeAgo(dateStr) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  },

  destroy() {
    if (this.container) this.container.innerHTML = '';
    this.discussions = [];
  }
};
