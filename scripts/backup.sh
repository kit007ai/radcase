#!/bin/bash
# RadCase Production Backup Script
# Comprehensive backup for disaster recovery

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backup}"
S3_BUCKET="${S3_BACKUP_BUCKET:-radcase-backups}"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@postgres:5432/radcase}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

# Create backup directories
mkdir -p "${BACKUP_DIR}"/{database,files,config}

# Backup database
log "🗄️ Starting database backup..."
DB_BACKUP_FILE="${BACKUP_DIR}/database/radcase_db_${BACKUP_TIMESTAMP}.sql"
DB_BACKUP_COMPRESSED="${DB_BACKUP_FILE}.gz"

if pg_dump "${DATABASE_URL}" --clean --if-exists --verbose > "${DB_BACKUP_FILE}" 2>/dev/null; then
    # Compress database backup
    gzip "${DB_BACKUP_FILE}"
    log "✅ Database backup completed: $(basename "${DB_BACKUP_COMPRESSED}")"
    
    # Verify backup integrity
    if gunzip -t "${DB_BACKUP_COMPRESSED}" 2>/dev/null; then
        log "✅ Database backup integrity verified"
    else
        error "❌ Database backup integrity check failed"
        exit 1
    fi
else
    error "❌ Database backup failed"
    exit 1
fi

# Backup file uploads
log "📁 Starting file uploads backup..."
UPLOADS_BACKUP="${BACKUP_DIR}/files/uploads_${BACKUP_TIMESTAMP}.tar.gz"
if [ -d "/app/uploads" ] && [ "$(ls -A /app/uploads)" ]; then
    tar -czf "${UPLOADS_BACKUP}" -C /app uploads/
    log "✅ Uploads backup completed: $(basename "${UPLOADS_BACKUP}")"
else
    warn "⚠️ No uploads directory or empty uploads directory"
fi

# Backup thumbnails
log "🖼️ Starting thumbnails backup..."
THUMBNAILS_BACKUP="${BACKUP_DIR}/files/thumbnails_${BACKUP_TIMESTAMP}.tar.gz"
if [ -d "/app/thumbnails" ] && [ "$(ls -A /app/thumbnails)" ]; then
    tar -czf "${THUMBNAILS_BACKUP}" -C /app thumbnails/
    log "✅ Thumbnails backup completed: $(basename "${THUMBNAILS_BACKUP}")"
else
    warn "⚠️ No thumbnails directory or empty thumbnails directory"
fi

# Backup DICOM files
log "🏥 Starting DICOM backup..."
DICOM_BACKUP="${BACKUP_DIR}/files/dicom_${BACKUP_TIMESTAMP}.tar.gz"
if [ -d "/app/dicom" ] && [ "$(ls -A /app/dicom)" ]; then
    tar -czf "${DICOM_BACKUP}" -C /app dicom/
    log "✅ DICOM backup completed: $(basename "${DICOM_BACKUP}")"
else
    warn "⚠️ No DICOM directory or empty DICOM directory"
fi

# Backup configuration files
log "⚙️ Starting configuration backup..."
CONFIG_BACKUP="${BACKUP_DIR}/config/config_${BACKUP_TIMESTAMP}.tar.gz"

# Create temporary config directory
TEMP_CONFIG_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_CONFIG_DIR}" EXIT

# Copy important configuration files
if [ -f "/.env" ]; then
    cp /.env "${TEMP_CONFIG_DIR}/.env.backup" 2>/dev/null || true
fi

# Docker configurations
if [ -f "/docker-compose.yml" ]; then
    cp /docker-compose.yml "${TEMP_CONFIG_DIR}/" 2>/dev/null || true
fi

if [ -f "/docker-compose.prod.yml" ]; then
    cp /docker-compose.prod.yml "${TEMP_CONFIG_DIR}/" 2>/dev/null || true
fi

# Monitoring configurations
if [ -d "/etc/prometheus" ]; then
    cp -r /etc/prometheus "${TEMP_CONFIG_DIR}/" 2>/dev/null || true
fi

# Create config backup
if [ "$(ls -A "${TEMP_CONFIG_DIR}")" ]; then
    tar -czf "${CONFIG_BACKUP}" -C "${TEMP_CONFIG_DIR}" .
    log "✅ Configuration backup completed: $(basename "${CONFIG_BACKUP}")"
else
    warn "⚠️ No configuration files found to backup"
fi

