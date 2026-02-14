-- RadCase PostgreSQL Migration - Initial Schema
-- Run: psql -d radcase -f migrations/001_postgresql_initial.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Cases table
CREATE TABLE IF NOT EXISTS cases (
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
CREATE TABLE IF NOT EXISTS images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    sequence INTEGER DEFAULT 0,
    annotations JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- DICOM series
CREATE TABLE IF NOT EXISTS dicom_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    series_uid VARCHAR(64) UNIQUE,
    series_description VARCHAR(255),
    modality VARCHAR(16) NOT NULL,
    num_images INTEGER DEFAULT 0,
    folder_name VARCHAR(255) NOT NULL,
    patient_name VARCHAR(255),
    study_description VARCHAR(255),
    window_center NUMERIC(10,2),
    window_width NUMERIC(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    file_size_bytes BIGINT,
    pixel_spacing_x NUMERIC(10,6),
    pixel_spacing_y NUMERIC(10,6),
    slice_thickness NUMERIC(10,3)
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    role VARCHAR(20) DEFAULT 'resident',
    institution_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- User case progress (spaced repetition)
CREATE TABLE IF NOT EXISTS user_case_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    confidence INTEGER DEFAULT 0,
    times_reviewed INTEGER DEFAULT 0,
    last_reviewed TIMESTAMP WITH TIME ZONE,
    next_review TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    UNIQUE(user_id, case_id)
);

-- Quiz attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    score NUMERIC(5,2),
    answers JSONB,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_cases_modality ON cases(modality) WHERE modality IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cases_body_part ON cases(body_part) WHERE body_part IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cases_difficulty ON cases(difficulty);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at);
CREATE INDEX IF NOT EXISTS idx_images_case_id ON images(case_id);
CREATE INDEX IF NOT EXISTS idx_dicom_series_case_id ON dicom_series(case_id);
CREATE INDEX IF NOT EXISTS idx_dicom_series_uid ON dicom_series(series_uid);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_progress_review ON user_case_progress(user_id, next_review) WHERE next_review IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id, completed_at);

-- Full-text search
CREATE INDEX IF NOT EXISTS idx_cases_search ON cases USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(diagnosis, '') || ' ' || coalesce(findings, '')));
