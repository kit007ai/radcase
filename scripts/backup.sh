#!/bin/bash
# RadCase Backup Script (SQLite)
# Backs up database, uploads, thumbnails, and DICOM files

set -euo pipefail

# Configuration
RADCASE_DIR="${RADCASE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-${RADCASE_DIR}/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_SUBDIR="${BACKUP_DIR}/${BACKUP_TIMESTAMP}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"; }
error(){ echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $1${NC}" >&2; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING: $1${NC}"; }

# Verify source exists
if [ ! -f "${RADCASE_DIR}/radcase.db" ]; then
  error "Database not found at ${RADCASE_DIR}/radcase.db"
  exit 1
fi

# Create backup directory
mkdir -p "${BACKUP_SUBDIR}"

# 1. Backup SQLite database (safe online backup via better-sqlite3)
log "Backing up database..."
DB_BACKUP="${BACKUP_SUBDIR}/radcase.db"
node -e "require('better-sqlite3')('${RADCASE_DIR}/radcase.db').backup('${DB_BACKUP}').then(() => process.exit(0))" 2>/dev/null || \
  cp "${RADCASE_DIR}/radcase.db" "${DB_BACKUP}"
# Also copy WAL if exists (for consistency with cp fallback)
[ -f "${RADCASE_DIR}/radcase.db-wal" ] && cp "${RADCASE_DIR}/radcase.db-wal" "${BACKUP_SUBDIR}/radcase.db-wal" 2>/dev/null || true
gzip "${DB_BACKUP}"
# Remove WAL copy after gzip (it was only needed if cp fallback was used)
rm -f "${BACKUP_SUBDIR}/radcase.db-wal"
log "Database backup: $(du -sh "${DB_BACKUP}.gz" | cut -f1)"

# Verify backup integrity
if gunzip -t "${DB_BACKUP}.gz" 2>/dev/null; then
  log "Database backup integrity verified"
else
  error "Database backup integrity check failed"
  exit 1
fi

# 2. Backup uploads
if [ -d "${RADCASE_DIR}/uploads" ] && [ "$(ls -A "${RADCASE_DIR}/uploads" 2>/dev/null)" ]; then
  log "Backing up uploads..."
  tar -czf "${BACKUP_SUBDIR}/uploads.tar.gz" -C "${RADCASE_DIR}" uploads/
  log "Uploads backup: $(du -sh "${BACKUP_SUBDIR}/uploads.tar.gz" | cut -f1)"
else
  warn "No uploads to back up"
fi

# 3. Backup thumbnails
if [ -d "${RADCASE_DIR}/thumbnails" ] && [ "$(ls -A "${RADCASE_DIR}/thumbnails" 2>/dev/null)" ]; then
  log "Backing up thumbnails..."
  tar -czf "${BACKUP_SUBDIR}/thumbnails.tar.gz" -C "${RADCASE_DIR}" thumbnails/
  log "Thumbnails backup: $(du -sh "${BACKUP_SUBDIR}/thumbnails.tar.gz" | cut -f1)"
else
  warn "No thumbnails to back up"
fi

# 4. Backup DICOM files
if [ -d "${RADCASE_DIR}/dicom" ] && [ "$(ls -A "${RADCASE_DIR}/dicom" 2>/dev/null)" ]; then
  log "Backing up DICOM files..."
  tar -czf "${BACKUP_SUBDIR}/dicom.tar.gz" -C "${RADCASE_DIR}" dicom/
  log "DICOM backup: $(du -sh "${BACKUP_SUBDIR}/dicom.tar.gz" | cut -f1)"
else
  warn "No DICOM files to back up"
fi

# 5. Backup .env (if exists)
if [ -f "${RADCASE_DIR}/.env" ]; then
  cp "${RADCASE_DIR}/.env" "${BACKUP_SUBDIR}/.env.backup"
  log "Config backup: .env"
fi

# 6. Create manifest
cat > "${BACKUP_SUBDIR}/manifest.json" << EOF
{
  "timestamp": "${BACKUP_TIMESTAMP}",
  "date": "$(date -Iseconds)",
  "files": {
    "database": "radcase.db.gz",
    "uploads": "$([ -f "${BACKUP_SUBDIR}/uploads.tar.gz" ] && echo "uploads.tar.gz" || echo "none")",
    "thumbnails": "$([ -f "${BACKUP_SUBDIR}/thumbnails.tar.gz" ] && echo "thumbnails.tar.gz" || echo "none")",
    "dicom": "$([ -f "${BACKUP_SUBDIR}/dicom.tar.gz" ] && echo "dicom.tar.gz" || echo "none")"
  },
  "sizes": {
    "database": $(stat -c%s "${DB_BACKUP}.gz" 2>/dev/null || echo 0),
    "uploads": $([ -f "${BACKUP_SUBDIR}/uploads.tar.gz" ] && stat -c%s "${BACKUP_SUBDIR}/uploads.tar.gz" || echo 0),
    "thumbnails": $([ -f "${BACKUP_SUBDIR}/thumbnails.tar.gz" ] && stat -c%s "${BACKUP_SUBDIR}/thumbnails.tar.gz" || echo 0),
    "dicom": $([ -f "${BACKUP_SUBDIR}/dicom.tar.gz" ] && stat -c%s "${BACKUP_SUBDIR}/dicom.tar.gz" || echo 0)
  }
}
EOF

# 7. Upload to S3 if configured
if [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${S3_BACKUP_BUCKET:-}" ]; then
  log "Uploading to S3..."
  aws s3 sync "${BACKUP_SUBDIR}" "s3://${S3_BACKUP_BUCKET}/radcase/${BACKUP_TIMESTAMP}/" && \
    log "Uploaded to s3://${S3_BACKUP_BUCKET}/radcase/${BACKUP_TIMESTAMP}/" || \
    warn "S3 upload failed"
else
  log "S3 not configured, local backup only"
fi

# 8. Clean up old local backups
if [ -d "${BACKUP_DIR}" ]; then
  OLD_BACKUPS=$(find "${BACKUP_DIR}" -maxdepth 1 -type d -mtime +${RETENTION_DAYS} ! -path "${BACKUP_DIR}" 2>/dev/null)
  if [ -n "${OLD_BACKUPS}" ]; then
    echo "${OLD_BACKUPS}" | while read -r dir; do
      rm -rf "${dir}"
      log "Removed old backup: $(basename "${dir}")"
    done
  fi
fi

# Summary
TOTAL_SIZE=$(du -sh "${BACKUP_SUBDIR}" | cut -f1)
log "Backup complete: ${TOTAL_SIZE} in ${BACKUP_SUBDIR}"