# Create backup manifest
MANIFEST_FILE="${BACKUP_DIR}/backup_manifest_${BACKUP_TIMESTAMP}.json"
cat > "${MANIFEST_FILE}" << EOF
{
  "timestamp": "${BACKUP_TIMESTAMP}",
  "date": "$(date -Iseconds)",
  "version": "$(cat /app/package.json | grep version | cut -d'"' -f4 2>/dev/null || echo 'unknown')",
  "environment": "${NODE_ENV:-production}",
  "files": {
    "database": "$(basename "${DB_BACKUP_COMPRESSED}")",
    "uploads": "$([ -f "${UPLOADS_BACKUP}" ] && basename "${UPLOADS_BACKUP}" || echo "none")",
    "thumbnails": "$([ -f "${THUMBNAILS_BACKUP}" ] && basename "${THUMBNAILS_BACKUP}" || echo "none")",
    "dicom": "$([ -f "${DICOM_BACKUP}" ] && basename "${DICOM_BACKUP}" || echo "none")",
    "config": "$([ -f "${CONFIG_BACKUP}" ] && basename "${CONFIG_BACKUP}" || echo "none")"
  },
  "sizes": {
    "database": "$([ -f "${DB_BACKUP_COMPRESSED}" ] && stat -c%s "${DB_BACKUP_COMPRESSED}" || echo 0)",
    "uploads": "$([ -f "${UPLOADS_BACKUP}" ] && stat -c%s "${UPLOADS_BACKUP}" || echo 0)",
    "thumbnails": "$([ -f "${THUMBNAILS_BACKUP}" ] && stat -c%s "${THUMBNAILS_BACKUP}" || echo 0)",
    "dicom": "$([ -f "${DICOM_BACKUP}" ] && stat -c%s "${DICOM_BACKUP}" || echo 0)",
    "config": "$([ -f "${CONFIG_BACKUP}" ] && stat -c%s "${CONFIG_BACKUP}" || echo 0)"
  },
  "total_size": "$(du -sb "${BACKUP_DIR}" | cut -f1)"
}
EOF

log "📋 Backup manifest created: $(basename "${MANIFEST_FILE}")"

# Upload to S3 if configured
if [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${S3_BUCKET}" ]; then
    log "☁️ Uploading backups to S3..."
    
    # Install AWS CLI if not present
    if ! command -v aws &> /dev/null; then
        warn "AWS CLI not found, installing..."
        pip install awscli &> /dev/null || {
            error "Failed to install AWS CLI"
            exit 1
        }
    fi
    
    # Upload all backup files
    aws s3 sync "${BACKUP_DIR}" "s3://${S3_BUCKET}/radcase/${BACKUP_TIMESTAMP}/" --exclude="*" --include="*.gz" --include="*.json"
    
    if [ $? -eq 0 ]; then
        log "✅ Backup uploaded to S3: s3://${S3_BUCKET}/radcase/${BACKUP_TIMESTAMP}/"
    else
        error "❌ Failed to upload backup to S3"
        exit 1
    fi
    
    # Clean up old backups from S3
    log "🧹 Cleaning up old S3 backups (keeping last ${RETENTION_DAYS} days)..."
    OLD_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d)
    aws s3 ls "s3://${S3_BUCKET}/radcase/" | while read -r line; do
        BACKUP_DATE=$(echo "$line" | awk '{print $2}' | sed 's/\///g')
        if [[ "$BACKUP_DATE" < "$OLD_DATE" ]]; then
            aws s3 rm "s3://${S3_BUCKET}/radcase/${BACKUP_DATE}/" --recursive
            log "🗑️ Removed old backup: ${BACKUP_DATE}"
        fi
    done
else
    warn "⚠️ S3 credentials not configured, skipping cloud upload"
fi

# Clean up local old backups
log "🧹 Cleaning up old local backups (keeping last ${RETENTION_DAYS} days)..."
find "${BACKUP_DIR}" -type f -name "*.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
find "${BACKUP_DIR}" -type f -name "*.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

# Calculate total backup size
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)

# Send backup completion notification
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -X POST -H 'Content-type: application/json' \
        --data "{'text':'🛡️ RadCase backup completed successfully\nTimestamp: ${BACKUP_TIMESTAMP}\nTotal size: ${TOTAL_SIZE}\nUploaded to: s3://${S3_BUCKET}/radcase/${BACKUP_TIMESTAMP}/'}" \
        "${SLACK_WEBHOOK_URL}" &> /dev/null || warn "Failed to send Slack notification"
fi

log "🎉 Backup process completed successfully!"
log "📊 Total backup size: ${TOTAL_SIZE}"
log "📅 Backup timestamp: ${BACKUP_TIMESTAMP}"
log "📂 Local backup location: ${BACKUP_DIR}"

# Exit with success
exit 0