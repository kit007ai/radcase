const AIProvider = require('./ai-provider');

class AITutorEngine {
  constructor(db) {
    this.db = db;
    this.ai = new AIProvider(db);
  }

  /**
   * Build a context-aware system prompt based on the case data, trainee level, and study step.
   */
  buildSystemPrompt(caseData, traineeLevel, step) {
    const levelDescriptions = {
      student: 'a medical student learning the basics of radiology interpretation',
      resident: 'a radiology resident building diagnostic skills for board exams',
      fellow: 'a radiology fellow refining subspecialty expertise',
      attending: 'an attending radiologist reviewing cases for teaching purposes'
    };

    const levelDesc = levelDescriptions[traineeLevel] || levelDescriptions.resident;

    let basePrompt = `You are an expert radiology tutor using the Socratic method. Your trainee is ${levelDesc}.

CORE PRINCIPLES:
- Guide, don't tell. Ask questions that lead the trainee to discover answers themselves.
- Be concise: 2-3 sentences for hints, 1-2 short paragraphs for explanations.
- Reference specific imaging findings when relevant.
- Connect findings to board exam relevance when appropriate.
- Never reveal the final diagnosis unless explicitly asked after the trainee has attempted reasoning.
- Adapt your language complexity to the trainee's level.`;

    if (caseData) {
      basePrompt += `

CASE CONTEXT:
- Modality: ${caseData.modality || 'Unknown'}
- Body Part: ${caseData.body_part || 'Unknown'}
- Difficulty: ${caseData.difficulty || 'Unknown'}/5
- Clinical History: ${caseData.clinical_history || 'Not provided'}`;

      // Only include findings/diagnosis in prompt if the step allows it
      if (step === 'reveal' || step === 'teaching') {
        basePrompt += `
- Findings: ${caseData.findings || 'Not provided'}
- Diagnosis: ${caseData.diagnosis || 'Not provided'}
- Teaching Points: ${caseData.teaching_points || 'Not provided'}`;
      } else if (step === 'differential') {
        basePrompt += `
- Findings: ${caseData.findings || 'Not provided'}
- Actual Diagnosis (DO NOT reveal to trainee): ${caseData.diagnosis || 'Not provided'}`;
      } else {
        basePrompt += `
- Actual Diagnosis (DO NOT reveal to trainee): ${caseData.diagnosis || 'Not provided'}`;
      }
    }

    if (step) {
      const stepInstructions = {
        history: 'The trainee is reviewing the clinical history. Help them identify relevant clinical clues and think about what imaging findings to expect.',
        images: 'The trainee is viewing images. Guide them through a systematic approach to image interpretation without revealing findings directly.',
        differential: 'The trainee is building a differential diagnosis. Help them reason through possibilities based on imaging features.',
        reveal: 'The diagnosis has been revealed. Help the trainee understand the key findings and why they support this diagnosis.',
        teaching: 'This is a teaching moment. Provide educational context, board-relevant pearls, and help solidify understanding.'
      };

      if (stepInstructions[step]) {
        basePrompt += `\n\nCURRENT STEP: ${step}\n${stepInstructions[step]}`;
      }
    }

    return basePrompt;
  }

  /**
   * Generate Socratic questions for a given study step.
   */
  async generateSocraticQuestions(caseData, step, userHistory) {
    const systemPrompt = this.buildSystemPrompt(caseData, 'resident', step);

    let userMessage = `Generate 2-3 Socratic questions appropriate for the "${step}" step of studying this case.`;
    if (userHistory && userHistory.length > 0) {
      userMessage += `\n\nThe trainee has already discussed: ${userHistory.join('; ')}`;
    }

    const response = await this.ai.chat(
      systemPrompt,
      [{ role: 'user', content: userMessage }],
      { maxTokens: 500, temperature: 0.7 }
    );

    // Parse questions from response
    const questions = response
      .split('\n')
      .filter(line => line.trim().match(/^\d+[\.\)]/))
      .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(q => q.length > 0);

