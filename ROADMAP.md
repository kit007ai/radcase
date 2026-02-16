# RadCase Roadmap — AI-Powered Radiology Education Platform

## Vision

An AI-powered radiology education platform where institutions upload clinical cases (DICOM + finalized reports), AI transforms them into board-level teaching material, and residents learn through progressive case study, differential practice, and simulated oral boards — all mapped to ACGME milestones and tracked for program directors.

## Core Principles

- Fix fundamentals before adding features
- AI deeply integrated: content creation, tutoring, oral board simulation
- Board-prep level for residents, simplified for medical students
- Reference quality scoring for transparency
- Admin uploads raw clinical materials, AI does pedagogical structuring
- Admin review gate on all AI-generated content
- Mobile-first: designed for 2-10 minute study windows between cases

---

## Phase 1: Harden the Foundation

### Security (Critical)
- [ ] Add requireAdmin to POST /admin/ai/configure and POST /admin/ai/chat, POST /admin/ai/complete
- [ ] Add requireAuth to DELETE /admin/images/:id
- [ ] Add requireAuth to POST /sync/annotations and POST /sync/progress
- [ ] Increase password minimum from 4 to 8 characters
- [ ] Add global rate limiting (not just auth endpoints)

### Study Mode Visibility (Critical)
- [ ] Make study/reference mode toggle visible and obvious in case modal header
- [ ] Add onboarding hint or tooltip for first-time users
- [ ] Ensure keyboard shortcuts (Space/Enter to advance) are discoverable

### Design System Unification
- [ ] Create design-tokens.css with spacing scale, typography scale, border-radius, shadows
- [ ] Fix z-index conflicts (define clear scale: base → dropdowns → modals → toasts → system)
- [ ] Fix color contrast for WCAG AA (--text-secondary, --text-muted, --border)
- [ ] Replace all hardcoded hex colors with CSS custom properties
- [ ] Unify component styles: buttons, cards, badges, inputs across all features
- [ ] Add prefers-reduced-motion support
- [ ] Standardize animation durations (150ms instant, 300ms normal, 600ms slow)

### Backend Architecture
- [ ] Remove duplicate case_finding_regions table (keep case_key_findings)
- [ ] Add missing database indexes (quiz_attempts, case_discussions, collections)
- [ ] Consolidate spaced repetition algorithms (use SM-2 everywhere)
- [ ] Standardize error response format ({ error: "..." }) across all routes
- [ ] Fix collection case_count sync issue
- [ ] Create lib/utils.js with shared utilities (escapeHtml, etc.)

### Frontend Architecture
- [ ] Fix undefined integrateTouchGestures() call
- [ ] Fix event listener memory leaks (quiz swipe handler, preference modal, differential input)
- [ ] Add error handling to all API calls in api.js
- [ ] Fix modal stacking (close child modals when parent closes)
- [ ] Add loading states for async operations
- [ ] Remove unused state fields
- [ ] Consolidate _escapeHtml() from 4 files into shared module

### Tests
- [ ] Update test suite for security changes (new auth requirements)
- [ ] Add tests for study mode toggle
- [ ] All 145+ existing tests must continue to pass

---

## Phase 2: AI Case Builder Pipeline

### Content Pipeline
- [ ] Build DICOM metadata + report parser
- [ ] Create AI case generation service (report → structured teaching case)
- [ ] Implement reference enrichment (Radiopaedia, ACR guidelines, peer-reviewed journals)
- [ ] Add reference quality scoring (Gold/Silver/Bronze/Unverified tiers)
- [ ] Build admin review workflow (section-by-section approve/edit/reject)
- [ ] Generate board-level content for residents
- [ ] Generate simplified versions for medical students
- [ ] Auto-generate differential diagnosis lists with reasoning
- [ ] Auto-generate key findings annotations
- [ ] Auto-generate MCQ questions at multiple difficulty levels
- [ ] Auto-generate teaching pearls

### Admin Interface
- [ ] Case builder wizard: upload DICOM + paste report → AI generates → review → publish
- [ ] Bulk case import workflow
- [ ] Content quality dashboard (reference scores, review status)
- [ ] Case template management

### AI Architecture
- [ ] Configurable AI provider (Claude, GPT-4, local models)
- [ ] RAG pipeline for medical reference enrichment
- [ ] Prompt engineering for consistent case generation
- [ ] Content validation layer (medical accuracy checks)
- [ ] API key encryption in database

---

## Phase 3: AI Tutor Integration

