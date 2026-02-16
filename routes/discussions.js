const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

module.exports = function(db) {

  // GET /case/:caseId - Get threaded discussions for a case
  router.get('/case/:caseId', (req, res) => {
    const { caseId } = req.params;
    const sort = req.query.sort || 'top';
    const userId = req.user ? req.user.id : null;

    try {
      // Fetch all discussions for this case, joined with user info
      const discussions = db.prepare(`
        SELECT d.id, d.case_id, d.user_id, d.parent_id, d.content,
               d.discussion_type, d.upvotes, d.pinned, d.created_at, d.updated_at,
               u.username, u.display_name, u.role, u.trainee_level
        FROM case_discussions d
        LEFT JOIN users u ON d.user_id = u.id
        WHERE d.case_id = ?
      `).all(caseId);

      // If user is logged in, get their upvotes for these discussions
      let userUpvotes = new Set();
      if (userId) {
        const upvoteRows = db.prepare(`
          SELECT discussion_id FROM discussion_upvotes
          WHERE user_id = ? AND discussion_id IN (
            SELECT id FROM case_discussions WHERE case_id = ?
          )
        `).all(userId, caseId);
        for (const row of upvoteRows) {
          userUpvotes.add(row.discussion_id);
        }
      }

      // Attach user_upvoted to each discussion
      const discussionMap = {};
      const topLevel = [];
      const childrenMap = {};

      for (const d of discussions) {
        d.user_upvoted = userUpvotes.has(d.id);
        discussionMap[d.id] = { ...d, replies: [] };
      }

      // Build threaded structure (max 2 levels deep)
      for (const d of discussions) {
        const node = discussionMap[d.id];
        if (d.parent_id && discussionMap[d.parent_id]) {
          // This is a reply to a top-level comment
          const parent = discussionMap[d.parent_id];
          // Check if the parent itself has a parent (i.e., parent is already a reply)
          // If so, attach to the grandparent to enforce max 2 levels
          const originalDiscussion = discussions.find(disc => disc.id === d.parent_id);
          if (originalDiscussion && originalDiscussion.parent_id && discussionMap[originalDiscussion.parent_id]) {
            // Parent is a reply; attach to grandparent instead (flatten to 2 levels)
            discussionMap[originalDiscussion.parent_id].replies.push(node);
          } else {
            parent.replies.push(node);
          }
        } else {
          topLevel.push(node);
        }
      }

      // Sort top-level comments based on sort parameter
      if (sort === 'recent') {
        topLevel.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      } else if (sort === 'top') {
        topLevel.sort((a, b) => b.upvotes - a.upvotes);
      } else {
        // Default: pinned first, then by upvotes
        topLevel.sort((a, b) => {
          if (a.pinned !== b.pinned) return b.pinned - a.pinned;
          return b.upvotes - a.upvotes;
        });
      }

      // Sort replies by created_at ascending
      for (const comment of topLevel) {
        comment.replies.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      }

      res.json({ discussions: topLevel });
    } catch (err) {
      console.error('Error fetching discussions:', err);
      res.status(500).json({ error: 'Failed to fetch discussions' });
    }
  });

  // POST /case/:caseId - Post a comment
  router.post('/case/:caseId', requireAuth, (req, res) => {
    const { caseId } = req.params;
    const { content, discussion_type, parent_id } = req.body;
    const userId = req.user.id;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const type = discussion_type || 'comment';
    const validTypes = ['comment', 'teaching_pearl', 'question'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid discussion_type. Must be: comment, teaching_pearl, or question' });
    }

    try {
      // For teaching_pearl, check trainee_level
      if (type === 'teaching_pearl') {
        const user = db.prepare('SELECT trainee_level FROM users WHERE id = ?').get(userId);
        if (!user || (user.trainee_level !== 'fellow' && user.trainee_level !== 'attending')) {
          return res.status(403).json({ error: 'Only fellows and attendings can post teaching pearls' });
        }
      }

      // Validate parent_id if provided
      if (parent_id) {
        const parentComment = db.prepare(
          'SELECT id FROM case_discussions WHERE id = ? AND case_id = ?'
        ).get(parent_id, caseId);
        if (!parentComment) {
          return res.status(400).json({ error: 'Parent comment not found in this case' });
        }
      }

      const result = db.prepare(`
        INSERT INTO case_discussions (case_id, user_id, parent_id, content, discussion_type)
        VALUES (?, ?, ?, ?, ?)
      `).run(caseId, userId, parent_id || null, content.trim(), type);

      const created = db.prepare(`
        SELECT d.id, d.case_id, d.user_id, d.parent_id, d.content,
               d.discussion_type, d.upvotes, d.pinned, d.created_at, d.updated_at,
               u.username, u.display_name, u.role, u.trainee_level
        FROM case_discussions d
        LEFT JOIN users u ON d.user_id = u.id
        WHERE d.id = ?
      `).get(result.lastInsertRowid);

      res.json(created);
    } catch (err) {
      console.error('Error posting discussion:', err);
      res.status(500).json({ error: 'Failed to post comment' });
    }
  });

  // PUT /:id - Edit own comment
  router.put('/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { content, pinned } = req.body;
    const userId = req.user.id;

    try {
      const discussion = db.prepare('SELECT * FROM case_discussions WHERE id = ?').get(id);
      if (!discussion) {
        return res.status(404).json({ error: 'Discussion not found' });
      }

      if (discussion.user_id !== userId) {
        return res.status(403).json({ error: 'You can only edit your own comments' });
      }

      // Handle pinning: only attendings can pin
      let pinnedValue = discussion.pinned;
      if (pinned !== undefined) {
        const user = db.prepare('SELECT trainee_level FROM users WHERE id = ?').get(userId);
        if (!user || user.trainee_level !== 'attending') {
          return res.status(403).json({ error: 'Only attendings can pin comments' });
        }
        pinnedValue = pinned ? 1 : 0;
      }

      const updatedContent = (content && typeof content === 'string' && content.trim())
        ? content.trim()
        : discussion.content;

      db.prepare(`
        UPDATE case_discussions
        SET content = ?, pinned = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(updatedContent, pinnedValue, id);

      const updated = db.prepare(`
        SELECT d.id, d.case_id, d.user_id, d.parent_id, d.content,
               d.discussion_type, d.upvotes, d.pinned, d.created_at, d.updated_at,
               u.username, u.display_name, u.role, u.trainee_level
        FROM case_discussions d
        LEFT JOIN users u ON d.user_id = u.id
        WHERE d.id = ?
      `).get(id);

      res.json(updated);
    } catch (err) {
      console.error('Error editing discussion:', err);
      res.status(500).json({ error: 'Failed to edit comment' });
    }
  });

  // DELETE /:id - Delete own comment
  router.delete('/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      const discussion = db.prepare('SELECT * FROM case_discussions WHERE id = ?').get(id);
      if (!discussion) {
        return res.status(404).json({ error: 'Discussion not found' });
      }

      if (discussion.user_id !== userId) {
        return res.status(403).json({ error: 'You can only delete your own comments' });
      }

      // Delete associated upvotes
      db.prepare('DELETE FROM discussion_upvotes WHERE discussion_id = ?').run(id);

      // Delete the discussion
      db.prepare('DELETE FROM case_discussions WHERE id = ?').run(id);

      res.json({ message: 'Comment deleted' });
    } catch (err) {
      console.error('Error deleting discussion:', err);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  });

  // POST /:id/upvote - Toggle upvote
  router.post('/:id/upvote', requireAuth, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      const discussion = db.prepare('SELECT * FROM case_discussions WHERE id = ?').get(id);
      if (!discussion) {
        return res.status(404).json({ error: 'Discussion not found' });
      }

      const existingUpvote = db.prepare(
        'SELECT * FROM discussion_upvotes WHERE user_id = ? AND discussion_id = ?'
      ).get(userId, id);

      if (existingUpvote) {
        // Remove upvote
        db.prepare('DELETE FROM discussion_upvotes WHERE user_id = ? AND discussion_id = ?').run(userId, id);
        db.prepare('UPDATE case_discussions SET upvotes = upvotes - 1 WHERE id = ?').run(id);

        const updated = db.prepare('SELECT upvotes FROM case_discussions WHERE id = ?').get(id);
        res.json({ upvoted: false, upvotes: updated.upvotes });
      } else {
        // Add upvote
        db.prepare('INSERT INTO discussion_upvotes (user_id, discussion_id) VALUES (?, ?)').run(userId, id);
        db.prepare('UPDATE case_discussions SET upvotes = upvotes + 1 WHERE id = ?').run(id);

        const updated = db.prepare('SELECT upvotes FROM case_discussions WHERE id = ?').get(id);
        res.json({ upvoted: true, upvotes: updated.upvotes });
      }
    } catch (err) {
      console.error('Error toggling upvote:', err);
      res.status(500).json({ error: 'Failed to toggle upvote' });
    }
  });

  return router;
};
