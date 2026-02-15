const path = require('path');
const crypto = require('crypto');

// Allowed MIME types for medical imaging
const ALLOWED_IMAGE_MIMES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp',
  'image/tiff', 'image/x-tiff', 'image/svg+xml'
];

const ALLOWED_DICOM_MIMES = [
  'application/dicom', 'application/octet-stream', 'image/dicom'
];

// Sanitize filename - remove dangerous characters and paths
function sanitizeFilename(filename) {
  if (!filename) return 'unnamed';

  // Remove directory traversal attempts and dangerous characters
  return filename
    .replace(/[\/\\?%*:|"<>]/g, '_')  // Replace dangerous chars
    .replace(/\.\./g, '_')            // Remove ../ attempts
    .replace(/^\.+/, '')              // Remove leading dots
    .substring(0, 255)                // Limit length
    || 'unnamed';
}

// Validate file type based on content (basic check)
function validateFileType(mimetype, allowedTypes) {
  return allowedTypes.includes(mimetype.toLowerCase());
}

// Generate secure filename
function generateSecureFilename(originalName) {
  const sanitized = sanitizeFilename(originalName);
  const ext = path.extname(sanitized).toLowerCase();
  const name = crypto.randomBytes(16).toString('hex');
  return `${name}${ext}`;
}

module.exports = {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_DICOM_MIMES,
  sanitizeFilename,
  validateFileType,
  generateSecureFilename
};
