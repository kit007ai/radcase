const path = require('path');
const fs = require('fs');

// Secure static file serving with path validation
function createSecureStatic(baseDir, routePath) {
  return (req, res, next) => {
    // Decode and sanitize the requested path
    let requestedPath;
    try {
      requestedPath = decodeURIComponent(req.path);
    } catch (e) {
      return res.status(400).send('Invalid path encoding');
    }

    // Remove route prefix and normalize path
    const relativePath = requestedPath.replace(routePath, '');
    const fullPath = path.join(baseDir, relativePath);

    // Ensure the resolved path is within the allowed directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedBase = path.resolve(baseDir);

    if (!resolvedPath.startsWith(resolvedBase)) {
      console.warn(`🚨 Directory traversal attempt blocked: ${requestedPath}`);
      return res.status(403).send('Access denied');
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      return res.status(404).send('File not found');
    }

    // Cache headers for immutable medical files
    if (routePath === '/dicom') {
      res.set({
        'Cache-Control': 'public, max-age=2592000, immutable',
        'Content-Type': 'application/dicom',
      });
    } else {
      res.set('Cache-Control', 'public, max-age=86400');
    }

    // Serve the file securely (dotfiles: allow needed since app may live under a dot-directory)
    res.sendFile(resolvedPath, { dotfiles: 'allow' });
  };
}

// WebP content-negotiation middleware for thumbnails
function webpNegotiation(thumbDir) {
  return (req, res, next) => {
    const acceptsWebP = req.headers.accept && req.headers.accept.includes('image/webp');
    if (!acceptsWebP) return next();

    let requestedPath;
    try {
      requestedPath = decodeURIComponent(req.path);
    } catch (e) {
      return next();
    }

    // Build the WebP variant path
    const webpPath = requestedPath.replace(/\.[^.]+$/, '.webp');
    const fullWebpPath = path.join(thumbDir, webpPath);
    const resolvedWebp = path.resolve(fullWebpPath);

    // Security: ensure within thumbDir
    if (!resolvedWebp.startsWith(path.resolve(thumbDir))) return next();

    if (fs.existsSync(resolvedWebp) && fs.statSync(resolvedWebp).isFile()) {
      res.set({
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=86400',
        'Vary': 'Accept'
      });
      return res.sendFile(resolvedWebp, { dotfiles: 'allow' });
    }

    next();
  };
}

module.exports = { createSecureStatic, webpNegotiation };
