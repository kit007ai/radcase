const AIProvider = require('./ai-provider');

class OralBoardEngine {
  constructor(db) {
    this.db = db;
    this.ai = new AIProvider(db);
  }

  /**
   * Generate the opening examiner message for a case.
   * Presents the clinical scenario and asks the examinee to begin.
   */
  async generateCasePresentation(caseData, mode) {
    const systemPrompt = this.buildExaminerPrompt(caseData, mode, 0);

    const presentationPrompt = `Present the following case to the examinee as an ABR oral board examiner would.

Clinical History: ${caseData.clinical_history || 'Not provided'}
Modality: ${caseData.modality || 'Unknown'}
Body Part: ${caseData.body_part || 'Unknown'}

Begin with "Please review the following clinical scenario..." and present the relevant clinical information.
Then ask the examinee to describe their findings on the study.
Do NOT reveal any findings, diagnosis, or teaching points.
Keep the presentation concise (3-5 sentences).`;

    const message = await this.ai.chat(
      systemPrompt,
      [{ role: 'user', content: presentationPrompt }],
      { maxTokens: 500, temperature: 0.6 }
    );

    return message;
  }

  /**
   * Build the ABR-style examiner system prompt.
   * Adjusts behavior based on mode and turn number.
   */
  buildExaminerPrompt(caseData, mode, turnNumber) {
    const modeInstructions = mode === 'timed'
      ? `You are conducting a TIMED oral board examination (15 minutes).
Be rigorous and efficient. Do not offer hints or extra guidance.
Move through topics briskly: findings, differential, management.
If the examinee is slow or off-track, redirect them firmly but professionally.`
      : `You are conducting a PRACTICE oral board session.
Be patient and supportive while maintaining examiner standards.
If the examinee struggles, offer gentle redirection (e.g., "What else might you consider?").
Allow more time for reasoning but still probe systematically.`;

    let prompt = `You are an ABR (American Board of Radiology) oral board examiner conducting a radiology case examination.

${modeInstructions}

EXAMINER BEHAVIOR:
- Start broad: "Describe the findings on this study"
- Probe systematically through: anatomy, pathology, differential diagnosis, management
- Never give away answers directly
- Use redirecting questions: "What else might you consider?", "Can you be more specific?", "What about the [region]?"
- Track what the examinee has covered vs missed
- Acknowledge correct observations briefly, then push for more
- If the examinee mentions an incorrect finding, ask them to look again rather than correcting directly
- Maintain professional, neutral examiner tone throughout

SCORING CRITERIA (track mentally):
1. Systematic Approach (0-25): Did they use a systematic search pattern?
2. Diagnostic Accuracy (0-25): Did they identify the correct diagnosis?
3. Completeness (0-25): Did they identify all significant findings?
4. Clinical Correlation (0-25): Did they connect findings to clinical management?`;

    if (caseData) {
      prompt += `

CASE INFORMATION (known to examiner, NOT to be revealed):
- Title: ${caseData.title || 'Unknown'}
- Modality: ${caseData.modality || 'Unknown'}
- Body Part: ${caseData.body_part || 'Unknown'}
- Difficulty: ${caseData.difficulty || 'Unknown'}/5
- Clinical History: ${caseData.clinical_history || 'Not provided'}
- Key Findings: ${caseData.findings || 'Not documented'}
- Diagnosis: ${caseData.diagnosis || 'Not documented'}
- Teaching Points: ${caseData.teaching_points || 'Not documented'}
- Differentials: ${caseData.differentials || 'Not documented'}`;
    }

    if (turnNumber > 0) {
      prompt += `

Current turn: ${turnNumber}. `;
      if (turnNumber >= 8) {
        prompt += 'The examination is nearing its end. Begin wrapping up by asking for a final summary or management plan.';
      } else if (turnNumber >= 5) {
        prompt += 'The examination is in its later phase. Ensure differential diagnosis and clinical correlation have been addressed.';
      } else if (turnNumber >= 3) {
        prompt += 'Move from findings to differential diagnosis and pathology discussion.';
      }
    }

    return prompt;
  }

