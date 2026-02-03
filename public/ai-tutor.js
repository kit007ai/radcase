// RadCase AI Tutor Module
// AI-powered learning assistant for radiology education

class AITutor {
  constructor() {
    this.apiEndpoint = '/api/ai';
    this.conversationHistory = [];
    this.currentCase = null;
    this.isConfigured = false;
    
    this.checkConfiguration();
  }

  async checkConfiguration() {
    try {
      const res = await fetch(`${this.apiEndpoint}/status`);
      const data = await res.json();
      this.isConfigured = data.configured;
      return data;
    } catch {
      this.isConfigured = false;
      return { configured: false };
    }
  }

  // Set the current case context for the AI
  setCase(caseData) {
    this.currentCase = caseData;
    this.conversationHistory = [];
  }

  // Build system prompt for radiology tutor
  buildSystemPrompt() {
    let prompt = `You are an expert radiology educator and AI tutor. Your role is to help medical trainees learn radiology through the Socratic method.

Guidelines:
- Be encouraging but academically rigorous
- Use the Socratic method: ask guiding questions rather than giving answers directly
- When asked about findings, help trainees develop systematic search patterns
- Explain the pathophysiology behind imaging findings
- Connect imaging findings to clinical presentations
- Mention relevant differential diagnoses
- Use proper radiological terminology
- Be concise but thorough`;

    if (this.currentCase) {
      prompt += `\n\nCurrent Case Context:
Title: ${this.currentCase.title || 'Unknown'}
Modality: ${this.currentCase.modality || 'Unknown'}
Body Part: ${this.currentCase.body_part || 'Unknown'}
Clinical History: ${this.currentCase.clinical_history || 'Not provided'}
Diagnosis: ${this.currentCase.diagnosis || 'Unknown'}
Key Findings: ${this.currentCase.findings || 'Not provided'}
Teaching Points: ${this.currentCase.teaching_points || 'Not provided'}

Use this case information to guide your responses, but don't reveal the diagnosis unless specifically asked after the trainee has attempted their own interpretation.`;
    }

    return prompt;
  }

  // Chat with the AI tutor
  async chat(message) {
    if (!this.isConfigured) {
      return {
        error: true,
        message: "AI is not configured. Please set up an AI provider in settings."
      };
    }

    this.conversationHistory.push({ role: 'user', content: message });

    try {
      const res = await fetch(`${this.apiEndpoint}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: this.buildSystemPrompt(),
          messages: this.conversationHistory
        })
      });

      const data = await res.json();
      
      if (data.error) {
        return { error: true, message: data.error };
      }

      this.conversationHistory.push({ role: 'assistant', content: data.response });
      return { error: false, message: data.response };
    } catch (err) {
      return { error: true, message: 'Failed to connect to AI service' };
    }
  }

  // Get a hint for quiz mode (progressive hints)
  async getHint(caseData, hintLevel = 1) {
    const hintPrompts = {
      1: "Give a subtle hint about what anatomical region to focus on, without revealing the diagnosis.",
      2: "Provide a hint about the imaging pattern or sign to look for, without naming the diagnosis.",
      3: "Describe what a systematic search should reveal, giving more specific guidance without the final answer.",
      4: "Give a strong hint that nearly reveals the diagnosis, mentioning the key finding."
    };

    const prompt = `Case: ${caseData.modality} of ${caseData.body_part}
Clinical History: ${caseData.clinical_history}
Actual Diagnosis (DO NOT REVEAL): ${caseData.diagnosis}

${hintPrompts[Math.min(hintLevel, 4)]}

Keep your hint to 1-2 sentences.`;

    try {
      const res = await fetch(`${this.apiEndpoint}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          maxTokens: 150
        })
      });

      const data = await res.json();
      return data.error ? { error: true, hint: 'Unable to generate hint' } : { error: false, hint: data.response };
    } catch {
      return { error: true, hint: 'AI service unavailable' };
    }
  }

  // Generate differential diagnosis
  async getDifferentials(findings, modality, bodyPart) {
    const prompt = `Given the following radiological findings on ${modality} of ${bodyPart}:

${findings}

Provide a differential diagnosis list with:
1. Most likely diagnosis (with brief explanation)
2. 3-4 other possibilities to consider
3. Key distinguishing features for each

Format as a structured list.`;

    try {
      const res = await fetch(`${this.apiEndpoint}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 500 })
      });

      const data = await res.json();
      return data.error ? { error: true } : { error: false, differentials: data.response };
    } catch {
      return { error: true };
    }
  }

  // Generate case content from minimal input
  async generateCaseContent(input) {
    const prompt = `Generate educational radiology case content for:
Diagnosis: ${input.diagnosis}
Modality: ${input.modality || 'CT'}
Body Part: ${input.bodyPart || 'Not specified'}

Provide:
1. A realistic clinical history (2-3 sentences)
2. Key imaging findings (detailed, using proper terminology)
3. Teaching points (3-4 bullet points for trainees)

Format as JSON:
{
  "clinical_history": "...",
  "findings": "...",
  "teaching_points": "..."
}`;

    try {
      const res = await fetch(`${this.apiEndpoint}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 600 })
      });

      const data = await res.json();
      if (data.error) return { error: true };
      
      try {
        // Try to parse JSON from response
        const jsonMatch = data.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return { error: false, content: JSON.parse(jsonMatch[0]) };
        }
      } catch {}
      
      return { error: true };
    } catch {
      return { error: true };
    }
  }

  // Evaluate a trainee's interpretation
  async evaluateInterpretation(caseData, traineeAnswer) {
    const prompt = `Evaluate this radiology trainee's interpretation:

Case: ${caseData.modality} of ${caseData.body_part}
Clinical History: ${caseData.clinical_history}
Correct Diagnosis: ${caseData.diagnosis}
Key Findings: ${caseData.findings}

Trainee's Answer: "${traineeAnswer}"

Provide:
1. What they got right (be encouraging)
2. What they missed or got wrong
3. One specific learning point to improve
4. A score from 1-5 (5 = perfect)

Be constructive and educational.`;

    try {
      const res = await fetch(`${this.apiEndpoint}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 400 })
      });

      const data = await res.json();
      return data.error ? { error: true } : { error: false, evaluation: data.response };
    } catch {
      return { error: true };
    }
  }

  // Clear conversation history
  clearHistory() {
    this.conversationHistory = [];
  }
}

// Initialize global instance
const aiTutor = new AITutor();
window.aiTutor = aiTutor;
