# PostgreSQL Migration Strategy

**Priority:** P1 (Complete by Feb 15)  
**Author:** Architecture & Performance Lead  
**Effort:** ~3-5 days development + testing

---

## Migration Overview

**Goal:** Migrate from SQLite to PostgreSQL for multi-user concurrency and institutional scalability

**Current Database:** 151KB SQLite with 8 core tables  
**Target:** PostgreSQL 14+ with connection pooling  
**Migration Type:** Schema + data migration with zero-downtime capability

---

## Schema Migration Plan

### 1. PostgreSQL Schema Translation

#### Core Changes Needed

**Data Types:**
```sql
-- SQLite → PostgreSQL
TEXT → VARCHAR/TEXT (specify lengths for constraints)
INTEGER → INTEGER/BIGINT
REAL → NUMERIC/DOUBLE PRECISION  
DATETIME → TIMESTAMP WITH TIME ZONE
```

**Primary Keys:**
```sql
-- Current SQLite (UUID strings)
id TEXT PRIMARY KEY

-- PostgreSQL equivalent
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

**Auto-increment:**
```sql
-- SQLite
id INTEGER PRIMARY KEY AUTOINCREMENT

-- PostgreSQL
id SERIAL PRIMARY KEY
-- OR
id BIGSERIAL PRIMARY KEY (for high-volume tables)
```

#### Updated Schema

**File:** `migrations/001_postgresql_initial.sql`
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Cases table
CREATE TABLE cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    modality VARCHAR(50),
    body_part VARCHAR(100),
    diagnosis TEXT,
    difficulty INTEGER DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
    clinical_history TEXT,
    teaching_points TEXT,
    findings TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Images table
CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    sequence INTEGER DEFAULT 0,
    annotations JSONB, -- Enhanced from TEXT to JSONB
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced indexes for performance
CREATE INDEX idx_cases_modality ON cases(modality) WHERE modality IS NOT NULL;
CREATE INDEX idx_cases_body_part ON cases(body_part) WHERE body_part IS NOT NULL;
CREATE INDEX idx_cases_difficulty ON cases(difficulty);
CREATE INDEX idx_cases_created_at ON cases(created_at);

CREATE INDEX idx_images_case_id ON images(case_id);
CREATE INDEX idx_images_filename ON images(filename);

-- DICOM series table (enhanced)
CREATE TABLE dicom_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    series_uid VARCHAR(64) UNIQUE, -- DICOM UID standard length
    series_description VARCHAR(255),
    modality VARCHAR(16) NOT NULL, -- Standard DICOM modality
    num_images INTEGER DEFAULT 0 CHECK (num_images >= 0),
    folder_name VARCHAR(255) NOT NULL,
    patient_name VARCHAR(255),
    study_description VARCHAR(255),
    window_center NUMERIC(10,2),
    window_width NUMERIC(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata for performance optimization
    file_size_bytes BIGINT,
    pixel_spacing_x NUMERIC(10,6),
    pixel_spacing_y NUMERIC(10,6),
    slice_thickness NUMERIC(10,3)
);

-- Users table (enhanced security)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    role VARCHAR(20) DEFAULT 'resident' CHECK (role IN ('resident', 'attending', 'admin')),
    institution_id UUID, -- For multi-tenancy
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Performance indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_institution ON users(institution_id) WHERE institution_id IS NOT NULL;
CREATE INDEX idx_users_last_login ON users(last_login) WHERE last_login IS NOT NULL;
```

### 2. Connection Configuration

#### Database Connection Pool
```javascript
// config/database.js
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'radcase',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'radcase',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  
  // Connection pool settings
  max: 20, // Maximum number of clients
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  
  // Performance tuning
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};
```

#### Environment Configuration
```bash
# .env.production
DB_HOST=your-postgres-host
DB_NAME=radcase_prod
DB_USER=radcase_user
DB_PASSWORD=your-secure-password
DB_PORT=5432

# Connection pool
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_POOL_IDLE_TIMEOUT=30000
```

---

## Migration Implementation

### 3. Migration Script