### Socratic Questioning
- [ ] AI tutor in study mode: asks probing questions during progressive reveal
- [ ] Adapts questioning style to trainee level
- [ ] Explains WHY a differential is right/wrong based on specific imaging findings
- [ ] "Look here" hints with image region references

### Weakness Detection & Deliberate Practice
- [ ] Analyze error patterns across all quiz/study attempts
- [ ] Identify specific weakness patterns (not just "neuro is weak" but "misses posterior fossa findings on CT")
- [ ] Generate personalized practice recommendations
- [ ] Create deliberate practice sessions targeting specific weaknesses
- [ ] "Satisfaction of search" exercises (cases with multiple findings)

### AI Report Feedback
- [ ] Resident writes structured report for a case
- [ ] AI compares to attending's finalized report
- [ ] Highlights missed findings, overcalls, organization issues
- [ ] Tracks reporting improvement over time

### Natural Language Case Search
- [ ] Embeddings-based case retrieval
- [ ] "Show me a subtle pneumothorax in a young patient"
- [ ] Filter by clinical scenario, not just metadata

---

## Phase 4: Oral Board Simulator

### Core Experience
- [ ] Oral board prep mode: AI presents case, resident speaks response
- [ ] Speech-to-text via Web Speech API or Whisper
- [ ] Text-to-speech for AI examiner voice
- [ ] Real-time Socratic dialogue (start broad, probe deeper on weak areas)
- [ ] ABR exam format: systematic approach expected

### AI Examiner
- [ ] System prompt engineered to simulate ABR examiner style
- [ ] Grounded in vetted, admin-approved case content (RAG)
- [ ] Probes weaknesses, redirects off-track candidates
- [ ] Evaluates accuracy, completeness, and presentation style

### Session Management
- [ ] Full transcript saved for review
- [ ] AI annotations: strong points, weak points, missed findings
- [ ] Performance scoring rubric aligned with ABR expectations
- [ ] Session replay with annotated timeline
- [ ] Progress tracking across oral board prep sessions

### Practice Modes
- [ ] Timed mode (simulates real exam pressure)
- [ ] Practice mode (unlimited time, more hints)
- [ ] Review mode (replay past sessions with coaching notes)

---

## Phase 5: Institutional Features & Milestone Tracking

### ACGME Milestone Mapping
- [ ] Map all 16 ABR diagnostic radiology domains
- [ ] Every case, quiz, and learning activity tagged to milestones
- [ ] Resident progress visualization per domain (Level 1-5)
- [ ] Gap identification: which milestones need more cases
- [ ] Rotation-aware study plans (adjust to current clinical rotation)

### Program Director Dashboard
- [ ] Cohort overview: all residents at a glance
- [ ] Individual resident deep-dive: strengths, weaknesses, trajectory
- [ ] Milestone progress reports (exportable for ACGME review)
- [ ] Identify at-risk residents early
- [ ] Compare cohort performance to national benchmarks

### Institutional Features
- [ ] Multi-institution support
- [ ] Program-specific case libraries
- [ ] Shared curated collections across programs
- [ ] Anonymous peer comparison within cohort
- [ ] CME/CPD credit tracking integration

---

## Technical Architecture Notes

### AI Roles & Architecture
| Role | Model Tier | Context Source | Risk Mitigation |
|------|-----------|---------------|----------------|
| Content Creator | Large (Opus/GPT-4) | DICOM + report + web search | Admin review gate |
| Tutor/Coach | Medium (Sonnet) | Approved case data + conversation | Grounded in vetted content |
| Examiner/Evaluator | Large (Opus/GPT-4) | Case data + ABR guidelines + rubric | Scoring validated against known answers |

### Reference Quality Scoring
| Tier | Source Type | Score |
|------|-----------|-------|
| Gold | Peer-reviewed journals (Radiology, AJR, RadioGraphics), ACR Criteria | 5/5 |
| Silver | Radiopaedia (peer-reviewed), STATdx, UpToDate | 4/5 |
| Bronze | Textbooks, society guidelines | 3/5 |
| Unverified | AI-synthesized without specific source | 1/5 |

### Content Pipeline Flow
```
Admin uploads DICOM + finalized report
         |
AI parses report (findings, impression, clinical history)
         |
AI extracts key teaching points from images + report
         |
AI enriches with external sources (with reference quality scores)
         |
AI generates: board-level case, student version, differentials,
              key findings annotations, MCQs, teaching pearls
         |
Admin reviews section-by-section, approves/edits/rejects
         |
Published to library
```

---

## Current Status

- **Phase 1:** IN PROGRESS
- **Phase 2:** Not started
- **Phase 3:** Not started
- **Phase 4:** Not started
- **Phase 5:** Not started
