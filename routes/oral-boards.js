const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const OralBoardEngine = require('../lib/oral-board-engine');

module.exports = function(db) {
  const router = express.Router();
  const engine = new OralBoardEngine(db);

  // POST /sessions - Start a new oral board session
  router.post('/sessions', requireAuth, async (req, res) => {
    const { caseId, mode, difficulty } = req.body;

    // Validate mode
    if (!mode || !['timed', 'practice'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "timed" or "practice"' });
    }

    try {
      let caseData;

      if (caseId) {
        // Use the specified case
        caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
        if (!caseData) {
          return res.status(404).json({ error: 'Case not found' });
        }
      } else {
        // Pick a random case matching difficulty or user's weak areas
        let query = 'SELECT * FROM cases';
        const params = [];

        if (difficulty && difficulty >= 1 && difficulty <= 5) {
          query += ' WHERE difficulty = ?';
          params.push(difficulty);
        }

        query += ' ORDER BY RANDOM() LIMIT 1';
        caseData = db.prepare(query).get(...params);

        if (!caseData) {
          return res.status(404).json({ error: 'No cases available' });
        }
      }

      // Generate the opening examiner message
      const examinerMessage = await engine.generateCasePresentation(caseData, mode);

      // Create session record
      const sessionId = uuidv4();
      const transcript = JSON.stringify([
        { role: 'examiner', content: examinerMessage, timestamp: new Date().toISOString() }
      ]);

      const timeLimit = mode === 'timed' ? 15 * 60 * 1000 : null; // 15 minutes for timed mode

      db.prepare(`
        INSERT INTO oral_board_sessions (id, user_id, case_id, mode, status, transcript, turn_count, started_at)
        VALUES (?, ?, ?, ?, 'active', ?, 0, CURRENT_TIMESTAMP)
      `).run(sessionId, req.user.id, caseData.id, mode, transcript);

      res.json({
        sessionId,
        caseId: caseData.id,
        mode,
        examinerMessage,
        timeLimit
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to start session. Please try again.' });
    }
  });

  // POST /sessions/:id/respond - Submit response to examiner
  router.post('/sessions/:id/respond', requireAuth, async (req, res) => {
    const { message, isVoiceTranscript } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required' });
    }

    try {
      // Load session
      const session = db.prepare('SELECT * FROM oral_board_sessions WHERE id = ?').get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Verify ownership
      if (session.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Verify session is active
      if (session.status !== 'active') {
        return res.status(400).json({ error: 'Session is not active' });
      }

      // Load case data
      const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(session.case_id);
      if (!caseData) {
        return res.status(404).json({ error: 'Associated case not found' });
      }

      // Process the response through the engine
      const result = await engine.processResponse(session, message.trim(), caseData);

      // Update transcript
      const transcript = JSON.parse(session.transcript || '[]');
      transcript.push({
        role: 'examinee',
        content: message.trim(),
        timestamp: new Date().toISOString(),
        isVoiceTranscript: !!isVoiceTranscript
      });
      transcript.push({
        role: 'examiner',
        content: result.examinerMessage,
        timestamp: new Date().toISOString()
      });

      const elapsed = Date.now() - new Date(session.started_at).getTime();

      // Update session in DB
      db.prepare(`
        UPDATE oral_board_sessions
        SET transcript = ?, turn_count = ?, duration_ms = ?
        WHERE id = ?
      `).run(JSON.stringify(transcript), result.turnNumber, elapsed, req.params.id);

      // If session auto-completes (timed mode), mark it
      if (result.isComplete) {
        db.prepare(`
          UPDATE oral_board_sessions SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(req.params.id);
      }

      res.json({
        examinerMessage: result.examinerMessage,
        turnNumber: result.turnNumber,
        elapsed_ms: elapsed,
        isComplete: result.isComplete || false
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to process response. Please try again.' });
    }
  });

  // POST /sessions/:id/end - End a session early or mark complete
  router.post('/sessions/:id/end', requireAuth, async (req, res) => {
    try {
      const session = db.prepare('SELECT * FROM oral_board_sessions WHERE id = ?').get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (session.status !== 'active') {
        return res.status(400).json({ error: 'Session is already completed' });
      }

      const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(session.case_id);
      const transcript = JSON.parse(session.transcript || '[]');

      // Generate evaluation
      let evaluation;
      try {
        evaluation = await engine.generateEvaluation(session, transcript, caseData || {});
      } catch (e) {
        evaluation = {
          overall_score: 0,
          systematic_approach: 0,
          diagnostic_accuracy: 0,
          completeness: 0,
          clinical_correlation: 0,
          strong_points: [],
          weak_points: ['Evaluation could not be generated'],
          missed_findings: [],
          recommendations: []
        };
      }

      const score = engine.calculateScore(evaluation);
      const elapsed = Date.now() - new Date(session.started_at).getTime();

      // Update session
      db.prepare(`
        UPDATE oral_board_sessions
        SET status = 'completed', evaluation = ?, score = ?, duration_ms = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(evaluation), score, elapsed, req.params.id);

      res.json({
        evaluation,
        score,
        strongPoints: evaluation.strong_points || [],
        weakPoints: evaluation.weak_points || [],
        missedFindings: evaluation.missed_findings || [],
        recommendations: evaluation.recommendations || []
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to end session. Please try again.' });
    }
  });

  // GET /sessions - List user's oral board sessions
  router.get('/sessions', requireAuth, (req, res) => {
    const { status, limit, offset } = req.query;
    const queryLimit = Math.min(parseInt(limit) || 20, 100);
    const queryOffset = parseInt(offset) || 0;

    let query = `
      SELECT obs.id, obs.case_id, c.title as case_title, obs.mode, obs.status,
             obs.score, obs.duration_ms, obs.turn_count, obs.started_at, obs.completed_at
      FROM oral_board_sessions obs
      LEFT JOIN cases c ON obs.case_id = c.id
      WHERE obs.user_id = ?
    `;
    const params = [req.user.id];

    if (status && ['active', 'completed'].includes(status)) {
      query += ' AND obs.status = ?';
      params.push(status);
    }

    query += ' ORDER BY obs.started_at DESC LIMIT ? OFFSET ?';
    params.push(queryLimit, queryOffset);

    const sessions = db.prepare(query).all(...params);

    res.json({ sessions });
  });

  // GET /sessions/:id - Get session detail with full transcript
  router.get('/sessions/:id', requireAuth, (req, res) => {
    const session = db.prepare('SELECT * FROM oral_board_sessions WHERE id = ?').get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const caseData = db.prepare('SELECT id, title, modality, body_part, difficulty FROM cases WHERE id = ?')
      .get(session.case_id);

    let transcript = [];
    try {
      transcript = JSON.parse(session.transcript || '[]');
    } catch (e) {
      transcript = [];
    }

    let evaluation = null;
    try {
      evaluation = session.evaluation ? JSON.parse(session.evaluation) : null;
    } catch (e) {
      evaluation = null;
    }

    res.json({
      session: {
        id: session.id,
        case_id: session.case_id,
        mode: session.mode,
        status: session.status,
        score: session.score,
        duration_ms: session.duration_ms,
        turn_count: session.turn_count,
        started_at: session.started_at,
        completed_at: session.completed_at
      },
      transcript,
      evaluation,
      case: caseData || null
    });
  });

  // GET /sessions/:id/replay - Get annotated replay data
  router.get('/sessions/:id/replay', requireAuth, async (req, res) => {
    const session = db.prepare('SELECT * FROM oral_board_sessions WHERE id = ?').get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(session.case_id);
    let transcript = [];
    try {
      transcript = JSON.parse(session.transcript || '[]');
    } catch (e) {
      transcript = [];
    }

    // Check for existing annotations in DB
    const existingAnnotations = db.prepare(
      'SELECT turn_number, annotation_type, content FROM oral_board_annotations WHERE session_id = ? ORDER BY turn_number'
    ).all(req.params.id);

    if (existingAnnotations.length > 0) {
      // Build replay from existing annotations
      const turns = transcript.map((entry, i) => ({
        role: entry.role,
        content: entry.content,
        timestamp: entry.timestamp,
        annotations: existingAnnotations
          .filter(a => a.turn_number === i)
          .map(a => ({ type: a.annotation_type, content: a.content }))
      }));

      return res.json({ turns, summary: '' });
    }

    // Generate annotations via AI
    try {
      const annotationResult = await engine.annotateTranscript(transcript, caseData || {});

      // Store annotations in DB
      const insertStmt = db.prepare(
        'INSERT INTO oral_board_annotations (session_id, turn_number, annotation_type, content) VALUES (?, ?, ?, ?)'
      );

      if (annotationResult.annotations && Array.isArray(annotationResult.annotations)) {
        for (const ann of annotationResult.annotations) {
          insertStmt.run(req.params.id, ann.turn_number, ann.type, ann.content);
        }
      }

      // Build replay response
      const turns = transcript.map((entry, i) => ({
        role: entry.role,
        content: entry.content,
        timestamp: entry.timestamp,
        annotations: (annotationResult.annotations || [])
          .filter(a => a.turn_number === i)
          .map(a => ({ type: a.type, content: a.content }))
      }));

      res.json({
        turns,
        summary: annotationResult.summary || ''
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate replay. Please try again.' });
    }
  });

  // DELETE /sessions/:id - Delete a session
  router.delete('/sessions/:id', requireAuth, (req, res) => {
    const session = db.prepare('SELECT * FROM oral_board_sessions WHERE id = ?').get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare('DELETE FROM oral_board_annotations WHERE session_id = ?').run(req.params.id);
    db.prepare('DELETE FROM oral_board_sessions WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  });

  // GET /stats - User's oral board prep stats
  router.get('/stats', requireAuth, (req, res) => {
    const userId = req.user.id;

    const totalSessions = db.prepare(
      'SELECT COUNT(*) as count FROM oral_board_sessions WHERE user_id = ?'
    ).get(userId).count;

    const completedSessions = db.prepare(
      "SELECT COUNT(*) as count FROM oral_board_sessions WHERE user_id = ? AND status = 'completed'"
    ).get(userId).count;

    const avgScore = db.prepare(
      "SELECT AVG(score) as avg FROM oral_board_sessions WHERE user_id = ? AND status = 'completed' AND score IS NOT NULL"
    ).get(userId).avg;

    const completionRate = totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0;

    // Recent scores (last 10 completed sessions)
    const recentScores = db.prepare(
      "SELECT score, completed_at FROM oral_board_sessions WHERE user_id = ? AND status = 'completed' AND score IS NOT NULL ORDER BY completed_at DESC LIMIT 10"
    ).all(userId).map(s => ({ score: s.score, date: s.completed_at }));

    // Weak areas: analyze evaluations for patterns
    const evaluations = db.prepare(
      "SELECT evaluation FROM oral_board_sessions WHERE user_id = ? AND status = 'completed' AND evaluation IS NOT NULL ORDER BY completed_at DESC LIMIT 20"
    ).all(userId);

    const weakAreas = [];
    let totalSystematic = 0, totalAccuracy = 0, totalCompleteness = 0, totalClinical = 0;
    let evalCount = 0;

    for (const row of evaluations) {
      try {
        const ev = JSON.parse(row.evaluation);
        totalSystematic += ev.systematic_approach || 0;
        totalAccuracy += ev.diagnostic_accuracy || 0;
        totalCompleteness += ev.completeness || 0;
        totalClinical += ev.clinical_correlation || 0;
        evalCount++;
      } catch (e) { /* skip malformed evaluations */ }
    }

    if (evalCount > 0) {
      const categories = [
        { name: 'Systematic Approach', avg: totalSystematic / evalCount, max: 25 },
        { name: 'Diagnostic Accuracy', avg: totalAccuracy / evalCount, max: 25 },
        { name: 'Completeness', avg: totalCompleteness / evalCount, max: 25 },
        { name: 'Clinical Correlation', avg: totalClinical / evalCount, max: 25 }
      ];

      // Areas scoring below 60% of max are "weak"
      for (const cat of categories) {
        if (cat.avg < cat.max * 0.6) {
          weakAreas.push(cat.name);
        }
      }
    }

    // Improvement: compare first 5 vs last 5 scores
    let improvement = null;
    if (recentScores.length >= 5) {
      const recent5 = recentScores.slice(0, 5);
      const older5 = recentScores.slice(-5);
      const recentAvg = recent5.reduce((s, r) => s + (r.score || 0), 0) / recent5.length;
      const olderAvg = older5.reduce((s, r) => s + (r.score || 0), 0) / older5.length;
      improvement = Math.round(recentAvg - olderAvg);
    }

    res.json({
      totalSessions,
      averageScore: avgScore !== null ? Math.round(avgScore * 10) / 10 : null,
      completionRate,
      weakAreas,
      improvement,
      recentScores
    });
  });

  return router;
};
