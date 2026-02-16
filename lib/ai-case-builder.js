const { v4: uuidv4 } = require('uuid');
const AIProvider = require('./ai-provider');
const ReportParser = require('./report-parser');
const ReferenceEnrichment = require('./reference-enrichment');

class AICaseBuilder {
  constructor(db) {
    this.db = db;
    this.ai = new AIProvider(db);
    this.parser = new ReportParser();
    this.references = new ReferenceEnrichment();
  }

  async generateCase(reportText, dicomMetadata = {}, createdBy) {
    const draftId = uuidv4();
    const startTime = Date.now();

    // 1. Parse the report
    const parsed = this.parser.parse(reportText);
    const modality = this.parser.extractModality(reportText, dicomMetadata) || dicomMetadata.modality || '';
    const bodyPart = this.parser.extractBodyPart(reportText, dicomMetadata) || dicomMetadata.bodyPart || '';

    // 2. Create draft record with 'generating' status
    this.db.prepare(`INSERT INTO case_drafts (id, source_report, source_dicom_metadata, status, created_by)
      VALUES (?, ?, ?, 'generating', ?)`).run(draftId, reportText, JSON.stringify(dicomMetadata), createdBy);

    try {
      // 3. Generate the teaching case via AI
      const caseContent = await this._generateCaseContent(parsed, modality, bodyPart, dicomMetadata);

      // 4. Enrich with references
      const refs = await this.references.enrichCase(
        caseContent.diagnosis, modality, bodyPart, caseContent.findings
      );

      // 5. Generate student-level version
      const studentVersion = await this._generateStudentVersion(caseContent);
      caseContent.student_version = studentVersion;

      // 6. Generate MCQ questions
      const mcqs = await this._generateMCQs(caseContent, modality, bodyPart);
      caseContent.mcq_questions = mcqs;

      // 7. Update draft with generated content
      const generationTime = Date.now() - startTime;
      this.db.prepare(`UPDATE case_drafts SET
        generated_content = ?, "references" = ?, status = 'review',
        ai_provider = ?, ai_model = ?, generation_time_ms = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(
        JSON.stringify(caseContent), JSON.stringify(refs),
        this.ai.getConfig().provider, this.ai.getConfig().model,
        generationTime, draftId
      );

      // 8. Store references in case_references table
      const insertRef = this.db.prepare(`INSERT INTO case_references (draft_id, source_name, source_url, source_type, quality_tier, quality_score, citation_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const ref of refs) {
        insertRef.run(draftId, ref.source || ref.journal, ref.url, ref.source_type || 'journal', ref.quality_tier, ref.quality_score, ref.citation || ref.title);
      }

      return { id: draftId, status: 'review', content: caseContent, references: refs, generationTime };
    } catch (err) {
      this.db.prepare(`UPDATE case_drafts SET status = 'error', review_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(err.message, draftId);
      throw err;
    }
  }

  async _generateCaseContent(parsed, modality, bodyPart, dicomMetadata) {
    const prompt = `You are creating a radiology teaching case for board exam preparation.

Given this radiology report:

CLINICAL HISTORY: ${parsed.clinical_history || 'Not provided'}
TECHNIQUE: ${parsed.technique || 'Not provided'}
FINDINGS: ${parsed.findings || 'Not provided'}
IMPRESSION: ${parsed.impression || 'Not provided'}
MODALITY: ${modality}
BODY PART: ${bodyPart}

Generate a comprehensive teaching case in JSON format with these fields:
{
  "title": "Concise descriptive title (e.g., 'Right Lower Lobe Pneumonia in Young Adult')",
  "clinical_history": "1-3 sentence clinical presentation suitable for a quiz (don't give away the diagnosis)",
  "findings": "Detailed description of imaging findings as teaching material",
  "diagnosis": "Primary diagnosis",
  "teaching_points": "3-5 key teaching points as bullet points, board-exam relevant",
  "differentials": [
    {"diagnosis": "Primary diagnosis", "likelihood": "most_likely", "key_features": "distinguishing features"},
    {"diagnosis": "Alternative 1", "likelihood": "possible", "key_features": "why to consider"},
    {"diagnosis": "Alternative 2", "likelihood": "less_likely", "key_features": "why less likely"}
  ],
  "teaching_pearls": ["Pearl 1 - a memorable clinical fact", "Pearl 2", "Pearl 3"],
  "fellow_notes": "Advanced discussion for fellows: rare variants, recent literature, management nuances",
  "category": "one of: classic, zebra, aunt_minnie, board_favorite, emergency, common",
  "difficulty": number 1-5 (1=medical student level, 3=typical resident, 5=fellowship level),
  "key_findings_annotations": [
    {"label": "Finding name", "description": "What to look for and why it matters", "finding_type": "arrow"}
  ]
}

Make the content board-exam quality. Teaching points should cover what a resident needs to know for the ABR Core exam. Include common pitfalls and "don't miss" findings.`;

    return this.ai.generateJSON(prompt, { maxTokens: 4000 });
  }

  async _generateStudentVersion(caseContent) {
    const prompt = `Simplify this radiology case for a medical student (not a radiology resident).

Original case:
Title: ${caseContent.title}
Findings: ${caseContent.findings}
Diagnosis: ${caseContent.diagnosis}
Teaching Points: ${caseContent.teaching_points}

Generate a simplified version in JSON:
{
  "clinical_history": "Simplified clinical scenario with guided questions",
  "findings": "Key findings explained with basic anatomy references",
  "teaching_points": "2-3 fundamental concepts a medical student should learn, with anatomy context"
}

Use simpler medical terminology. Explain anatomical landmarks. Focus on pattern recognition basics.`;

    return this.ai.generateJSON(prompt, { maxTokens: 2000 });
  }

  async _generateMCQs(caseContent, modality, bodyPart) {
    const prompt = `Create 3 multiple-choice questions about this radiology case for board exam preparation.

Case: ${caseContent.title}
Diagnosis: ${caseContent.diagnosis}
Findings: ${caseContent.findings}
Teaching Points: ${caseContent.teaching_points}
Modality: ${modality}
Body Part: ${bodyPart}

Generate in JSON array format:
[
  {
    "question": "Board-style question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_index": 0,
    "explanation": "Why the correct answer is right and why others are wrong",
    "difficulty": 3
  }
]

Make one question difficulty 2 (easier), one difficulty 3, one difficulty 4 (harder). Questions should test different aspects: diagnosis, imaging findings, and management/next steps.`;

    return this.ai.generateJSON(prompt, { maxTokens: 3000 });
  }

  publishDraft(draftId, reviewedBy) {
    const draft = this.db.prepare('SELECT * FROM case_drafts WHERE id = ?').get(draftId);
    if (!draft) throw new Error('Draft not found');
    if (draft.status !== 'approved') throw new Error('Draft must be approved before publishing');

    const content = JSON.parse(draft.generated_content);
    const caseId = uuidv4();

    this.db.prepare(`INSERT INTO cases (id, title, modality, body_part, diagnosis, difficulty, clinical_history,
      teaching_points, findings, differentials, student_notes, fellow_notes, category, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(
      caseId,
      content.title,
      content.modality || '',
      content.body_part || '',
      content.diagnosis,
      content.difficulty || 3,
      content.clinical_history,
      content.teaching_points,
      content.findings,
      JSON.stringify(content.differentials || []),
      content.student_version ? JSON.stringify(content.student_version) : null,
      content.fellow_notes || null,
      content.category || 'common'
    );

    // Store key findings annotations
    if (content.key_findings_annotations) {
      const insertKF = this.db.prepare(`INSERT INTO case_key_findings (case_id, image_id, finding_type, region_data, label, description, display_order)
        VALUES (?, '', ?, '{}', ?, ?, ?)`);
      for (let i = 0; i < content.key_findings_annotations.length; i++) {
        const kf = content.key_findings_annotations[i];
        insertKF.run(caseId, kf.finding_type || 'arrow', kf.label, kf.description || '', i);
      }
    }

    // Link references to published case
    this.db.prepare('UPDATE case_references SET case_id = ? WHERE draft_id = ?').run(caseId, draftId);

    // Update draft status
    this.db.prepare(`UPDATE case_drafts SET status = 'published', published_case_id = ?, reviewed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(caseId, reviewedBy, draftId);

    return { caseId, title: content.title };
  }
}

module.exports = AICaseBuilder;
