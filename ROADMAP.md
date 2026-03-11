# RadCase — Roadmap

> AI-Powered Radiology Education Platform
> Board-level teaching cases, progressive learning, oral board simulation.

---

## Current Phase: **Content & Integration**

| Field | Value |
|-------|-------|
| Priority | 🟡 Tier 2 — High Value |
| Health | 🟢 On Track |
| Version | 1.0.0 |
| Stack | React + Vite + Express.js + SQLite + Cornerstone.js (Dark HUD) |
| Tests | Jest suite + load tests |
| CI/CD | ❌ Not yet (next up) |
| URL | radcase.kit-apps.dev |
| Service | `radcase` |

---

## Phase 1: Foundation ✅ COMPLETE

*Core platform with DICOM viewer, quiz mode, spaced repetition.*

- [x] Case library with DICOM viewer (Cornerstone.js)
- [x] Quiz mode with spaced repetition (SM-2 algorithm)
- [x] Micro-learning sessions (5-minute optimal)
- [x] Presentation mode
- [x] Sprint 1: Mobile responsive, accessibility, ARIA labels, keyboard nav
- [x] Sprint 2: Advanced mobile UX, PWA (offline/installable), touch annotations
- [x] Sprint 3: React migration + Vite build system
- [x] Security hardening (JWT, file upload validation, directory traversal protection)
- [x] Performance infrastructure (caching, compression, monitoring)

## Phase 2: AI Case Builder Pipeline ✅ COMPLETE

*AI transforms raw clinical materials into board-level teaching cases.*

- [x] DICOM metadata + report parser
- [x] AI case generation service (report → structured teaching case)
- [x] Reference enrichment (Radiopaedia, ACR guidelines, peer-reviewed journals)
- [x] Reference quality scoring (Gold/Silver/Bronze/Unverified tiers)
- [x] Admin review workflow (section-by-section approve/edit/reject)
- [x] Board-level content for residents + simplified for medical students
- [x] Auto-generated differentials, key findings, MCQs, teaching pearls

## Phase 3: AI Tutor Integration ✅ COMPLETE

*Socratic questioning, weakness detection, personalized practice.*

- [x] AI tutor in study mode (Socratic probing during progressive reveal)
- [x] Adaptive questioning style based on trainee level
- [x] Weakness detection & deliberate practice recommendations
- [x] AI report feedback (compare resident report to attending's)
- [x] Natural language case search (embeddings-based retrieval)

## Phase 4: Oral Board Simulator ✅ COMPLETE

*Full ABR oral board simulation with voice I/O.*

- [x] AI examiner engine (ABR style: systematic approach expected)
- [x] Speech-to-text via Web Speech API / Whisper
- [x] Text-to-speech for AI examiner voice
- [x] Real-time Socratic dialogue
- [x] Session transcript + performance scoring
- [x] Practice modes: timed, practice, review

## Phase 5: Institutional Features ✅ COMPLETE

*ACGME milestones, program director dashboard, multi-institution.*

- [x] ACGME milestone mapping (16 ABR diagnostic radiology domains)
- [x] Resident progress visualization per domain (Level 1-5)
- [x] Program director dashboard (cohort overview + individual deep-dive)
- [x] Milestone progress reports (exportable for ACGME review)
- [x] CME/CPD credit tracking integration
- [x] Multi-institution support

## Phase 6: Content & Polish ◀ CURRENT

*The features are built. Now fill it with real cases and harden for production.*

**Target: Q1-Q2 2026 (Mar-May)**

- [ ] **CI/CD pipeline** — GitHub Actions (follow IHQ v5 pattern)
  - Owner: Claude Code
- [ ] **De-identified DICOM teaching cases** — populate the case library
  - Owner: Raj (source cases) + Kit (coordinate de-identification)
  - ⚠️ BLOCKER: Need de-identified clinical DICOM studies
- [ ] **ACGME milestone validation** — verify mapping with program directors
  - Owner: Raj
- [ ] **Content quality pass** — review all AI-generated content for medical accuracy
  - Owner: Raj
- [ ] **PostgreSQL migration** — follow IHQ v5 pattern for production scale
  - Owner: Claude Code
  - Note: Currently SQLite, works fine for now
- [ ] **Production hardening** — error monitoring, logging, backup strategy
  - Owner: Claude Code
- [ ] **User acceptance testing** — get 2-3 residents to test and provide feedback
  - Owner: Raj

## Phase 7: Growth

*Scale to other programs, integrate with RadIntel.*

**Target: Q3-Q4 2026**

- [ ] RadIntel integration — auto-generate teaching files from interesting reports
- [ ] PACS integration — pull cases directly from Agfa EI
- [ ] Collaborative annotations — multiple users on same case
- [ ] Analytics dashboard — study patterns, knowledge gaps, cohort benchmarks
- [ ] National benchmarking — compare program performance

---

## Dependencies

| Dependency | Blocks | Status |
|-----------|--------|--------|
| De-identified DICOM cases | Phase 6 content | ⬜ Raj to source |
| Program director feedback | ACGME validation | ⬜ Raj to coordinate |
| De-identification pipeline | Real case import | ⬜ Shared with RadIntel |
| Agfa EI 8.4 API | PACS integration | 🔄 March upgrade |

---

## Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Architecture & sprint context |
| `STATUS.md` | Current state snapshot |
| `ROADMAP.md` | This file |
| `DESIGN-SYSTEM.md` | UI component library docs |
| `docs/` | Sprint plans, coordination, research |

---

*Created: Feb 2026 | Last updated: Feb 27, 2026*
