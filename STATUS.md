# RadCase — Status

> AI-Powered Radiology Education Platform

| Metric | Value |
|--------|-------|
| **Health** | 🟢 Healthy |
| **Phase** | Phase 6 — Content & Production Hardening |
| **Version** | 1.0.0 |
| **Port** | 3457 |
| **URL** | radcase.kit-apps.dev |
| **Service** | `radcase` |
| **Stack** | React + Vite + Express.js + SQLite + Cornerstone.js (Dark HUD) |
| **Tests** | Jest + load tests |
| **CI/CD** | ❌ Not yet |

## 🏃 This Sprint (Feb 27 – Mar 12)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1 | CI/CD pipeline (GitHub Actions, follow IHQ pattern) | Claude Code | ⬜ Todo |
| 2 | Source de-identified DICOM teaching cases | Raj | ⬜ Todo |
| 3 | Content quality review of AI-generated material | Raj | ⬜ Todo |
| 4 | ACGME milestone validation with program directors | Raj | ⬜ Todo |
| 5 | PostgreSQL migration (follow IHQ pattern) | Claude Code | ⬜ Todo |

## 🚧 Blockers

- **De-identified DICOM cases** — The platform is feature-complete but empty. Need real teaching cases from Raj.
- **ACGME validation** — Milestone mapping needs program director review before going live.

## ✅ Recently Completed

All 5 feature phases are complete:

- [x] **Phase 1 — Foundation:** DICOM viewer (Cornerstone.js), case library, quiz mode (SM-2 spaced repetition), micro-learning, presentation mode, PWA, React migration, security hardening
- [x] **Phase 2 — AI Case Builder:** DICOM parser, AI case generation, reference enrichment (Radiopaedia/ACR/journals), quality scoring, admin review workflow
- [x] **Phase 3 — AI Tutor:** Socratic questioning in study mode, adaptive style by trainee level, weakness detection, AI report feedback, NLP case search
- [x] **Phase 4 — Oral Board Simulator:** AI examiner (ABR style), speech-to-text, text-to-speech, real-time dialogue, transcripts, timed/practice/review modes
- [x] **Phase 5 — Institutional:** ACGME milestone mapping (16 ABR domains), resident progress viz, program director dashboard, CME/CPD tracking, multi-institution support
- [x] **Sprint polish:** Mobile UX, touch annotations, DICOM prefetch, annotation tools

---

*Last updated: Feb 27, 2026*
