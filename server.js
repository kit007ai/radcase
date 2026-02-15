// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const sharp = require('sharp');
const dicomParser = require('dicom-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3456;

// ============ SECURITY UTILITIES ============

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

// JWT Secret - SECURITY CRITICAL
// Require secure JWT secret, fail fast if not provided
if (!process.env.JWT_SECRET) {
  console.error('🚨 SECURITY ERROR: JWT_SECRET environment variable is required!');
  console.error('   Generate one with: openssl rand -hex 32');
  console.error('   Add it to your .env file or environment variables');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Using development fallback - NOT for production!');
  }
}

const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'development' 
    ? 'dev-fallback-' + require('crypto').randomBytes(32).toString('hex')
    : (() => { 
        console.error('🚨 JWT_SECRET required in production!'); 
        process.exit(1); 
      })()
);

// ============ VAPID / Web Push Setup ============
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  const generated = webpush.generateVAPIDKeys();
  VAPID_PUBLIC_KEY = generated.publicKey;
  VAPID_PRIVATE_KEY = generated.privateKey;
  console.log('=== VAPID Keys Generated ===');
  console.log('Add these to your .env file to persist across restarts:');
  console.log(`VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}`);
  console.log(`VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}`);
  console.log('============================');
}

webpush.setVapidDetails(
  'mailto:admin@radcase.app',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Ensure directories exist
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const THUMB_DIR = path.join(__dirname, 'thumbnails');
const DICOM_DIR = path.join(__dirname, 'dicom');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(THUMB_DIR, { recursive: true });
fs.mkdirSync(DICOM_DIR, { recursive: true });

// Database setup
const db = new Database(path.join(__dirname, 'radcase.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    modality TEXT,
    body_part TEXT,
    diagnosis TEXT,
    difficulty INTEGER DEFAULT 2,
    clinical_history TEXT,
    teaching_points TEXT,
    findings TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT,
    sequence INTEGER DEFAULT 0,
    annotations TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS case_tags (
    case_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (case_id, tag_id),
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,
    correct INTEGER NOT NULL,
    time_spent_ms INTEGER,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cases_modality ON cases(modality);
  CREATE INDEX IF NOT EXISTS idx_cases_body_part ON cases(body_part);
  CREATE INDEX IF NOT EXISTS idx_cases_difficulty ON cases(difficulty);
  CREATE INDEX IF NOT EXISTS idx_images_case ON images(case_id);

  CREATE TABLE IF NOT EXISTS dicom_series (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    series_uid TEXT,
    series_description TEXT,
    modality TEXT,
    num_images INTEGER DEFAULT 0,
    folder_name TEXT NOT NULL,
    patient_name TEXT,
    study_description TEXT,
    window_center REAL,
    window_width REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_dicom_case ON dicom_series(case_id);

  -- User authentication
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT DEFAULT 'resident',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  -- Spaced repetition progress per user
  CREATE TABLE IF NOT EXISTS user_case_progress (
    user_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    ease_factor REAL DEFAULT 2.5,
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,
    next_review DATE,
    last_reviewed DATETIME,
    PRIMARY KEY (user_id, case_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_user_progress ON user_case_progress(user_id, next_review);

  -- Beta program signups
  CREATE TABLE IF NOT EXISTS beta_signups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    institution TEXT NOT NULL,
    specialty TEXT,
    study_time TEXT NOT NULL,
    current_tools TEXT,
    motivation TEXT NOT NULL,
    wants_interview INTEGER DEFAULT 0,
    can_refer INTEGER DEFAULT 0,
    timestamp TEXT,
    source TEXT DEFAULT 'beta-signup',
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_beta_email ON beta_signups(email);
  CREATE INDEX IF NOT EXISTS idx_beta_status ON beta_signups(status);
  CREATE INDEX IF NOT EXISTS idx_beta_role ON beta_signups(role);

  -- Interview requests for user research
  CREATE TABLE IF NOT EXISTS interview_requests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    institution TEXT NOT NULL,
    timezone TEXT NOT NULL,
    preferred_times TEXT NOT NULL,
    platform_preference TEXT DEFAULT 'any',
    study_habits TEXT NOT NULL,
    main_challenge TEXT NOT NULL,
    additional_notes TEXT,
    timestamp TEXT,
    source TEXT DEFAULT 'interview-scheduling',
    status TEXT DEFAULT 'pending',
    scheduled_time TEXT,
    meeting_link TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_interview_email ON interview_requests(email);
  CREATE INDEX IF NOT EXISTS idx_interview_status ON interview_requests(status);

  -- Cross-device sync events
  CREATE TABLE IF NOT EXISTS sync_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    device_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sync_user ON sync_events(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sync_type ON sync_events(user_id, event_type);

  -- Push notification subscriptions
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
`);

// Add user_id column to quiz_attempts if not exists
try {
  db.exec('ALTER TABLE quiz_attempts ADD COLUMN user_id TEXT');
} catch (e) {
  // Column already exists
}

// ============ PERFORMANCE MIDDLEWARE ============
const compression = require('compression');
const { getCache, cacheMiddleware, CacheInvalidator } = require('./lib/cache');
const { getMonitor } = require('./lib/monitor');

const cache = getCache();
const monitor = getMonitor();
monitor.setCacheRef(cache);
const cacheInvalidator = new CacheInvalidator(cache);

// Compression (50-70% bandwidth reduction for DICOM and JSON)
app.use(compression({ level: 6 }));

// Performance monitoring
app.use(monitor.middleware());

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ============ Authentication ============

// Auth middleware - extracts user from token, doesn't block if missing
function authMiddleware(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (e) {
      // Invalid token, continue as guest
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

// Require auth middleware - blocks if not authenticated
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Apply auth middleware to all routes
app.use(authMiddleware);

// Register new user
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, displayName } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  
  // Check if username exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'Username already taken' });
  }
  
  // Check if email exists (if provided)
  if (email) {
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }
  }
  
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, display_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username.toLowerCase(), email || null, passwordHash, displayName || username);
  
  // Generate token
  const token = jwt.sign({ id, username: username.toLowerCase(), displayName: displayName || username }, JWT_SECRET, { expiresIn: '30d' });
  
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });
  
  res.json({ 
    success: true, 
    user: { id, username: username.toLowerCase(), displayName: displayName || username }
  });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username.toLowerCase(), username.toLowerCase());
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Update last login
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  
  // Generate token
  const token = jwt.sign({ 
    id: user.id, 
    username: user.username, 
    displayName: user.display_name || user.username,
    role: user.role
  }, JWT_SECRET, { expiresIn: '30d' });
  
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
  
  res.json({ 
    success: true, 
    user: { 
      id: user.id, 
      username: user.username, 
      displayName: user.display_name || user.username,
      role: user.role
    }
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Get current user
app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.json({ user: null });
  }
  
  const user = db.prepare('SELECT id, username, email, display_name, role, created_at FROM users WHERE id = ?').get(req.user.id);
  
  if (!user) {
    res.clearCookie('token');
    return res.json({ user: null });
  }
  
  res.json({ 
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      createdAt: user.created_at
    }
  });
});

// Get all users (for admin)
app.get('/api/users', requireAuth, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, display_name, role, created_at, last_login,
           (SELECT COUNT(*) FROM quiz_attempts WHERE user_id = users.id) as quiz_count,
           (SELECT SUM(correct) FROM quiz_attempts WHERE user_id = users.id) as correct_count
    FROM users
    ORDER BY created_at DESC
  `).all();
  
  res.json({ users });
});

// ============ BETA PROGRAM ENDPOINTS ============

// Beta signup (no auth required)
app.post('/api/beta-signup', async (req, res) => {
  try {
    const {
      name,
      email,
      role,
      institution,
      specialty,
      studyTime,
      currentTools,
      motivation,
      interview,
      referrals,
      timestamp,
      source
    } = req.body;
    
    // Validate required fields
    if (!name || !email || !role || !institution || !studyTime || !motivation) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email format' 
      });
    }
    
    // Check if email already exists
    const existingSignup = db.prepare('SELECT id FROM beta_signups WHERE email = ?').get(email);
    if (existingSignup) {
      return res.json({ 
        success: true, 
        message: 'Already registered! We\'ll be in touch soon.',
        existing: true 
      });
    }
    
    // Create beta signup record
    const signupId = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO beta_signups (
        id, name, email, role, institution, specialty, study_time,
        current_tools, motivation, wants_interview, can_refer,
        timestamp, source, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      signupId,
      name.trim(),
      email.toLowerCase().trim(),
      role,
      institution.trim(),
      specialty || null,
      studyTime,
      Array.isArray(currentTools) ? currentTools.join(',') : '',
      motivation.trim(),
      interview === 'yes' ? 1 : 0,
      referrals === 'yes' ? 1 : 0,
      timestamp || new Date().toISOString(),
      source || 'beta-signup',
      'pending'
    );
    
    console.log(`✅ New beta signup: ${name} (${email}) - ${role} at ${institution}`);
    
    res.json({ 
      success: true, 
      message: 'Beta signup successful! Check your email for next steps.',
      signupId: signupId 
    });
    
  } catch (error) {
    console.error('Beta signup error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Get beta signups (admin only)
app.get('/api/beta-signups', requireAuth, (req, res) => {
  try {
    const signups = db.prepare(`
      SELECT id, name, email, role, institution, specialty, study_time,
             current_tools, motivation, wants_interview, can_refer,
             timestamp, status, created_at
      FROM beta_signups
      ORDER BY created_at DESC
    `).all();
    
    res.json({ success: true, signups });
  } catch (error) {
    console.error('Error fetching beta signups:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Update beta signup status (admin only)
app.post('/api/beta-signups/:id/status', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const validStatuses = ['pending', 'contacted', 'interviewed', 'activated', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid status' 
      });
    }
    
    const stmt = db.prepare(`
      UPDATE beta_signups 
      SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = stmt.run(status, notes || null, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Beta signup not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Status updated successfully' 
    });
    
  } catch (error) {
    console.error('Error updating beta signup:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Interview request (no auth required)
app.post('/api/interview-request', async (req, res) => {
  try {
    const {
      name,
      email,
      role,
      institution,
      timezone,
      selectedTimes,
      platformPreference,
      studyHabits,
      mainChallenge,
      additionalNotes,
      timestamp,
      source
    } = req.body;
    
    // Validate required fields
    if (!name || !email || !role || !institution || !timezone || !selectedTimes || !studyHabits || !mainChallenge) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email format' 
      });
    }
    
    // Create interview request record
    const requestId = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO interview_requests (
        id, name, email, role, institution, timezone, preferred_times,
        platform_preference, study_habits, main_challenge, additional_notes,
        timestamp, source, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      requestId,
      name.trim(),
      email.toLowerCase().trim(),
      role,
      institution.trim(),
      timezone,
      Array.isArray(selectedTimes) ? selectedTimes.join('; ') : selectedTimes,
      platformPreference || 'any',
      studyHabits.trim(),
      mainChallenge.trim(),
      additionalNotes ? additionalNotes.trim() : null,
      timestamp || new Date().toISOString(),
      source || 'interview-scheduling',
      'pending'
    );
    
    console.log(`🗣️ New interview request: ${name} (${email}) - ${role} at ${institution}`);
    
    res.json({ 
      success: true, 
      message: 'Interview request submitted successfully!',
      requestId: requestId 
    });
    
  } catch (error) {
    console.error('Interview request error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Get interview requests (admin only)
app.get('/api/interview-requests', requireAuth, (req, res) => {
  try {
    const requests = db.prepare(`
      SELECT id, name, email, role, institution, timezone, preferred_times,
             platform_preference, study_habits, main_challenge, additional_notes,
             timestamp, status, created_at
      FROM interview_requests
      ORDER BY created_at DESC
    `).all();
    
    res.json({ success: true, requests });
  } catch (error) {
    console.error('Error fetching interview requests:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// ============ SECURE STATIC FILE SERVING ============

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

app.use('/uploads', createSecureStatic(UPLOAD_DIR, '/uploads'));

// WebP content-negotiation for thumbnails
app.use('/thumbnails', (req, res, next) => {
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
  const fullWebpPath = path.join(THUMB_DIR, webpPath);
  const resolvedWebp = path.resolve(fullWebpPath);

  // Security: ensure within THUMB_DIR
  if (!resolvedWebp.startsWith(path.resolve(THUMB_DIR))) return next();

  if (fs.existsSync(resolvedWebp) && fs.statSync(resolvedWebp).isFile()) {
    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=86400',
      'Vary': 'Accept'
    });
    return res.sendFile(resolvedWebp, { dotfiles: 'allow' });
  }

  next();
});

app.use('/thumbnails', createSecureStatic(THUMB_DIR, '/thumbnails'));
app.use('/dicom', createSecureStatic(DICOM_DIR, '/dicom'));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // Service worker must not be cached aggressively
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
    // HTML pages - short cache
    else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min
    }
    // JS/CSS - cache for 1 day
    else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    // Icons/images - cache for 7 days
    else if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.svg')) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
    // manifest.json - short cache (important for PWA updates)
    else if (filePath.endsWith('manifest.json')) {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    }
  }
}));

// ============ SECURE MULTER CONFIG ============

// Enhanced multer storage with security validation
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    // Generate secure filename
    const secureFilename = generateSecureFilename(file.originalname);
    cb(null, secureFilename);
  }
});

// File filter for uploads - validate MIME types
const imageFileFilter = (req, file, cb) => {
  console.log(`Upload attempt: ${file.originalname}, MIME: ${file.mimetype}`);
  
  if (validateFileType(file.mimetype, ALLOWED_IMAGE_MIMES)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${ALLOWED_IMAGE_MIMES.join(', ')}`), false);
  }
};

// Standard image upload with security
const upload = multer({ 
  storage, 
  limits: { 
    fileSize: (process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024,
    files: 20 
  },
  fileFilter: imageFileFilter
});

// ============ API Routes ============

// Cache middleware for read-heavy endpoints
const apiCache10m = cacheMiddleware(cache, { ttl: 10 * 60 * 1000 }); // 10 min
const apiCache1h = cacheMiddleware(cache, { ttl: 60 * 60 * 1000 }); // 1 hour

// Performance monitoring endpoints
app.get('/api/admin/metrics', (req, res) => {
  res.json(monitor.getMetrics());
});

app.get('/api/admin/health', (req, res) => {
  const health = monitor.getHealth();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all cases with filters
app.get('/api/cases', apiCache10m, (req, res) => {
  const { modality, body_part, difficulty, tag, search, limit = 50, offset = 0 } = req.query;
  
  let sql = `
    SELECT c.*, 
           GROUP_CONCAT(DISTINCT t.name) as tags,
           COUNT(DISTINCT i.id) as image_count,
           (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
    FROM cases c
    LEFT JOIN case_tags ct ON c.id = ct.case_id
    LEFT JOIN tags t ON ct.tag_id = t.id
    LEFT JOIN images i ON c.id = i.case_id
  `;
  
  const conditions = [];
  const params = [];
  
  if (modality) {
    conditions.push('c.modality = ?');
    params.push(modality);
  }
  if (body_part) {
    conditions.push('c.body_part = ?');
    params.push(body_part);
  }
  if (difficulty) {
    conditions.push('c.difficulty = ?');
    params.push(parseInt(difficulty));
  }
  if (tag) {
    conditions.push('t.name = ?');
    params.push(tag);
  }
  if (search) {
    conditions.push('(c.title LIKE ? OR c.diagnosis LIKE ? OR c.clinical_history LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ' GROUP BY c.id ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  const cases = db.prepare(sql).all(...params);
  
  // Get total count
  let countSql = 'SELECT COUNT(DISTINCT c.id) as total FROM cases c';
  if (tag) {
    countSql += ' LEFT JOIN case_tags ct ON c.id = ct.case_id LEFT JOIN tags t ON ct.tag_id = t.id';
  }
  if (conditions.length > 0) {
    countSql += ' WHERE ' + conditions.join(' AND ');
  }
  const countParams = params.slice(0, -2);
  const { total } = db.prepare(countSql).get(...countParams) || { total: 0 };
  
  res.json({ cases, total, limit: parseInt(limit), offset: parseInt(offset) });
});

// Micro-learning case selection (must be before /api/cases/:id)
app.get('/api/cases/micro-learning', (req, res) => {
  const { specialty, difficulty, timeAvailable, lastReviewed, limit = 10 } = req.query;
  const userId = req.user?.id;
  const caseLimit = parseInt(limit);

  // Fetch a larger pool of candidates for weighted selection
  const poolSize = Math.max(caseLimit * 5, 50);

  let sql = `
    SELECT c.*,
           GROUP_CONCAT(DISTINCT t.name) as tags,
           (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
    FROM cases c
    LEFT JOIN case_tags ct ON c.id = ct.case_id
    LEFT JOIN tags t ON ct.tag_id = t.id
  `;

  const conditions = [];
  const params = [];

  if (specialty && specialty !== 'undefined') {
    conditions.push('(c.body_part = ? OR c.modality = ?)');
    params.push(specialty, specialty);
  }
  if (difficulty && difficulty !== 'undefined') {
    conditions.push('c.difficulty = ?');
    params.push(parseInt(difficulty) || 2);
  }
  conditions.push("c.diagnosis IS NOT NULL AND c.diagnosis != ''");

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' GROUP BY c.id LIMIT ?';
  params.push(poolSize);

  try {
    const cases = db.prepare(sql).all(...params);

    // Build performance and review data for weighted selection
    let performanceMap = {};
    let reviewMap = {};

    if (userId) {
      // Get quiz performance per case: accuracy ratio
      const quizStats = db.prepare(`
        SELECT case_id,
               COUNT(*) as attempts,
               SUM(correct) as correct_count
        FROM quiz_attempts
        WHERE user_id = ?
        GROUP BY case_id
      `).all(userId);

      for (const stat of quizStats) {
        performanceMap[stat.case_id] = {
          attempts: stat.attempts,
          accuracy: stat.correct_count / stat.attempts
        };
      }

      // Get last reviewed timestamps from user_case_progress
      const progressRows = db.prepare(`
        SELECT case_id, last_reviewed
        FROM user_case_progress
        WHERE user_id = ?
      `).all(userId);

      for (const row of progressRows) {
        reviewMap[row.case_id] = row.last_reviewed;
      }
    }

    const now = Date.now();
    const lastReviewedTs = lastReviewed ? parseInt(lastReviewed) : 0;

    // Calculate weight for each case
    const weighted = cases.map(c => {
      let weight = 1.0;

      // 1. Performance weight: prioritize cases the user got wrong or hasn't attempted
      const perf = performanceMap[c.id];
      if (perf) {
        // Lower accuracy = higher weight (focus on weak areas)
        weight *= 1.0 + (1.0 - perf.accuracy) * 2.0;
      } else {
        // Never attempted: moderate boost to introduce new cases
        weight *= 1.5;
      }

      // 2. Time since last review: prefer cases not seen recently
      const lastReview = reviewMap[c.id];
      if (lastReview) {
        const daysSinceReview = (now - new Date(lastReview).getTime()) / (1000 * 60 * 60 * 24);
        // More days since review = higher weight
        weight *= Math.min(1.0 + daysSinceReview * 0.3, 5.0);
      } else {
        // Never reviewed: boost
        weight *= 2.0;
      }

      // 3. Difficulty weight: slightly prefer cases matching the user's target difficulty
      const targetDiff = parseInt(difficulty) || 2;
      const diffDelta = Math.abs((c.difficulty || 2) - targetDiff);
      weight *= 1.0 / (1.0 + diffDelta * 0.3);

      return { caseData: c, weight };
    });

    // Weighted random selection
    const selected = [];
    const pool = [...weighted];

    while (selected.length < caseLimit && pool.length > 0) {
      const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
      let rand = Math.random() * totalWeight;

      for (let i = 0; i < pool.length; i++) {
        rand -= pool[i].weight;
        if (rand <= 0) {
          selected.push(pool[i].caseData);
          pool.splice(i, 1);
          break;
        }
      }
    }

    const microCases = selected.map(c => ({
      id: c.id,
      title: c.title,
      imageUrl: c.thumbnail ? `/thumbnails/${c.thumbnail}` : '',
      question: `What is the diagnosis for this ${c.modality || 'imaging'} study?`,
      options: generateOptions(c, selected),
      correctAnswer: 0,
      explanation: c.teaching_points || c.findings || '',
      difficulty: c.difficulty,
      specialty: c.body_part || c.modality || 'General',
      clinical_history: c.clinical_history
    }));

    microCases.forEach(mc => {
      const correctOption = mc.options[0];
      for (let i = mc.options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mc.options[i], mc.options[j]] = [mc.options[j], mc.options[i]];
      }
      mc.correctAnswer = mc.options.indexOf(correctOption);
    });

    res.json({ cases: microCases });
  } catch (err) {
    console.error('Micro-learning error:', err);
    res.status(500).json({ error: 'Failed to load micro-learning cases', cases: [] });
  }
});

function generateOptions(targetCase, allCases) {
  const correctDiagnosis = targetCase.diagnosis;
  const otherDiagnoses = allCases
    .filter(c => c.id !== targetCase.id && c.diagnosis)
    .map(c => c.diagnosis);

  const wrongAnswers = [];
  const shuffled = [...otherDiagnoses].sort(() => Math.random() - 0.5);
  for (const d of shuffled) {
    if (!wrongAnswers.includes(d) && d !== correctDiagnosis) {
      wrongAnswers.push(d);
      if (wrongAnswers.length >= 3) break;
    }
  }

  const fallbacks = ['Normal study', 'Artifact', 'Incidental finding'];
  while (wrongAnswers.length < 3) {
    const f = fallbacks[wrongAnswers.length];
    if (f && !wrongAnswers.includes(f) && f !== correctDiagnosis) {
      wrongAnswers.push(f);
    } else break;
  }

  return [correctDiagnosis, ...wrongAnswers];
}

// Get single case with all details
app.get('/api/cases/:id', apiCache1h, (req, res) => {
  const caseData = db.prepare(`
    SELECT c.*, GROUP_CONCAT(DISTINCT t.name) as tags
    FROM cases c
    LEFT JOIN case_tags ct ON c.id = ct.case_id
    LEFT JOIN tags t ON ct.tag_id = t.id
    WHERE c.id = ?
    GROUP BY c.id
  `).get(req.params.id);
  
  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }
  
  const images = db.prepare('SELECT * FROM images WHERE case_id = ? ORDER BY sequence').all(req.params.id);
  
  res.json({ ...caseData, images });
});

// Create new case
app.post('/api/cases', (req, res) => {
  const { title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings, tags } = req.body;
  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO cases (id, title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, modality, body_part, diagnosis, difficulty || 2, clinical_history, teaching_points, findings);
  
  // Handle tags
  if (tags && tags.length > 0) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
    const linkTag = db.prepare('INSERT INTO case_tags (case_id, tag_id) VALUES (?, ?)');
    
    for (const tagName of tags) {
      insertTag.run(tagName.trim().toLowerCase());
      const tag = getTagId.get(tagName.trim().toLowerCase());
      if (tag) linkTag.run(id, tag.id);
    }
  }
  
  cacheInvalidator.invalidateAllCases().catch(() => {});
  res.json({ id, message: 'Case created' });
});

// Update case
app.put('/api/cases/:id', (req, res) => {
  const { title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings, tags } = req.body;
  
  db.prepare(`
    UPDATE cases 
    SET title = ?, modality = ?, body_part = ?, diagnosis = ?, difficulty = ?, 
        clinical_history = ?, teaching_points = ?, findings = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings, req.params.id);
  
  // Update tags
  db.prepare('DELETE FROM case_tags WHERE case_id = ?').run(req.params.id);
  if (tags && tags.length > 0) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
    const linkTag = db.prepare('INSERT INTO case_tags (case_id, tag_id) VALUES (?, ?)');
    
    for (const tagName of tags) {
      insertTag.run(tagName.trim().toLowerCase());
      const tag = getTagId.get(tagName.trim().toLowerCase());
      if (tag) linkTag.run(req.params.id, tag.id);
    }
  }
  
  res.json({ message: 'Case updated' });
});

// Delete case
app.delete('/api/cases/:id', (req, res) => {
  // Get images to delete files
  const images = db.prepare('SELECT filename FROM images WHERE case_id = ?').all(req.params.id);
  for (const img of images) {
    fs.unlink(path.join(UPLOAD_DIR, img.filename), () => {});
    fs.unlink(path.join(THUMB_DIR, img.filename), () => {});
  }
  
  db.prepare('DELETE FROM cases WHERE id = ?').run(req.params.id);
  res.json({ message: 'Case deleted' });
});

// Upload images for a case
app.post('/api/cases/:id/images', upload.array('images', 20), async (req, res) => {
  const caseId = req.params.id;
  const insertImage = db.prepare(`
    INSERT INTO images (id, case_id, filename, original_name, sequence)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const currentMax = db.prepare('SELECT MAX(sequence) as maxSeq FROM images WHERE case_id = ?').get(caseId);
  let seq = (currentMax?.maxSeq || 0) + 1;
  
  const uploaded = [];
  for (const file of req.files) {
    const imageId = uuidv4();

    // Create thumbnail
    try {
      await sharp(file.path)
        .resize(400, 400, { fit: 'inside' })
        .toFile(path.join(THUMB_DIR, file.filename));
      // Also generate WebP version
      const webpName = file.filename.replace(/\.[^.]+$/, '.webp');
      await sharp(file.path)
        .resize(400, 400, { fit: 'inside' })
        .webp({ quality: 80 })
        .toFile(path.join(THUMB_DIR, webpName));
    } catch (e) {
      // If sharp fails (e.g., not an image), just copy the file
      fs.copyFileSync(file.path, path.join(THUMB_DIR, file.filename));
    }

    insertImage.run(imageId, caseId, file.filename, file.originalname, seq++);
    uploaded.push({ id: imageId, filename: file.filename });
  }
  
  res.json({ uploaded });
});

// Update image annotations
app.put('/api/images/:id/annotations', (req, res) => {
  const { annotations } = req.body;
  db.prepare('UPDATE images SET annotations = ? WHERE id = ?').run(JSON.stringify(annotations), req.params.id);
  res.json({ message: 'Annotations saved' });
});

// Delete image
app.delete('/api/images/:id', (req, res) => {
  const image = db.prepare('SELECT filename FROM images WHERE id = ?').get(req.params.id);
  if (image) {
    fs.unlink(path.join(UPLOAD_DIR, image.filename), () => {});
    fs.unlink(path.join(THUMB_DIR, image.filename), () => {});
  }
  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  res.json({ message: 'Image deleted' });
});

// Get all tags
app.get('/api/tags', apiCache1h, (req, res) => {
  const tags = db.prepare(`
    SELECT t.name, COUNT(ct.case_id) as count 
    FROM tags t 
    LEFT JOIN case_tags ct ON t.id = ct.tag_id 
    GROUP BY t.id 
    ORDER BY count DESC
  `).all();
  res.json(tags);
});

// Get filter options (distinct values)
app.get('/api/filters', (req, res) => {
  const modalities = db.prepare('SELECT DISTINCT modality FROM cases WHERE modality IS NOT NULL ORDER BY modality').all();
  const bodyParts = db.prepare('SELECT DISTINCT body_part FROM cases WHERE body_part IS NOT NULL ORDER BY body_part').all();
  
  res.json({
    modalities: modalities.map(m => m.modality),
    bodyParts: bodyParts.map(b => b.body_part),
    difficulties: [1, 2, 3, 4, 5]
  });
});

// ============ DICOM Handling ============

// ============ SECURE DICOM UPLOAD CONFIG ============

const dicomStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.dicomSeriesId) {
      req.dicomSeriesId = req.params.seriesId || uuidv4();
    }
    const seriesDir = path.join(DICOM_DIR, req.dicomSeriesId);
    fs.mkdirSync(seriesDir, { recursive: true });
    console.log(`DICOM destination: seriesId=${req.dicomSeriesId}, file=${file.originalname}`);
    cb(null, seriesDir);
  },
  filename: (req, file, cb) => {
    // Generate secure filename for DICOM
    const secureFilename = generateSecureFilename(file.originalname || 'dicom.dcm');
    cb(null, secureFilename);
  }
});

// DICOM file filter
const dicomFileFilter = (req, file, cb) => {
  console.log(`DICOM upload: ${file.originalname}, MIME: ${file.mimetype}`);
  
  // For DICOM, we're more lenient with MIME types as they vary
  if (validateFileType(file.mimetype, ALLOWED_DICOM_MIMES) || 
      file.originalname.toLowerCase().endsWith('.dcm') ||
      file.originalname.toLowerCase().includes('dicom')) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid DICOM file type. MIME: ${file.mimetype}`), false);
  }
};

const dicomUpload = multer({ 
  storage: dicomStorage, 
  limits: { 
    fileSize: (process.env.MAX_DICOM_FILE_SIZE_MB || 500) * 1024 * 1024,
    files: 1000
  },
  fileFilter: dicomFileFilter
});

// Helper function to parse DICOM metadata
function parseDicomFile(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const byteArray = new Uint8Array(arrayBuffer);
    const dataSet = dicomParser.parseDicom(byteArray);
    
    const getString = (tag) => {
      try { return dataSet.string(tag) || ''; } catch (e) { return ''; }
    };
    const getNumber = (tag) => {
      try { return parseFloat(dataSet.string(tag)) || null; } catch (e) { return null; }
    };
    
    return {
      patientName: getString('x00100010'),
      patientId: getString('x00100020'),
      studyDescription: getString('x00081030'),
      seriesDescription: getString('x0008103e'),
      modality: getString('x00080060'),
      seriesInstanceUID: getString('x0020000e'),
      studyInstanceUID: getString('x0020000d'),
      sopInstanceUID: getString('x00080018'),
      instanceNumber: parseInt(getString('x00200013')) || 0,
      windowCenter: getNumber('x00281050'),
      windowWidth: getNumber('x00281051'),
      rows: parseInt(getString('x00280010')) || 0,
      columns: parseInt(getString('x00280011')) || 0,
      bitsAllocated: parseInt(getString('x00280100')) || 16,
      pixelSpacing: getString('x00280030'),
      sliceThickness: getNumber('x00180050'),
      sliceLocation: getNumber('x00201041')
    };
  } catch (e) {
    console.error('Error parsing DICOM:', e.message);
    return null;
  }
}

// Get DICOM series for a case
app.get('/api/cases/:id/dicom', (req, res) => {
  const series = db.prepare(`
    SELECT * FROM dicom_series WHERE case_id = ? ORDER BY created_at
  `).all(req.params.id);
  
  res.json({ series });
});

// Upload DICOM series for a case
app.post('/api/cases/:id/dicom', dicomUpload.array('files', 1000), async (req, res) => {
  console.log(`DICOM upload: ${req.files?.length} files received, seriesId=${req.dicomSeriesId}`);
  if (req.files) {
    req.files.forEach((f, i) => console.log(`  file[${i}]: ${f.originalname} -> ${f.path}`));
  }
  const caseId = req.params.id;
  const seriesId = req.dicomSeriesId || uuidv4();
  const seriesDir = path.join(DICOM_DIR, seriesId);
  
  // Ensure directory exists
  fs.mkdirSync(seriesDir, { recursive: true });
  
  // Parse first DICOM file for metadata
  let metadata = null;
  const dicomFiles = [];
  
  if (req.files && req.files.length > 0) {
    // Get metadata from first file
    metadata = parseDicomFile(req.files[0].path);
    
    // Collect all DICOM file info
    for (const file of req.files) {
      const fileMetadata = parseDicomFile(file.path);
      dicomFiles.push({
        filename: file.filename,
        instanceNumber: fileMetadata?.instanceNumber || 0,
        sliceLocation: fileMetadata?.sliceLocation
      });
    }
    
    // Sort by instance number or slice location
    dicomFiles.sort((a, b) => {
      if (a.sliceLocation !== null && b.sliceLocation !== null) {
        return a.sliceLocation - b.sliceLocation;
      }
      return a.instanceNumber - b.instanceNumber;
    });
  }
  
  // Insert series record
  db.prepare(`
    INSERT INTO dicom_series (
      id, case_id, series_uid, series_description, modality, num_images, 
      folder_name, patient_name, study_description, window_center, window_width
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    seriesId,
    caseId,
    metadata?.seriesInstanceUID || null,
    metadata?.seriesDescription || 'Unnamed Series',
    metadata?.modality || 'Unknown',
    dicomFiles.length,
    seriesId,
    metadata?.patientName || null,
    metadata?.studyDescription || null,
    metadata?.windowCenter || null,
    metadata?.windowWidth || null
  );
  
  res.json({
    seriesId,
    numImages: dicomFiles.length,
    metadata,
    files: dicomFiles
  });
});

// Get list of DICOM images in a series (for viewer)
app.get('/api/dicom/series', apiCache1h, (req, res) => {
  const { path: seriesPath, seriesId } = req.query;
  const folder = seriesId || seriesPath;
  
  if (!folder) {
    return res.status(400).json({ error: 'Series path or ID required' });
  }
  
  const seriesDir = path.join(DICOM_DIR, folder);
  
  if (!fs.existsSync(seriesDir)) {
    return res.status(404).json({ error: 'Series not found' });
  }
  
  try {
    // Get all DICOM files
    const files = fs.readdirSync(seriesDir)
      .filter(f => f.endsWith('.dcm') || !f.includes('.'))
      .map(filename => {
        const filePath = path.join(seriesDir, filename);
        const metadata = parseDicomFile(filePath);
        return {
          filename,
          instanceNumber: metadata?.instanceNumber || 0,
          sliceLocation: metadata?.sliceLocation
        };
      })
      .sort((a, b) => {
        if (a.sliceLocation !== null && b.sliceLocation !== null) {
          return a.sliceLocation - b.sliceLocation;
        }
        return a.instanceNumber - b.instanceNumber;
      });
    
    // Generate image IDs for Cornerstone (wadouri scheme)
    const imageIds = files.map(f => `wadouri:/dicom/${folder}/${f.filename}`);
    
    // Get metadata from first file
    const firstFile = path.join(seriesDir, files[0]?.filename);
    const metadata = files.length > 0 ? parseDicomFile(firstFile) : null;
    
    res.json({
      imageIds,
      numImages: files.length,
      metadata
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get DICOM series info
app.get('/api/dicom/:seriesId', (req, res) => {
  const series = db.prepare('SELECT * FROM dicom_series WHERE id = ?').get(req.params.seriesId);
  
  if (!series) {
    return res.status(404).json({ error: 'Series not found' });
  }
  
  const seriesDir = path.join(DICOM_DIR, series.folder_name);
  if (!fs.existsSync(seriesDir)) {
    return res.json({ ...series, files: 0, imageIds: [] });
  }
  
  // Parse and sort by instance number / slice location
  const files = fs.readdirSync(seriesDir)
    .filter(f => f.endsWith('.dcm') || !f.includes('.'))
    .map(filename => {
      const metadata = parseDicomFile(path.join(seriesDir, filename));
      return {
        filename,
        instanceNumber: metadata?.instanceNumber || 0,
        sliceLocation: metadata?.sliceLocation
      };
    })
    .sort((a, b) => {
      if (a.sliceLocation !== null && b.sliceLocation !== null &&
          a.sliceLocation !== undefined && b.sliceLocation !== undefined) {
        return a.sliceLocation - b.sliceLocation;
      }
      return a.instanceNumber - b.instanceNumber;
    });
  
  res.json({
    ...series,
    files: files.length,
    imageIds: files.map(f => `wadouri:/dicom/${series.folder_name}/${f.filename}`)
  });
});

// Delete DICOM series
app.delete('/api/dicom/:seriesId', (req, res) => {
  const series = db.prepare('SELECT folder_name FROM dicom_series WHERE id = ?').get(req.params.seriesId);
  
  if (series) {
    // Delete directory
    const seriesDir = path.join(DICOM_DIR, series.folder_name);
    if (fs.existsSync(seriesDir)) {
      fs.rmSync(seriesDir, { recursive: true, force: true });
    }
    
    // Delete database record
    db.prepare('DELETE FROM dicom_series WHERE id = ?').run(req.params.seriesId);
  }
  
  res.json({ message: 'Series deleted' });
});

// ============ Quiz Mode ============

// Get random case for quiz
app.get('/api/quiz/random', (req, res) => {
  const { modality, body_part, difficulty } = req.query;
  
  let sql = `
    SELECT c.id, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty, 
           c.clinical_history, c.findings, c.teaching_points,
           (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as image
    FROM cases c
  `;
  
  const conditions = [];
  const params = [];
  
  if (modality) {
    conditions.push('c.modality = ?');
    params.push(modality);
  }
  if (body_part) {
    conditions.push('c.body_part = ?');
    params.push(body_part);
  }
  if (difficulty) {
    conditions.push('c.difficulty = ?');
    params.push(parseInt(difficulty));
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ' ORDER BY RANDOM() LIMIT 1';
  
  const quizCase = db.prepare(sql).get(...params);
  
  if (!quizCase) {
    return res.status(404).json({ error: 'No cases found matching criteria' });
  }
  
  // Get all images for this case
  const images = db.prepare('SELECT * FROM images WHERE case_id = ? ORDER BY sequence').all(quizCase.id);
  
  res.json({ ...quizCase, images });
});

// Submit quiz attempt
app.post('/api/quiz/attempt', (req, res) => {
  const { case_id, correct, time_spent_ms } = req.body;
  const userId = req.user?.id || null;
  
  db.prepare(`
    INSERT INTO quiz_attempts (case_id, correct, time_spent_ms, user_id)
    VALUES (?, ?, ?, ?)
  `).run(case_id, correct ? 1 : 0, time_spent_ms, userId);
  
  // Update spaced repetition progress if user is logged in
  if (userId) {
    updateSpacedRepetition(userId, case_id, correct ? 1 : 0);
  }
  
  res.json({ message: 'Attempt recorded' });
});

// SM-2 Spaced Repetition Algorithm
function updateSpacedRepetition(userId, caseId, quality) {
  // quality: 0 = wrong, 1 = correct
  const grade = quality ? 4 : 1; // Map to 0-5 scale (1=wrong, 4=correct)
  
  let progress = db.prepare('SELECT * FROM user_case_progress WHERE user_id = ? AND case_id = ?').get(userId, caseId);
  
  if (!progress) {
    progress = { ease_factor: 2.5, interval_days: 1, repetitions: 0 };
  }
  
  let { ease_factor, interval_days, repetitions } = progress;
  
  if (grade >= 3) {
    // Correct response
    if (repetitions === 0) {
      interval_days = 1;
    } else if (repetitions === 1) {
      interval_days = 6;
    } else {
      interval_days = Math.round(interval_days * ease_factor);
    }
    repetitions++;
  } else {
    // Wrong response - reset
    repetitions = 0;
    interval_days = 1;
  }
  
  // Update ease factor
  ease_factor = ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (ease_factor < 1.3) ease_factor = 1.3;
  
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval_days);
  
  db.prepare(`
    INSERT OR REPLACE INTO user_case_progress (user_id, case_id, ease_factor, interval_days, repetitions, next_review, last_reviewed)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(userId, caseId, ease_factor, interval_days, repetitions, nextReview.toISOString().split('T')[0]);
}

// Get quiz stats (user-specific if logged in)
app.get('/api/quiz/stats', (req, res) => {
  const userId = req.user?.id;
  const userFilter = userId ? 'WHERE qa.user_id = ?' : '';
  const userParams = userId ? [userId] : [];
  
  const overall = db.prepare(`
    SELECT 
      COUNT(*) as total_attempts,
      SUM(correct) as correct_count,
      AVG(time_spent_ms) as avg_time_ms
    FROM quiz_attempts qa
    ${userFilter}
  `).get(...userParams);
  
  const byDifficulty = db.prepare(`
    SELECT 
      c.difficulty,
      COUNT(*) as attempts,
      SUM(qa.correct) as correct,
      AVG(qa.time_spent_ms) as avg_time_ms
    FROM quiz_attempts qa
    JOIN cases c ON qa.case_id = c.id
    ${userFilter ? userFilter.replace('WHERE', userFilter.includes('JOIN') ? 'AND' : 'WHERE') : ''}
    GROUP BY c.difficulty
    ORDER BY c.difficulty
  `).all(...userParams);
  
  const recentMisses = db.prepare(`
    SELECT c.id, c.title, c.diagnosis, c.difficulty, COUNT(*) as miss_count
    FROM quiz_attempts qa
    JOIN cases c ON qa.case_id = c.id
    WHERE qa.correct = 0 ${userId ? 'AND qa.user_id = ?' : ''}
    GROUP BY c.id
    ORDER BY miss_count DESC, qa.attempted_at DESC
    LIMIT 5
  `).all(...userParams);
  
  res.json({ overall, byDifficulty, recentMisses, isPersonal: !!userId });
});

// Get cases due for review (spaced repetition)
app.get('/api/review/due', requireAuth, (req, res) => {
  const userId = req.user.id;
  const { limit = 10 } = req.query;
  
  const dueCases = db.prepare(`
    SELECT c.*, ucp.next_review, ucp.repetitions, ucp.interval_days,
           (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
    FROM user_case_progress ucp
    JOIN cases c ON ucp.case_id = c.id
    WHERE ucp.user_id = ? AND ucp.next_review <= date('now')
    ORDER BY ucp.next_review ASC
    LIMIT ?
  `).all(userId, parseInt(limit));
  
  // Also get new cases (never reviewed)
  const newCases = db.prepare(`
    SELECT c.*,
           (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
    FROM cases c
    WHERE c.id NOT IN (SELECT case_id FROM user_case_progress WHERE user_id = ?)
    ORDER BY RANDOM()
    LIMIT ?
  `).all(userId, Math.max(0, parseInt(limit) - dueCases.length));
  
  res.json({ 
    dueCases, 
    newCases,
    totalDue: dueCases.length,
    totalNew: newCases.length
  });
});

// Get user progress summary
app.get('/api/progress', requireAuth, (req, res) => {
  const userId = req.user.id;
  
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_attempts,
      SUM(correct) as correct_count,
      COUNT(DISTINCT case_id) as unique_cases
    FROM quiz_attempts
    WHERE user_id = ?
  `).get(userId);
  
  const streakData = db.prepare(`
    SELECT DATE(attempted_at) as day, COUNT(*) as attempts
    FROM quiz_attempts
    WHERE user_id = ?
    GROUP BY DATE(attempted_at)
    ORDER BY day DESC
    LIMIT 30
  `).all(userId);
  
  const masteredCases = db.prepare(`
    SELECT COUNT(*) as count
    FROM user_case_progress
    WHERE user_id = ? AND repetitions >= 3 AND interval_days >= 21
  `).get(userId);
  
  const learningCases = db.prepare(`
    SELECT COUNT(*) as count
    FROM user_case_progress
    WHERE user_id = ? AND repetitions > 0 AND (repetitions < 3 OR interval_days < 21)
  `).get(userId);
  
  res.json({
    totalAttempts: stats.total_attempts || 0,
    correctCount: stats.correct_count || 0,
    accuracy: stats.total_attempts ? Math.round((stats.correct_count / stats.total_attempts) * 100) : 0,
    uniqueCases: stats.unique_cases || 0,
    masteredCases: masteredCases.count || 0,
    learningCases: learningCases.count || 0,
    streakData
  });
});

// ============ Analytics ============

app.get('/api/analytics', (req, res) => {
  const caseCount = db.prepare('SELECT COUNT(*) as count FROM cases').get();
  const imageCount = db.prepare('SELECT COUNT(*) as count FROM images').get();
  const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get();
  
  const byModality = db.prepare(`
    SELECT modality, COUNT(*) as count 
    FROM cases 
    WHERE modality IS NOT NULL 
    GROUP BY modality 
    ORDER BY count DESC
  `).all();
  
  const byBodyPart = db.prepare(`
    SELECT body_part, COUNT(*) as count 
    FROM cases 
    WHERE body_part IS NOT NULL 
    GROUP BY body_part 
    ORDER BY count DESC
  `).all();
  
  const recentCases = db.prepare(`
    SELECT id, title, modality, created_at 
    FROM cases 
    ORDER BY created_at DESC 
    LIMIT 5
  `).all();
  
  res.json({
    counts: {
      cases: caseCount.count,
      images: imageCount.count,
      tags: tagCount.count
    },
    byModality,
    byBodyPart,
    recentCases
  });
});

// ============ AI Integration ============

// AI Configuration (stored in database)
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

function getAIConfig() {
  const rows = db.prepare('SELECT key, value FROM ai_config').all();
  const config = {};
  rows.forEach(r => { config[r.key] = r.value; });
  return config;
}

function setAIConfig(key, value) {
  db.prepare('INSERT OR REPLACE INTO ai_config (key, value) VALUES (?, ?)').run(key, value);
}

// Check AI configuration status
app.get('/api/ai/status', (req, res) => {
  const config = getAIConfig();
  res.json({
    configured: !!(config.provider && config.apiKey),
    provider: config.provider || null,
    model: config.model || null
  });
});

// Configure AI provider
app.post('/api/ai/configure', (req, res) => {
  const { provider, apiKey, model, baseUrl } = req.body;
  
  if (provider) setAIConfig('provider', provider);
  if (apiKey) setAIConfig('apiKey', apiKey);
  if (model) setAIConfig('model', model);
  if (baseUrl) setAIConfig('baseUrl', baseUrl);
  
  res.json({ success: true });
});

// AI Chat endpoint
app.post('/api/ai/chat', async (req, res) => {
  const config = getAIConfig();
  
  if (!config.provider || !config.apiKey) {
    return res.json({ error: 'AI not configured' });
  }

  const { systemPrompt, messages } = req.body;

  try {
    const response = await callAI(config, systemPrompt, messages);
    res.json({ response });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// AI Completion endpoint (single prompt)
app.post('/api/ai/complete', async (req, res) => {
  const config = getAIConfig();
  
  if (!config.provider || !config.apiKey) {
    return res.json({ error: 'AI not configured' });
  }

  const { prompt, maxTokens } = req.body;

  try {
    const response = await callAI(config, 'You are a helpful radiology education assistant.', [
      { role: 'user', content: prompt }
    ], maxTokens);
    res.json({ response });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Generic AI call function supporting multiple providers
async function callAI(config, systemPrompt, messages, maxTokens = 1000) {
  const provider = config.provider.toLowerCase();
  
  // Build messages array with system prompt
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  if (provider === 'openai' || provider === 'openai-compatible') {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const model = config.model || 'gpt-4o-mini';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        max_tokens: maxTokens,
        temperature: 0.7
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || 'API error');
    }
    
    return data.choices[0].message.content;
  }
  
  if (provider === 'anthropic') {
    const model = config.model || 'claude-3-haiku-20240307';
    
    // Convert messages format for Anthropic
    const anthropicMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: anthropicMessages
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || 'API error');
    }
    
    return data.content[0].text;
  }

  if (provider === 'ollama') {
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    const model = config.model || 'llama2';

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        stream: false
      })
    });

    const data = await response.json();
    return data.message.content;
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}

// ============ Import/Export ============

// Export all cases
app.get('/api/export', (req, res) => {
  const cases = db.prepare(`
    SELECT c.*, GROUP_CONCAT(DISTINCT t.name) as tags
    FROM cases c
    LEFT JOIN case_tags ct ON c.id = ct.case_id
    LEFT JOIN tags t ON ct.tag_id = t.id
    GROUP BY c.id
  `).all();

  const exportData = cases.map(c => {
    const images = db.prepare('SELECT * FROM images WHERE case_id = ?').all(c.id);
    return {
      ...c,
      tags: c.tags ? c.tags.split(',') : [],
      images: images.map(img => ({
        ...img,
        // Include base64 of image for portability
        data: fs.existsSync(path.join(UPLOAD_DIR, img.filename)) 
          ? fs.readFileSync(path.join(UPLOAD_DIR, img.filename), 'base64')
          : null
      }))
    };
  });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="radcase-export-${new Date().toISOString().split('T')[0]}.json"`);
  res.json({
    version: 1,
    exportDate: new Date().toISOString(),
    caseCount: cases.length,
    cases: exportData
  });
});

// Export single case
app.get('/api/cases/:id/export', (req, res) => {
  const caseData = db.prepare(`
    SELECT c.*, GROUP_CONCAT(DISTINCT t.name) as tags
    FROM cases c
    LEFT JOIN case_tags ct ON c.id = ct.case_id
    LEFT JOIN tags t ON ct.tag_id = t.id
    WHERE c.id = ?
    GROUP BY c.id
  `).get(req.params.id);

  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }

  const images = db.prepare('SELECT * FROM images WHERE case_id = ?').all(caseData.id);
  
  const exportData = {
    ...caseData,
    tags: caseData.tags ? caseData.tags.split(',') : [],
    images: images.map(img => ({
      ...img,
      data: fs.existsSync(path.join(UPLOAD_DIR, img.filename))
        ? fs.readFileSync(path.join(UPLOAD_DIR, img.filename), 'base64')
        : null
    }))
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="case-${caseData.id}.json"`);
  res.json({ version: 1, case: exportData });
});

// Import cases
app.post('/api/import', express.json({ limit: '100mb' }), async (req, res) => {
  const { cases } = req.body;
  
  if (!cases || !Array.isArray(cases)) {
    return res.status(400).json({ error: 'Invalid import format' });
  }

  let imported = 0;
  let errors = [];

  for (const c of cases) {
    try {
      const id = uuidv4();
      
      db.prepare(`
        INSERT INTO cases (id, title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty || 2, c.clinical_history, c.teaching_points, c.findings);

      // Handle tags
      if (c.tags && c.tags.length > 0) {
        const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
        const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
        const linkTag = db.prepare('INSERT INTO case_tags (case_id, tag_id) VALUES (?, ?)');
        
        for (const tagName of c.tags) {
          insertTag.run(tagName.trim().toLowerCase());
          const tag = getTagId.get(tagName.trim().toLowerCase());
          if (tag) linkTag.run(id, tag.id);
        }
      }

      // Handle images
      if (c.images && c.images.length > 0) {
        for (let i = 0; i < c.images.length; i++) {
          const img = c.images[i];
          if (img.data) {
            const imageId = uuidv4();
            const ext = path.extname(img.original_name || img.filename || '.jpg');
            const filename = `${imageId}${ext}`;
            
            // Save image
            const buffer = Buffer.from(img.data, 'base64');
            fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
            
            // Create thumbnail
            try {
              await sharp(buffer)
                .resize(400, 400, { fit: 'inside' })
                .toFile(path.join(THUMB_DIR, filename));
              // Also generate WebP version
              const webpName = filename.replace(/\.[^.]+$/, '.webp');
              await sharp(buffer)
                .resize(400, 400, { fit: 'inside' })
                .webp({ quality: 80 })
                .toFile(path.join(THUMB_DIR, webpName));
            } catch (e) {
              fs.copyFileSync(path.join(UPLOAD_DIR, filename), path.join(THUMB_DIR, filename));
            }

            db.prepare(`
              INSERT INTO images (id, case_id, filename, original_name, sequence, annotations)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(imageId, id, filename, img.original_name, i, img.annotations);
          }
        }
      }

      imported++;
    } catch (err) {
      errors.push({ case: c.title, error: err.message });
    }
  }

  res.json({ imported, errors });
});

// ============ Sprint 2: Missing API Endpoints ============

// VAPID public key endpoint (no auth required for subscription flow)
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Push notification subscription (PWA) - persist to database
app.post('/api/push-subscription', requireAuth, (req, res) => {
  const { subscription, userAgent } = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Valid subscription data required' });
  }

  const { endpoint, keys } = subscription;
  if (!keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'Subscription keys (p256dh, auth) required' });
  }

  try {
    db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth, user_agent)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        keys_p256dh = excluded.keys_p256dh,
        keys_auth = excluded.keys_auth,
        user_agent = excluded.user_agent,
        created_at = CURRENT_TIMESTAMP
    `).run(req.user.id, endpoint, keys.p256dh, keys.auth, userAgent || null);

    console.log(`Push subscription saved for user ${req.user.username}: ${endpoint.substring(0, 50)}...`);
    res.json({ success: true, message: 'Subscription saved' });
  } catch (err) {
    console.error('Push subscription error:', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Annotations sync endpoint (used by service worker background sync)
app.post('/api/annotations', (req, res) => {
  const { image_id, case_id, annotations } = req.body;
  if (!image_id || !annotations) {
    return res.status(400).json({ error: 'image_id and annotations required' });
  }
  try {
    db.prepare('UPDATE images SET annotations = ? WHERE id = ?').run(
      typeof annotations === 'string' ? annotations : JSON.stringify(annotations),
      image_id
    );
    res.json({ success: true, message: 'Annotations saved' });
  } catch (err) {
    console.error('Annotation save error:', err);
    res.status(500).json({ error: 'Failed to save annotations' });
  }
});

// Progress sync endpoint (used by service worker background sync)
app.post('/api/progress', (req, res) => {
  const userId = req.user?.id;
  const { case_id, event, data, sessionId } = req.body;

  if (!case_id && !sessionId) {
    return res.status(400).json({ error: 'case_id or sessionId required' });
  }

  // If it's a quiz attempt, record it
  if (event === 'answer_submitted' && case_id) {
    db.prepare(`
      INSERT INTO quiz_attempts (case_id, correct, time_spent_ms, user_id)
      VALUES (?, ?, ?, ?)
    `).run(case_id, data?.correct ? 1 : 0, data?.time_spent_ms || 0, userId);

    if (userId) {
      updateSpacedRepetition(userId, case_id, data?.correct ? 1 : 0);
    }
  }

  res.json({ success: true, message: 'Progress synced' });
});

// ============ Active Micro-Learning Session (Cross-Device Resumption) ============

db.exec(`
  CREATE TABLE IF NOT EXISTS active_sessions (
    user_id TEXT PRIMARY KEY,
    session_state TEXT NOT NULL,
    device_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// GET active session for the authenticated user
app.get('/api/session/active', requireAuth, (req, res) => {
  const row = db.prepare('SELECT session_state, device_id, updated_at FROM active_sessions WHERE user_id = ?').get(req.user.id);
  if (!row) {
    return res.json({ session: null });
  }
  try {
    const state = JSON.parse(row.session_state);
    // Expire sessions older than 30 minutes
    const updatedAt = new Date(row.updated_at).getTime();
    if (Date.now() - updatedAt > 30 * 60 * 1000) {
      db.prepare('DELETE FROM active_sessions WHERE user_id = ?').run(req.user.id);
      return res.json({ session: null });
    }
    res.json({ session: state, deviceId: row.device_id, updatedAt: row.updated_at });
  } catch {
    res.json({ session: null });
  }
});

// PUT (upsert) active session
app.put('/api/session/active', requireAuth, (req, res) => {
  const { state, deviceId } = req.body;
  if (!state) {
    return res.status(400).json({ error: 'state is required' });
  }
  db.prepare(`
    INSERT INTO active_sessions (user_id, session_state, device_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET session_state = excluded.session_state, device_id = excluded.device_id, updated_at = datetime('now')
  `).run(req.user.id, JSON.stringify(state), deviceId || null);
  res.json({ success: true });
});

// DELETE active session (session ended)
app.delete('/api/session/active', requireAuth, (req, res) => {
  db.prepare('DELETE FROM active_sessions WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

// Bookmarks API
db.exec(`
  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, case_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
`);

app.get('/api/bookmarks', requireAuth, (req, res) => {
  const bookmarks = db.prepare(`
    SELECT b.*, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty,
           (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
    FROM bookmarks b
    JOIN cases c ON b.case_id = c.id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json({ bookmarks });
});

app.post('/api/bookmarks', requireAuth, (req, res) => {
  const { case_id } = req.body;
  if (!case_id) {
    return res.status(400).json({ error: 'case_id required' });
  }
  try {
    db.prepare('INSERT OR IGNORE INTO bookmarks (user_id, case_id) VALUES (?, ?)').run(req.user.id, case_id);
    res.json({ success: true, message: 'Bookmarked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to bookmark' });
  }
});

app.delete('/api/bookmarks/:caseId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND case_id = ?').run(req.user.id, req.params.caseId);
  res.json({ success: true, message: 'Bookmark removed' });
});

// Serve beta signup page
app.get('/beta', (req, res) => {
  res.sendFile(path.join(__dirname, 'beta-signup.html'));
});

// Serve interview scheduling page
app.get('/interview', (req, res) => {
  res.sendFile(path.join(__dirname, 'interview-scheduling.html'));
});

// Issue a short-lived token for WebSocket auth (since JWT is httpOnly)
app.get('/api/sync/token', requireAuth, (req, res) => {
  const token = jwt.sign(
    { id: req.user.id, username: req.user.username, displayName: req.user.displayName },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  res.json({ token });
});

// REST endpoint to get sync history
app.get('/api/sync/events', requireAuth, (req, res) => {
  const { since, type, limit = 50 } = req.query;
  const params = [req.user.id];
  let sql = 'SELECT event_type, payload, device_id, created_at FROM sync_events WHERE user_id = ?';

  if (since) {
    sql += ' AND created_at > ?';
    params.push(since);
  }
  if (type) {
    sql += ' AND event_type = ?';
    params.push(type);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const events = db.prepare(sql).all(...params);
  res.json({
    events: events.map(e => ({
      type: e.event_type,
      payload: JSON.parse(e.payload),
      deviceId: e.device_id,
      timestamp: e.created_at
    }))
  });
});

// Serve frontend for any non-API route
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ WebSocket Cross-Device Sync ============

// Track connected clients per user: Map<userId, Set<ws>>
const syncClients = new Map();

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    // Extract token from query params
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }

    let user;
    try {
      user = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      ws.close(4001, 'Invalid token');
      return;
    }

    ws.userId = user.id;
    ws.deviceId = url.searchParams.get('deviceId') || 'unknown';

    // Register this connection
    if (!syncClients.has(user.id)) {
      syncClients.set(user.id, new Set());
    }
    syncClients.get(user.id).add(ws);

    console.log(`🔄 Sync: ${user.username} connected (device: ${ws.deviceId}, total: ${syncClients.get(user.id).size})`);

    // Send recent sync events so the device can catch up
    try {
      const recent = db.prepare(`
        SELECT event_type, payload, device_id, created_at
        FROM sync_events
        WHERE user_id = ? AND device_id != ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(user.id, ws.deviceId);

      if (recent.length > 0) {
        ws.send(JSON.stringify({
          type: 'sync:catchup',
          events: recent.reverse().map(e => ({
            type: e.event_type,
            payload: JSON.parse(e.payload),
            deviceId: e.device_id,
            timestamp: e.created_at
          }))
        }));
      }
    } catch (e) {
      console.error('Sync catchup error:', e.message);
    }

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch (e) {
        return;
      }

      const validTypes = ['sync:progress', 'sync:bookmarks', 'sync:annotations', 'sync:preferences', 'sync:session'];
      if (!validTypes.includes(msg.type)) return;

      // Store sync event
      try {
        db.prepare(`
          INSERT INTO sync_events (user_id, event_type, payload, device_id)
          VALUES (?, ?, ?, ?)
        `).run(user.id, msg.type, JSON.stringify(msg.payload), ws.deviceId);
      } catch (e) {
        console.error('Sync store error:', e.message);
      }

      // Broadcast to other devices of same user
      const clients = syncClients.get(user.id);
      if (clients) {
        const outgoing = JSON.stringify({
          type: msg.type,
          payload: msg.payload,
          deviceId: ws.deviceId,
          timestamp: new Date().toISOString()
        });
        for (const client of clients) {
          if (client !== ws && client.readyState === 1) {
            client.send(outgoing);
          }
        }
      }
    });

    ws.on('close', () => {
      const clients = syncClients.get(user.id);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          syncClients.delete(user.id);
        }
      }
      console.log(`🔄 Sync: ${user.username} disconnected (device: ${ws.deviceId})`);
    });

    ws.on('error', (err) => {
      console.error(`Sync WebSocket error for ${user.username}:`, err.message);
    });
  });

  return wss;
}

// ============ Push Notification Study Reminders ============

async function sendStudyReminders() {
  try {
    // Find users who haven't studied in 24 hours and have push subscriptions
    const users = db.prepare(`
      SELECT DISTINCT u.id, u.username FROM users u
      WHERE u.id NOT IN (
        SELECT DISTINCT user_id FROM quiz_attempts
        WHERE attempted_at > datetime('now', '-24 hours')
        AND user_id IS NOT NULL
      )
      AND u.id IN (SELECT DISTINCT user_id FROM push_subscriptions)
    `).all();

    if (users.length === 0) {
      console.log('Study reminders: No users need reminding.');
      return;
    }

    console.log(`Study reminders: Sending to ${users.length} user(s)...`);

    const payload = JSON.stringify({
      body: "You haven't studied in 24 hours! A quick 5-minute session keeps knowledge fresh.",
      data: { url: '/' }
    });

    for (const user of users) {
      const subscriptions = db.prepare(
        'SELECT id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE user_id = ?'
      ).all(user.id);

      for (const sub of subscriptions) {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys_p256dh,
            auth: sub.keys_auth
          }
        };

        try {
          await webpush.sendNotification(pushSubscription, payload);
          console.log(`Study reminder sent to ${user.username} (sub ${sub.id})`);
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription expired or invalid - remove it
            console.log(`Removing expired subscription ${sub.id} for ${user.username}`);
            db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
          } else {
            console.error(`Failed to send push to ${user.username} (sub ${sub.id}):`, err.message);
          }
        }
      }
    }

    console.log('Study reminders: Done.');
  } catch (err) {
    console.error('sendStudyReminders error:', err);
  }
}

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`🏥 RadCase server running at http://localhost:${PORT}`);
  });
  setupWebSocket(server);

  // Schedule study reminder push notifications every 6 hours
  setInterval(sendStudyReminders, 6 * 60 * 60 * 1000);
  // Run once on startup after a 60-second delay
  setTimeout(sendStudyReminders, 60 * 1000);
}

// Export app for testing
module.exports = app;