**File:** `scripts/migrate-to-postgresql.js`
```javascript
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

class PostgreSQLMigrator {
  constructor(sqliteDbPath, pgConfig) {
    this.sqlite = new Database(sqliteDbPath);
    this.pg = new Pool(pgConfig);
    this.batchSize = 1000; // Process in batches
  }

  async migrate() {
    console.log('Starting PostgreSQL migration...');
    
    try {
      // 1. Create PostgreSQL schema
      await this.createSchema();
      
      // 2. Migrate data table by table
      await this.migrateCases();
      await this.migrateImages();
      await this.migrateDicomSeries();
      await this.migrateUsers();
      await this.migrateUserProgress();
      await this.migrateQuizAttempts();
      
      // 3. Verify data integrity
      await this.verifyMigration();
      
      console.log('Migration completed successfully!');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    } finally {
      this.sqlite.close();
      await this.pg.end();
    }
  }
  
  async migrateCases() {
    console.log('Migrating cases...');
    
    const cases = this.sqlite.prepare('SELECT * FROM cases').all();
    
    for (let i = 0; i < cases.length; i += this.batchSize) {
      const batch = cases.slice(i, i + this.batchSize);
      
      for (const caseData of batch) {
        await this.pg.query(`
          INSERT INTO cases (id, title, modality, body_part, diagnosis, 
                           difficulty, clinical_history, teaching_points, 
                           findings, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          caseData.id,
          caseData.title,
          caseData.modality,
          caseData.body_part,
          caseData.diagnosis,
          caseData.difficulty,
          caseData.clinical_history,
          caseData.teaching_points,
          caseData.findings,
          caseData.created_at,
          caseData.updated_at
        ]);
      }
    }
    
    console.log(`Migrated ${cases.length} cases`);
  }
  
  // Similar methods for other tables...
}

// Usage
if (require.main === module) {
  const migrator = new PostgreSQLMigrator(
    './radcase.db',
    {
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT || 5432
    }
  );
  
  migrator.migrate().catch(console.error);
}
```

### 4. Zero-Downtime Migration Strategy

**Option A: Blue-Green Deployment**
1. Set up PostgreSQL instance
2. Run migration script on copy of data
3. Switch application to PostgreSQL
4. Monitor for issues, rollback if needed

**Option B: Dual-Write Migration** (Recommended for production)
1. Deploy dual-write code (write to both SQLite + PostgreSQL)
2. Migrate historical data
3. Switch reads to PostgreSQL
4. Remove SQLite writes
5. Decommission SQLite

**File:** `scripts/dual-write-migration.js`
```javascript
// Wrapper for dual database writes during migration
class DualWriteDatabase {
  constructor(sqlite, postgresql) {
    this.sqlite = sqlite;
    this.postgresql = postgresql;
    this.usePostgres = process.env.USE_POSTGRES === 'true';
  }
  
  async query(sql, params) {
    // Always write to both during migration
    const results = await Promise.allSettled([
      this.sqlite.prepare(sql).run(params),
      this.postgresql.query(sql, params)
    ]);
    
    // Return from the active database
    return this.usePostgres ? results[1].value : results[0].value;
  }
}
```

---

## Performance Optimizations

### 5. PostgreSQL Tuning

**postgresql.conf optimizations:**
```ini
# Memory
shared_buffers = 256MB          # 25% of system RAM
work_mem = 4MB                  # Per query memory
maintenance_work_mem = 64MB

# Connections
max_connections = 100
max_prepared_transactions = 0   # Disable if not needed

# Performance
random_page_cost = 1.1          # SSD optimization  
effective_cache_size = 1GB      # Available cache
checkpoint_completion_target = 0.7
```

### 6. Query Optimization

**Enhanced indexes for common queries:**
```sql
-- Case search optimizations
CREATE INDEX idx_cases_search ON cases USING gin(to_tsvector('english', title || ' ' || coalesce(diagnosis, '')));

-- DICOM series lookups
CREATE INDEX idx_dicom_series_lookup ON dicom_series(case_id, modality);

-- User progress queries
CREATE INDEX idx_user_progress_review ON user_case_progress(user_id, next_review) 
WHERE next_review IS NOT NULL;
```

---

## Testing & Validation

### 7. Migration Testing Plan

**Pre-migration tests:**
- [ ] Data export completeness verification
- [ ] Schema validation
- [ ] Performance baseline establishment

**Post-migration tests:**
- [ ] Data integrity verification (row counts, checksums)
- [ ] Application functionality testing
- [ ] Performance regression testing
- [ ] Concurrent user load testing

**File:** `tests/migration-verification.js`
```javascript
// Comprehensive data integrity tests
class MigrationVerifier {
  async verifyDataIntegrity() {
    const checks = [
      this.verifyRowCounts(),
      this.verifyRelationalIntegrity(),
      this.verifyDataConsistency(),
      this.verifyPerformanceRegression()
    ];
    
    const results = await Promise.all(checks);
    return results.every(Boolean);
  }
}
```

---

## Timeline & Milestones

### 8. Implementation Schedule

**Day 1:** Environment setup + schema design  
**Day 2:** Migration script development  
**Day 3:** Testing + validation scripts  
**Day 4:** Staging deployment + testing  
**Day 5:** Production migration execution  

### Risk Mitigation
- **Backup strategy:** Full SQLite backup before migration
- **Rollback plan:** Keep SQLite running in read-only mode for 48h
- **Monitoring:** Database performance dashboards
- **Validation:** Automated data integrity checks

---

**Status:** 📋 Migration strategy documented  
**Next:** DICOM performance audit  
**Dependencies:** Environment setup, PostgreSQL instance provisioning