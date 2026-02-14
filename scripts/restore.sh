#!/bin/bash
# RadCase Disaster Recovery Restore Script
# Comprehensive restoration from backup

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backup}"
S3_BUCKET="${S3_BACKUP_BUCKET:-radcase-backups}"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@postgres:5432/radcase}"
RESTORE_TIMESTAMP=""
DRY_RUN=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Usage function
usage() {
    cat << EOF
🛡️ RadCase Disaster Recovery Restore Script

Usage: $0 [OPTIONS] BACKUP_TIMESTAMP

OPTIONS:
    -h, --help          Show this help message
    -d, --dry-run       Show what would be restored without actually doing it
    -s, --from-s3       Download backup from S3 first
    -l, --list          List available backups
    --database-only     Restore database only
    --files-only        Restore files only
    --skip-verification Skip backup verification

BACKUP_TIMESTAMP:
    Format: YYYYMMDD_HHMMSS (e.g., 20260210_143022)
    Use --list to see available backups

Examples:
    $0 --list                           # List available backups
    $0 20260210_143022                  # Restore full backup
    $0 --dry-run 20260210_143022        # Show what would be restored
    $0 --from-s3 20260210_143022        # Download from S3 and restore
    $0 --database-only 20260210_143022  # Restore database only

EOF
}

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# List available backups
list_backups() {
    log "📋 Available local backups:"
    
    if [ -d "${BACKUP_DIR}" ]; then
        find "${BACKUP_DIR}" -name "backup_manifest_*.json" -type f | sort -r | while read -r manifest; do
            TIMESTAMP=$(basename "$manifest" | sed 's/backup_manifest_\(.*\)\.json/\1/')
            DATE=$(jq -r '.date // "unknown"' < "$manifest" 2>/dev/null || echo "unknown")
            VERSION=$(jq -r '.version // "unknown"' < "$manifest" 2>/dev/null || echo "unknown")
            SIZE=$(jq -r '.total_size // "unknown"' < "$manifest" 2>/dev/null || echo "unknown")
            
            echo "  📦 ${TIMESTAMP} (${DATE}) - Version: ${VERSION} - Size: ${SIZE} bytes"
        done
    else
        warn "No local backup directory found"
    fi
    
    # List S3 backups if configured
    if [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${S3_BUCKET}" ] && command -v aws &> /dev/null; then
        log "☁️ Available S3 backups:"
        aws s3 ls "s3://${S3_BUCKET}/radcase/" | grep "PRE" | awk '{print "  📦 " $2}' | sed 's/\///g' | sort -r
    fi
}

# Download backup from S3
download_from_s3() {
    local timestamp="$1"
    
    log "☁️ Downloading backup from S3: ${timestamp}"
    
    if [ ! -n "${AWS_ACCESS_KEY_ID:-}" ] || [ ! -n "${S3_BUCKET}" ]; then
        error "AWS credentials or S3 bucket not configured"
        return 1
    fi
    
    if ! command -v aws &> /dev/null; then
        warn "AWS CLI not found, installing..."
        pip install awscli &> /dev/null || {
            error "Failed to install AWS CLI"
            return 1
        }
    fi
    
    # Create local backup directory
    mkdir -p "${BACKUP_DIR}"
    
    # Download backup files
    aws s3 sync "s3://${S3_BUCKET}/radcase/${timestamp}/" "${BACKUP_DIR}/" --exclude="*" --include="*.gz" --include="*.json"
    
    if [ $? -eq 0 ]; then
        log "✅ Backup downloaded from S3"
    else
        error "❌ Failed to download backup from S3"
        return 1
    fi
}

# Verify backup integrity
verify_backup() {
    local timestamp="$1"
    
    log "🔍 Verifying backup integrity: ${timestamp}"
    
    # Check manifest file
    local manifest_file="${BACKUP_DIR}/backup_manifest_${timestamp}.json"
    if [ ! -f "$manifest_file" ]; then
        error "Backup manifest not found: $(basename "$manifest_file")"
        return 1
    fi
    
    # Verify database backup
    local db_backup="${BACKUP_DIR}/database/radcase_db_${timestamp}.sql.gz"
    if [ -f "$db_backup" ]; then
        if gunzip -t "$db_backup" 2>/dev/null; then
            log "✅ Database backup integrity verified"
        else
            error "❌ Database backup is corrupted"
            return 1
        fi
    else
        warn "⚠️ Database backup file not found"
    fi
    
    # Verify file backups
    for backup_type in uploads thumbnails dicom config; do
        local backup_file="${BACKUP_DIR}/files/${backup_type}_${timestamp}.tar.gz"
        if [ -f "$backup_file" ]; then
            if tar -tzf "$backup_file" > /dev/null 2>&1; then
                log "✅ ${backup_type} backup integrity verified"
            else
                error "❌ ${backup_type} backup is corrupted"
                return 1
            fi
        else
            info "ℹ️ ${backup_type} backup not found (may not exist in this backup)"
        fi
    done
    
    log "✅ Backup integrity verification completed"
}

# Restore database
restore_database() {
    local timestamp="$1"
    local db_backup="${BACKUP_DIR}/database/radcase_db_${timestamp}.sql.gz"
    
    if [ ! -f "$db_backup" ]; then
        error "Database backup not found: $(basename "$db_backup")"
        return 1
    fi
    
    log "🗄️ Restoring database from backup: $(basename "$db_backup")"
    
    if [ "$DRY_RUN" = true ]; then
        info "🔍 DRY RUN: Would restore database from $(basename "$db_backup")"
        return 0
    fi
    
    # Create database backup before restore
    local current_backup="/tmp/pre_restore_backup_$(date +%Y%m%d_%H%M%S).sql"
    warn "⚠️ Creating safety backup of current database..."
    pg_dump "${DATABASE_URL}" > "$current_backup" || {
        error "Failed to create safety backup"
        return 1
    }
    
    # Restore database
    if gunzip -c "$db_backup" | psql "${DATABASE_URL}" > /dev/null 2>&1; then
        log "✅ Database restored successfully"
        rm "$current_backup"  # Remove safety backup on success
    else
        error "❌ Database restore failed"
        warn "⚠️ Restoring from safety backup..."
        psql "${DATABASE_URL}" < "$current_backup" || error "Failed to restore from safety backup"
        rm "$current_backup"
        return 1
    fi
}

# Restore files
restore_files() {
    local timestamp="$1"
    
    for backup_type in uploads thumbnails dicom; do
        local backup_file="${BACKUP_DIR}/files/${backup_type}_${timestamp}.tar.gz"
        local target_dir="/app/${backup_type}"
        
        if [ ! -f "$backup_file" ]; then
            info "ℹ️ ${backup_type} backup not found, skipping"
            continue
        fi
        
        log "📁 Restoring ${backup_type} from backup: $(basename "$backup_file")"
        
        if [ "$DRY_RUN" = true ]; then
            info "🔍 DRY RUN: Would restore ${backup_type} to ${target_dir}"
            continue
        fi
        
        # Create safety backup of current files
        if [ -d "$target_dir" ] && [ "$(ls -A "$target_dir")" ]; then
            local safety_backup="/tmp/pre_restore_${backup_type}_$(date +%Y%m%d_%H%M%S).tar.gz"
            warn "⚠️ Creating safety backup of current ${backup_type}..."
            tar -czf "$safety_backup" -C "$(dirname "$target_dir")" "$(basename "$target_dir")" || {
                warn "Failed to create safety backup for ${backup_type}"
            }
        fi
        
        # Restore files
        mkdir -p "$(dirname "$target_dir")"
        if tar -xzf "$backup_file" -C "$(dirname "$target_dir")"; then
            log "✅ ${backup_type} restored successfully"
        else
            error "❌ Failed to restore ${backup_type}"
            return 1
        fi
    done
}

# Restore configuration
restore_config() {
    local timestamp="$1"
    local config_backup="${BACKUP_DIR}/config/config_${timestamp}.tar.gz"
    
    if [ ! -f "$config_backup" ]; then
        info "ℹ️ Configuration backup not found, skipping"
        return 0
    fi
    
    log "⚙️ Restoring configuration from backup: $(basename "$config_backup")"
    
    if [ "$DRY_RUN" = true ]; then
        info "🔍 DRY RUN: Would restore configuration files"
        return 0
    fi
    
    # Extract to temporary directory first
    local temp_config=$(mktemp -d)
    tar -xzf "$config_backup" -C "$temp_config"
    
    # Selectively restore configuration files
    if [ -f "$temp_config/.env.backup" ]; then
        warn "⚠️ Found environment configuration backup"
        warn "⚠️ Manual review recommended before applying environment changes"
        info "ℹ️ Backup location: $temp_config/.env.backup"
    fi
    
    # Clean up
    # rm -rf "$temp_config"  # Keep for manual review
    
    log "✅ Configuration restore completed (manual review recommended)"
}

# Post-restore verification
post_restore_verification() {
    local timestamp="$1"
    
    log "🔍 Performing post-restore verification..."
    
    # Check database connectivity
    if psql "${DATABASE_URL}" -c "SELECT 1;" > /dev/null 2>&1; then
        log "✅ Database connectivity verified"
    else
        error "❌ Database connectivity failed"
        return 1
    fi
    
    # Check application directories
    for dir in uploads thumbnails dicom; do
        if [ -d "/app/${dir}" ]; then
            log "✅ Directory exists: /app/${dir}"
        else
            warn "⚠️ Directory missing: /app/${dir}"
        fi
    done
    
    # Count restored items
    local case_count=$(psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM cases;" 2>/dev/null | tr -d ' ' || echo "0")
    local user_count=$(psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ' || echo "0")
    
    log "📊 Restore statistics:"
    log "   Cases: ${case_count}"
    log "   Users: ${user_count}"
    
    # Check application startup (if in Docker environment)
    if [ -f "/app/server.js" ]; then
        info "ℹ️ Application files present, ready for startup"
    fi
    
    log "✅ Post-restore verification completed"
}

# Main restore function
perform_restore() {
    local timestamp="$1"
    local database_only="$2"
    local files_only="$3"
    local skip_verification="$4"
    
    log "🛡️ Starting RadCase restore process"
    log "📅 Backup timestamp: ${timestamp}"
    
    # Verify backup integrity
    if [ "$skip_verification" != true ]; then
        verify_backup "$timestamp" || {
            error "Backup verification failed"
            return 1
        }
    fi
    
    # Restore based on options
    if [ "$files_only" != true ]; then
        restore_database "$timestamp" || return 1
    fi
    
    if [ "$database_only" != true ]; then
        restore_files "$timestamp" || return 1
        restore_config "$timestamp" || return 1
    fi
    
    # Post-restore verification
    if [ "$DRY_RUN" != true ]; then
        post_restore_verification "$timestamp" || return 1
    fi
    
    log "🎉 Restore process completed successfully!"
    
    # Send notification
    if [ -n "${SLACK_WEBHOOK_URL:-}" ] && [ "$DRY_RUN" != true ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{'text':'🛡️ RadCase restore completed successfully\nTimestamp: ${timestamp}\nRestored at: $(date -Iseconds)'}" \
            "${SLACK_WEBHOOK_URL}" &> /dev/null || warn "Failed to send Slack notification"
    fi
}

# Parse command line arguments
DATABASE_ONLY=false
FILES_ONLY=false
FROM_S3=false
SKIP_VERIFICATION=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -s|--from-s3)
            FROM_S3=true
            shift
            ;;
        -l|--list)
            list_backups
            exit 0
            ;;
        --database-only)
            DATABASE_ONLY=true
            shift
            ;;
        --files-only)
            FILES_ONLY=true
            shift
            ;;
        --skip-verification)
            SKIP_VERIFICATION=true
            shift
            ;;
        *)
            if [ -z "$RESTORE_TIMESTAMP" ]; then
                RESTORE_TIMESTAMP="$1"
            else
                error "Unknown option: $1"
                usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate arguments
if [ -z "$RESTORE_TIMESTAMP" ]; then
    error "Backup timestamp is required"
    usage
    exit 1
fi

# Validate timestamp format
if [[ ! "$RESTORE_TIMESTAMP" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
    error "Invalid timestamp format. Expected: YYYYMMDD_HHMMSS"
    exit 1
fi

# Download from S3 if requested
if [ "$FROM_S3" = true ]; then
    download_from_s3 "$RESTORE_TIMESTAMP" || exit 1
fi

# Perform restore
perform_restore "$RESTORE_TIMESTAMP" "$DATABASE_ONLY" "$FILES_ONLY" "$SKIP_VERIFICATION"