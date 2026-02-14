# RadCase Current Architecture Analysis

**Date:** February 9, 2026  
**Author:** Architecture & Performance Lead (Arc)  
**Purpose:** Document current state before scaling roadmap

---

## Executive Summary

RadCase has **solid foundational architecture** but faces critical scaling bottlenecks that limit it to single-institution deployment. Our analysis shows a path to multi-institution commercial viability requiring strategic database, storage, and performance optimizations.

**Current Capacity:** ~100-500 concurrent users (SQLite + local storage limits)  
**Target Capacity:** 10,000+ concurrent users across multiple institutions

---

## Current Architecture

### Technology Stack
```
Frontend: Vanilla JS + Cornerstone.js DICOM viewer
Backend: Node.js + Express
Database: SQLite3 (better-sqlite3)
Storage: Local filesystem
Auth: JWT + bcryptjs
DICOM: dcmjs + dicom-parser
Image: Sharp.js for thumbnails
```

### Database Schema (SQLite)
**Core Tables:**
- `cases` - Teaching case metadata
- `images` - Case image references  
- `dicom_series` - DICOM series metadata
- `users` - Authentication & profiles
- `user_case_progress` - Spaced repetition learning
- `quiz_attempts` - Performance tracking
- `tags` & `case_tags` - Classification

**Current Size:** 151KB (radcase.db) - demonstration data only

### File Storage Structure
```
/radcase/
├── uploads/           # User uploads
├── thumbnails/        # Generated thumbnails  
├── dicom/            # DICOM files by case/series
└── public/           # Static assets
```

### Performance Characteristics

**Strengths:**
✅ Fast single-user performance  
✅ Simple deployment model  
✅ Robust DICOM parsing with dcmjs  
✅ Effective Cornerstone.js integration  
✅ Comprehensive teaching case data model

**Critical Bottlenecks:**
🚨 **SQLite Write Concurrency** - Single writer limit  
🚨 **File System Storage** - No CDN, no redundancy  
🚨 **Cornerstone.js Loading** - Blocking DICOM downloads  
🚨 **No Caching Layer** - Repeated DB queries + file reads  
🚨 **Memory Usage** - Sharp.js thumbnail generation

---

## Scaling Assessment

### Current Limits
| Resource | Current Limit | Bottleneck |
|----------|---------------|------------|
| Concurrent Users | ~50-100 | SQLite write locks |
| Storage Capacity | ~100GB | Local disk space |
| DICOM Load Time | 2-5 seconds | Sequential file downloads |
| DB Query Time | 10-50ms | No query optimization |
| Memory Usage | 100-500MB | Sharp image processing |

### Multi-Institution Requirements
- **Database:** PostgreSQL with connection pooling
- **Storage:** Cloud object storage (S3/GCS) + CDN
- **Caching:** Redis for sessions + metadata
- **Performance:** Sub-1s DICOM loading
- **Security:** Enhanced auth + audit logging

---

## Strategic Recommendations

### 🎯 Decision Point: Platform Strategy

Based on Scout's market research showing commercial potential:

**RECOMMENDATION:** Build for multi-institution scalability from the start.

**Rationale:**
- Competitive commercial products cost $50k-200k annually
- RadCase quality rivals expensive solutions (STATdx, Radiopaedia)
- Technical investment now pays dividends later
- Single-institution approach limits growth potential

### 🏗️ Architecture Evolution Path

**Phase 1 (Sprint 1):** Foundation strengthening
- PostgreSQL migration strategy
- Performance baseline establishment
- Caching design
- Cloud storage planning

**Phase 2 (Sprint 2-3):** Scaling implementation
- Database migration execution
- Redis caching deployment
- Cloud storage migration
- DICOM performance optimization

**Phase 3 (Sprint 4+):** Enterprise features
- Multi-tenancy support
- Advanced analytics
- PACS integration
- SSO/LDAP integration

---

## Next Steps

1. **PostgreSQL Migration Strategy** - Detailed plan with zero-downtime approach
2. **DICOM Performance Audit** - Cornerstone.js optimization opportunities
3. **Redis Caching Design** - Session + metadata caching strategy
4. **Cloud Storage Architecture** - S3/CDN integration plan
5. **Performance Baseline** - Establish metrics for optimization tracking

---

**Status:** ✅ Current state analysis complete  
**Next:** Detailed migration planning for each bottleneck