    return questions.length > 0 ? questions : [response.trim()];
  }

  /**
   * Evaluate the trainee's differential diagnosis attempt with teaching feedback.
   */
  async evaluateDifferential(caseData, userDifferentials) {
    const systemPrompt = this.buildSystemPrompt(caseData, 'resident', 'differential');

    const prompt = `The trainee submitted these differential diagnoses: ${JSON.stringify(userDifferentials)}

The actual diagnosis is: ${caseData.diagnosis}
${caseData.differentials ? `The expected differentials include: ${caseData.differentials}` : ''}

Evaluate their differential list. For each submitted diagnosis:
1. Is it reasonable given the imaging findings?
2. What findings support or argue against it?

Then identify any important diagnoses they missed.

Respond in this JSON format:
{
  "feedback": "Overall assessment (2-3 sentences)",
  "matched": ["list of correct/reasonable differentials"],
  "missed": ["important diagnoses they missed"],
  "reasoning": "Brief teaching explanation of the key distinguishing features"
}`;

    const response = await this.ai.generateJSON(prompt, { maxTokens: 1500 });
    return response;
  }

  /**
   * Compare a trainee report to the attending-level findings/diagnosis.
   */
  async evaluateReport(caseData, traineeReport) {
    const systemPrompt = `You are an attending radiologist evaluating a trainee's radiology report. Be thorough but constructive.`;

    const prompt = `Compare this trainee report to the expected findings and diagnosis.

CASE INFORMATION:
- Modality: ${caseData.modality || 'Unknown'}
- Body Part: ${caseData.body_part || 'Unknown'}
- Actual Findings: ${caseData.findings || 'Not documented'}
- Actual Diagnosis: ${caseData.diagnosis || 'Not documented'}
- Teaching Points: ${caseData.teaching_points || 'None'}

TRAINEE'S REPORT:
${traineeReport}

Evaluate the report and respond in this JSON format:
{
  "feedback": "Overall assessment of the report quality and accuracy (2-3 sentences)",
  "missedFindings": ["list of findings the trainee missed"],
  "overcalls": ["list of findings the trainee mentioned that are not present or incorrect"],
  "score": <number 0-100 representing overall accuracy>,
  "suggestions": ["specific suggestions for improvement"]
}`;

    const response = await this.ai.generateJSON(prompt, { maxTokens: 2000 });
    return response;
  }

  /**
   * Analyze user performance data and generate insights about their weaknesses.
   */
  async analyzeWeaknesses(userId) {
    // Gather performance data
    const byBodyPart = this.db.prepare(`
      SELECT c.body_part, COUNT(*) as attempts, SUM(qa.correct) as correct,
             ROUND(CAST(SUM(qa.correct) AS FLOAT) / COUNT(*) * 100, 1) as accuracy
      FROM quiz_attempts qa
      JOIN cases c ON qa.case_id = c.id
      WHERE qa.user_id = ? AND c.body_part IS NOT NULL
      GROUP BY c.body_part
      ORDER BY accuracy ASC
    `).all(userId);

    const byModality = this.db.prepare(`
      SELECT c.modality, COUNT(*) as attempts, SUM(qa.correct) as correct,
             ROUND(CAST(SUM(qa.correct) AS FLOAT) / COUNT(*) * 100, 1) as accuracy
      FROM quiz_attempts qa
      JOIN cases c ON qa.case_id = c.id
      WHERE qa.user_id = ? AND c.modality IS NOT NULL
      GROUP BY c.modality
      ORDER BY accuracy ASC
    `).all(userId);

    const byDiagnosis = this.db.prepare(`
      SELECT c.diagnosis, COUNT(*) as attempts, SUM(qa.correct) as correct,
             ROUND(CAST(SUM(qa.correct) AS FLOAT) / COUNT(*) * 100, 1) as accuracy
      FROM quiz_attempts qa
      JOIN cases c ON qa.case_id = c.id
      WHERE qa.user_id = ? AND c.diagnosis IS NOT NULL
      GROUP BY c.diagnosis
      HAVING attempts >= 2
      ORDER BY accuracy ASC
      LIMIT 20
    `).all(userId);

    // Differential attempts analysis
    const differentialStats = this.db.prepare(`
      SELECT c.body_part, c.modality, AVG(da.score) as avg_score, COUNT(*) as attempts
      FROM differential_attempts da
      JOIN cases c ON da.case_id = c.id
      WHERE da.user_id = ?
      GROUP BY c.body_part, c.modality
      ORDER BY avg_score ASC
    `).all(userId);

    // Identify weak areas (accuracy below 60% with at least 3 attempts)
    const weakBodyParts = byBodyPart.filter(bp => bp.accuracy < 60 && bp.attempts >= 3).map(bp => bp.body_part);
    const weakModalities = byModality.filter(m => m.accuracy < 60 && m.attempts >= 3).map(m => m.modality);
    const weakDiagnoses = byDiagnosis.filter(d => d.accuracy < 60).map(d => d.diagnosis);

    const performanceData = { byBodyPart, byModality, byDiagnosis, differentialStats };

    // If there's enough data, use AI to generate a natural language analysis
    let aiAnalysis = null;
    const totalAttempts = byBodyPart.reduce((sum, bp) => sum + bp.attempts, 0);
    if (totalAttempts >= 5 && this.ai.isConfigured()) {
      try {
        const prompt = `Analyze this radiology trainee's performance data and provide personalized learning recommendations.

Performance by Body Part: ${JSON.stringify(byBodyPart)}
Performance by Modality: ${JSON.stringify(byModality)}
Weakest Diagnoses: ${JSON.stringify(byDiagnosis.slice(0, 10))}
Differential Performance: ${JSON.stringify(differentialStats)}

Respond in this JSON format:
{
  "weaknesses": ["list of specific weakness descriptions"],
  "recommendations": ["list of actionable study recommendations"],
  "focusAreas": ["list of high-priority topics to study next"]
}`;

        aiAnalysis = await this.ai.generateJSON(prompt, { maxTokens: 1500 });
      } catch (e) {
        // AI analysis failed, we'll return data-only analysis
      }
    }

    // Build the analysis result
    const analysis = {
      weaknesses: aiAnalysis?.weaknesses || weakBodyParts.map(bp => `Low accuracy in ${bp} cases`),
      recommendations: aiAnalysis?.recommendations || [
        weakBodyParts.length > 0 ? `Focus on ${weakBodyParts.join(', ')} anatomy` : 'Continue broad practice',
        weakModalities.length > 0 ? `Review ${weakModalities.join(', ')} interpretation fundamentals` : 'Maintain modality diversity'
      ],
      focusAreas: aiAnalysis?.focusAreas || [...weakBodyParts, ...weakModalities].slice(0, 5),
      performanceData
    };

    // Store analysis in DB
    this.db.prepare(`
      INSERT OR REPLACE INTO weakness_analysis
      (user_id, analysis_data, weak_body_parts, weak_modalities, weak_diagnoses, last_updated)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      userId,
      JSON.stringify(analysis),
      JSON.stringify(weakBodyParts),
      JSON.stringify(weakModalities),
      JSON.stringify(weakDiagnoses)
    );

    return analysis;
  }

  /**
   * Get recommended cases based on weakness analysis.
   */
  getRecommendedCases(userId, limit = 10) {
    // Load weakness analysis
    const analysis = this.db.prepare('SELECT * FROM weakness_analysis WHERE user_id = ?').get(userId);
    if (!analysis) {
      // No analysis yet, return random unattempted cases
      return this.db.prepare(`
        SELECT c.id, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty
        FROM cases c
        WHERE c.id NOT IN (
          SELECT DISTINCT case_id FROM quiz_attempts WHERE user_id = ?
        )
        ORDER BY RANDOM()
        LIMIT ?
      `).all(userId, limit);
    }

    let weakBodyParts, weakModalities, weakDiagnoses;
    try { weakBodyParts = JSON.parse(analysis.weak_body_parts || '[]'); } catch (e) { weakBodyParts = []; }
    try { weakModalities = JSON.parse(analysis.weak_modalities || '[]'); } catch (e) { weakModalities = []; }
    try { weakDiagnoses = JSON.parse(analysis.weak_diagnoses || '[]'); } catch (e) { weakDiagnoses = []; }

    // Build a query that prioritizes weak areas
    let cases = [];

    // First, find cases in weak body parts that haven't been mastered
    if (weakBodyParts.length > 0) {
      const placeholders = weakBodyParts.map(() => '?').join(',');
      const weakCases = this.db.prepare(`
        SELECT c.id, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty,
               'weak_body_part' as recommendation_reason
        FROM cases c
        WHERE c.body_part IN (${placeholders})
        AND c.id NOT IN (
          SELECT case_id FROM user_case_progress
          WHERE user_id = ? AND repetitions >= 3 AND interval_days >= 21
        )
        ORDER BY RANDOM()
        LIMIT ?
      `).all(...weakBodyParts, userId, Math.ceil(limit / 2));
      cases.push(...weakCases);
    }

    // Then, find cases in weak modalities
    if (weakModalities.length > 0 && cases.length < limit) {
      const placeholders = weakModalities.map(() => '?').join(',');
      const existingIds = cases.map(c => c.id);
      const weakModalityCases = this.db.prepare(`
        SELECT c.id, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty,
               'weak_modality' as recommendation_reason
        FROM cases c
        WHERE c.modality IN (${placeholders})
        AND c.id NOT IN (
          SELECT case_id FROM user_case_progress
          WHERE user_id = ? AND repetitions >= 3 AND interval_days >= 21
        )
        ORDER BY RANDOM()
        LIMIT ?
      `).all(...weakModalities, userId, limit - cases.length);
      // Deduplicate
      for (const mc of weakModalityCases) {
        if (!existingIds.includes(mc.id)) {
          cases.push(mc);
        }
      }
    }

    // Fill remaining with unattempted cases
    if (cases.length < limit) {
      const existingIds = cases.map(c => c.id);
      const fillerPlaceholders = existingIds.length > 0
        ? `AND c.id NOT IN (${existingIds.map(() => '?').join(',')})`
        : '';
      const fillerCases = this.db.prepare(`
        SELECT c.id, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty,
               'unattempted' as recommendation_reason
        FROM cases c
        WHERE c.id NOT IN (
          SELECT DISTINCT case_id FROM quiz_attempts WHERE user_id = ?
        )
        ${fillerPlaceholders}
        ORDER BY RANDOM()
        LIMIT ?
      `).all(userId, ...existingIds, limit - cases.length);
      cases.push(...fillerCases);
    }

    // Store recommended case IDs
    const caseIds = cases.map(c => c.id);
    this.db.prepare(`
      UPDATE weakness_analysis SET recommended_case_ids = ?, last_updated = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(JSON.stringify(caseIds), userId);

    return cases;
  }
}

module.exports = AITutorEngine;
