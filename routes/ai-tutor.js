const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const AITutorEngine = require('../lib/ai-tutor-engine');

module.exports = function(db) {
  const router = express.Router();
  const engine = new AITutorEngine(db);

  // GET /api/ai/status - Check if AI is configured (no auth required)
  router.get('/status', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM ai_config').all();
    const config = {};
    rows.forEach(r => { config[r.key] = r.value; });
    res.json({
      configured: !!(config.provider && config.apiKey),
      provider: config.provider || null
    });
  });

  // POST /api/ai/chat - Chat with AI tutor
  router.post('/chat', requireAuth, async (req, res) => {
    const { caseId, message, conversationId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    try {
      // Load case context if provided
      let caseData = null;
      if (caseId) {
        caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
        if (!caseData) {
          return res.status(404).json({ error: 'Case not found' });
        }
      }

      // Load or create conversation
      let conversation;
      let convoId = conversationId;
      if (convoId) {
        conversation = db.prepare('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?')
          .get(convoId, req.user.id);
        if (!conversation) {
          return res.status(404).json({ error: 'Conversation not found' });
        }
      }

      // Parse existing messages
      let messages = [];
      if (conversation) {
        try {
          messages = JSON.parse(conversation.messages || '[]');
        } catch (e) {
          messages = [];
        }
      } else {
        convoId = uuidv4();
      }

      // Add user message
      messages.push({ role: 'user', content: message.trim() });

      // Build system prompt
      const traineeLevel = req.user.traineeLevel || 'resident';
      const systemPrompt = engine.buildSystemPrompt(caseData, traineeLevel, null);

      // Get AI response
      const aiResponse = await engine.ai.chat(systemPrompt, messages, {
        maxTokens: 1000,
        temperature: 0.7
      });

      // Add assistant response
      messages.push({ role: 'assistant', content: aiResponse });

      // Save conversation
      if (conversation) {
        db.prepare(`
          UPDATE ai_conversations SET messages = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(JSON.stringify(messages), convoId);
      } else {
        db.prepare(`
          INSERT INTO ai_conversations (id, user_id, case_id, conversation_type, messages)
          VALUES (?, ?, ?, 'chat', ?)
        `).run(convoId, req.user.id, caseId || null, JSON.stringify(messages));
      }

      res.json({
        response: aiResponse,
        conversationId: convoId
      });
    } catch (err) {
      res.status(500).json({ error: 'AI chat failed. Please try again.' });
    }
  });

  // POST /api/ai/hint/:caseId - Get progressive hint
  router.post('/hint/:caseId', requireAuth, async (req, res) => {
    const { caseId } = req.params;
    const { hintLevel, step } = req.body;

    if (!hintLevel || hintLevel < 1 || hintLevel > 4) {
      return res.status(400).json({ error: 'hintLevel must be between 1 and 4' });
    }

    try {
      const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
      if (!caseData) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const traineeLevel = req.user.traineeLevel || 'resident';
      const systemPrompt = engine.buildSystemPrompt(caseData, traineeLevel, step || 'images');

      const hintDescriptions = {
        1: 'Give a very subtle hint about which anatomical region to focus on. Do NOT mention any specific findings or the diagnosis.',
        2: 'Hint at what type of abnormality pattern to look for (e.g., density change, shape abnormality) without naming it specifically.',
        3: 'Describe the key imaging finding more directly but still do NOT reveal the diagnosis. Ask a leading question.',
        4: 'Strongly hint at the diagnosis category without stating the exact diagnosis. Mention the most characteristic finding.'
      };

      const hintPrompt = `${hintDescriptions[hintLevel]}

This is hint level ${hintLevel} of 4 (1=most subtle, 4=nearly reveals answer).
Keep the hint to 2-3 sentences maximum.`;

      const hint = await engine.ai.chat(
        systemPrompt,
        [{ role: 'user', content: hintPrompt }],
        { maxTokens: 300, temperature: 0.6 }
      );

      res.json({
        hint,
        hintLevel: parseInt(hintLevel)
      });
    } catch (err) {
      res.status(500).json({ error: 'Hint generation failed. Please try again.' });
    }
  });

  // POST /api/ai/guidance/:caseId - Get step-specific guidance
  router.post('/guidance/:caseId', requireAuth, async (req, res) => {
    const { caseId } = req.params;
    const { step, userInput } = req.body;

    const validSteps = ['history', 'images', 'differential', 'reveal', 'teaching'];
    if (!step || !validSteps.includes(step)) {
      return res.status(400).json({ error: `step must be one of: ${validSteps.join(', ')}` });
    }

    try {
      const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
      if (!caseData) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const traineeLevel = req.user.traineeLevel || 'resident';

      // For differential step with user input, evaluate their differentials
      if (step === 'differential' && userInput) {
        const userDifferentials = Array.isArray(userInput) ? userInput : [userInput];
        const evaluation = await engine.evaluateDifferential(caseData, userDifferentials);
        return res.json({
          guidance: evaluation.feedback || evaluation.reasoning || 'Review your differentials.',
          questions: []
        });
      }

      // Generate Socratic questions for the step
      const questions = await engine.generateSocraticQuestions(caseData, step, []);

      // Generate step-specific guidance
      const systemPrompt = engine.buildSystemPrompt(caseData, traineeLevel, step);
      const guidance = await engine.ai.chat(
        systemPrompt,
        [{ role: 'user', content: `Provide brief Socratic guidance for the "${step}" step of this case. 1-2 sentences.` }],
        { maxTokens: 300, temperature: 0.7 }
      );

      res.json({
        guidance,
        questions
      });
    } catch (err) {
      res.status(500).json({ error: 'Guidance generation failed. Please try again.' });
    }
  });

  // POST /api/ai/evaluate-report - Evaluate trainee's structured report
  router.post('/evaluate-report', requireAuth, async (req, res) => {
    const { caseId, traineeReport } = req.body;

    if (!caseId) {
      return res.status(400).json({ error: 'caseId is required' });
    }
    if (!traineeReport || typeof traineeReport !== 'string' || traineeReport.trim().length === 0) {
      return res.status(400).json({ error: 'traineeReport is required' });
    }

    try {
      const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
      if (!caseData) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const evaluation = await engine.evaluateReport(caseData, traineeReport.trim());

      // Store the attempt
      db.prepare(`
        INSERT INTO report_attempts (user_id, case_id, trainee_report, ai_feedback, score, missed_findings, overcalls)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user.id,
        caseId,
        traineeReport.trim(),
        evaluation.feedback || '',
        evaluation.score || 0,
        JSON.stringify(evaluation.missedFindings || []),
        JSON.stringify(evaluation.overcalls || [])
      );

      res.json({
        feedback: evaluation.feedback || '',
        missedFindings: evaluation.missedFindings || [],
        overcalls: evaluation.overcalls || [],
        score: evaluation.score || 0,
        suggestions: evaluation.suggestions || []
      });
    } catch (err) {
      res.status(500).json({ error: 'Report evaluation failed. Please try again.' });
    }
  });

  // POST /api/ai/weakness-analysis - Analyze user's weaknesses
  router.post('/weakness-analysis', requireAuth, async (req, res) => {
    try {
      const analysis = await engine.analyzeWeaknesses(req.user.id);
      res.json(analysis);
    } catch (err) {
      res.status(500).json({ error: 'Weakness analysis failed. Please try again.' });
    }
  });

  // POST /api/ai/practice-recommendations - Get personalized case recommendations
  router.post('/practice-recommendations', requireAuth, (req, res) => {
    try {
      const cases = engine.getRecommendedCases(req.user.id, 10);
      const analysis = db.prepare('SELECT analysis_data FROM weakness_analysis WHERE user_id = ?')
        .get(req.user.id);

      let reason = 'Recommended cases based on your performance patterns.';
      if (analysis && analysis.analysis_data) {
        try {
          const data = JSON.parse(analysis.analysis_data);
          if (data.focusAreas && data.focusAreas.length > 0) {
            reason = `Targeting your weak areas: ${data.focusAreas.slice(0, 3).join(', ')}.`;
          }
        } catch (e) {
          // Use default reason
        }
      }

      res.json({
        cases,
        reason
      });
    } catch (err) {
      res.status(500).json({ error: 'Practice recommendations failed. Please try again.' });
    }
  });

  return router;
};
