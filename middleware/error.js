// Global error handling middleware for Express

function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err.message);

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field' });
  }

  // Multer validation errors
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes('Invalid DICOM file type')) {
    return res.status(400).json({ error: err.message });
  }

  // JSON parse errors (body-parser / express.json)
  if (err.type === 'entity.parse.failed' || err.status === 400) {
    return res.status(400).json({ error: err.message });
  }

  // SQLite constraint errors
  if (err.message && err.message.includes('constraint failed')) {
    return res.status(400).json({ error: err.message });
  }

  // Default server error
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { errorHandler };