  /**
   * Process a user response and generate the examiner follow-up.
   */
  async processResponse(session, userMessage, caseData) {
    const transcript = JSON.parse(session.transcript || '[]');
    const turnNumber = session.turn_count + 1;

    const systemPrompt = this.buildExaminerPrompt(caseData, session.mode, turnNumber);

    // Build conversation history for AI context
    const messages = transcript.map(entry => ({
      role: entry.role === 'examiner' ? 'assistant' : 'user',
      content: entry.content
    }));
    messages.push({ role: 'user', content: userMessage });

    const examinerResponse = await this.ai.chat(
      systemPrompt,
      messages,
      { maxTokens: 600, temperature: 0.6 }
    );

    // Determine if session should auto-complete (in timed mode after many turns)
    const isComplete = session.mode === 'timed' && turnNumber >= 12;

    return {
      examinerMessage: examinerResponse,
      turnNumber,
      isComplete
    };
  }

  /**
   * Generate final evaluation when session ends.
   * Returns structured rubric-based assessment.
   */
  async generateEvaluation(session, transcript, caseData) {
    const systemPrompt = `You are an ABR oral board examiner providing a structured performance evaluation.
Be fair, specific, and constructive. Reference actual statements from the transcript.`;

    const transcriptText = transcript.map(entry =>
      `[${entry.role.toUpperCase()}]: ${entry.content}`
    ).join('\n\n');

    const prompt = `Evaluate this oral board examination performance.

CASE:
- Diagnosis: ${caseData.diagnosis || 'Unknown'}
- Key Findings: ${caseData.findings || 'Unknown'}
- Teaching Points: ${caseData.teaching_points || 'None'}
- Differentials: ${caseData.differentials || 'None'}

TRANSCRIPT:
${transcriptText}

Provide evaluation in this exact JSON format:
{
  "overall_score": <number 0-100>,
  "systematic_approach": <number 0-25>,
  "diagnostic_accuracy": <number 0-25>,
  "completeness": <number 0-25>,
  "clinical_correlation": <number 0-25>,
  "strong_points": ["specific things the examinee did well"],
  "weak_points": ["specific areas needing improvement"],
  "missed_findings": ["findings the examinee failed to identify"],
  "recommendations": ["actionable study recommendations"]
}

Respond with valid JSON only. No markdown, no code fences.`;

    try {
      const evaluation = await this.ai.generateJSON(prompt, { maxTokens: 2000 });
      return evaluation;
    } catch (e) {
      // Fallback evaluation if AI parsing fails
      return {
        overall_score: 0,
        systematic_approach: 0,
        diagnostic_accuracy: 0,
        completeness: 0,
        clinical_correlation: 0,
        strong_points: [],
        weak_points: ['Evaluation could not be generated'],
        missed_findings: [],
        recommendations: ['Review the transcript and self-assess your performance']
      };
    }
  }

  /**
   * Annotate individual turns of a transcript for replay.
   * Adds per-turn assessment notes.
   */
  async annotateTranscript(transcript, caseData) {
    const systemPrompt = `You are an ABR oral board examiner annotating a completed examination transcript.
For each examinee turn, provide brief annotations noting strengths and weaknesses.`;

    const transcriptText = transcript.map((entry, i) =>
      `[Turn ${i + 1} - ${entry.role.toUpperCase()}]: ${entry.content}`
    ).join('\n\n');

    const prompt = `Annotate this oral board examination transcript. For each EXAMINEE turn, provide annotations.

CASE:
- Diagnosis: ${caseData.diagnosis || 'Unknown'}
- Key Findings: ${caseData.findings || 'Unknown'}

TRANSCRIPT:
${transcriptText}

Respond in this JSON format:
{
  "annotations": [
    {
      "turn_number": <number>,
      "type": "strength" | "weakness" | "missed" | "neutral",
      "content": "Brief annotation text"
    }
  ],
  "summary": "Overall 2-3 sentence performance summary"
}

Respond with valid JSON only. No markdown, no code fences.`;

    try {
      const result = await this.ai.generateJSON(prompt, { maxTokens: 2000 });
      return result;
    } catch (e) {
      return {
        annotations: [],
        summary: 'Annotation could not be generated.'
      };
    }
  }

  /**
   * Calculate performance score from an evaluation object.
   * Returns 0-100 based on the four rubric categories.
   */
  calculateScore(evaluation) {
    if (!evaluation) return 0;
    if (typeof evaluation.overall_score === 'number') return evaluation.overall_score;

    const systematic = Number(evaluation.systematic_approach) || 0;
    const accuracy = Number(evaluation.diagnostic_accuracy) || 0;
    const completeness = Number(evaluation.completeness) || 0;
    const clinical = Number(evaluation.clinical_correlation) || 0;

    return Math.min(100, Math.max(0, systematic + accuracy + completeness + clinical));
  }
}

module.exports = OralBoardEngine;
