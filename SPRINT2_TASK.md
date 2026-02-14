# Sprint 2 Performance Implementation Task

## Context
RadCase is a radiology teaching platform. We need 10x performance scaling.
Current: SQLite, no caching, sequential DICOM loading, ~50 concurrent users max.
Target: 1000 concurrent users, <1s DICOM load, 85% cache hit rate.

## CONSTRAINT: No sudo access
PostgreSQL and Redis are NOT installed. We cannot install them right now.
Adapt the implementation accordingly:
- PostgreSQL: Create migration scripts + database abstraction layer (ready to switch)
- Redis: Use `ioredis` with graceful fallback to in-memory cache (Map-based) when Redis unavailable
- Everything must work WITHOUT Redis/PostgreSQL running (fallback to SQLite + in-memory cache)

## Tasks (Priority Order)

### 1. Database Abstraction Layer (`lib/database.js`)
- Create a database abstraction that wraps current SQLite
- Interface supports both SQLite and PostgreSQL 
- Include connection pooling config for pg
- Migration scripts in `migrations/` directory
- All existing server.js DB calls go through this abstraction

### 2. Multi-Layer Caching (`lib/cache.js`)
- In-memory LRU cache (works without Redis)
- Redis adapter (auto-detects and falls back gracefully)
- Cache middleware for Express API responses
- Cache DICOM metadata, case data, thumbnails
- TTL management, cache invalidation on writes
- X-Cache header (HIT/MISS) on responses
- npm install ioredis lru-cache

### 3. DICOM Performance (`public/dicom-viewer.js` modifications)
- Parallel image loading with concurrency limit (6 concurrent)
- Progressive loading (show first image ASAP, load rest in background)
- Web Worker for DICOM parsing (create `public/dicom-parser-worker.js`)

### 4. Server-Side Performance (`server.js` modifications)
- Add compression middleware (npm install compression)
- Add proper Cache-Control headers for DICOM files (immutable, 30 days)
- Add ETag support for static files
- Add response time tracking header
- Gzip DICOM file responses

### 5. Performance Monitoring (`lib/monitor.js`)
- Track request counts, response times, error rates
- Cache hit/miss tracking
- Memory usage monitoring
- Expose `/api/admin/metrics` endpoint (JSON)
- Expose `/api/admin/health` endpoint

### 6. Load Testing (`tests/load-test.js`)
- Use `autocannon` (npm install autocannon --save-dev)
- Test scenarios: case listing, DICOM loading, concurrent users
- Generate report with pass/fail against targets

## Implementation Notes
- Keep existing functionality working (don't break anything)
- All new code in `lib/` directory
- Minimal changes to server.js (import new modules, add middleware)
- Add `"type": "module"` is NOT set - use require() style
- Test everything works: `node server.js` should start clean
- Update package.json with new dependencies

## Files to Read First
- `server.js` - Current server implementation
- `public/dicom-viewer.js` - Current DICOM viewer
- `docs/architecture/POSTGRESQL_MIGRATION_STRATEGY.md`
- `docs/architecture/REDIS_CACHING_STRATEGY.md`
- `docs/performance/DICOM_PERFORMANCE_AUDIT.md`
