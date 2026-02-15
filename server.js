// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');
const webpush = require('web-push');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3457;

// ============ JWT Secret ============
const JWT_SECRET = require('./lib/jwt-secret');

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

// AI Configuration table
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Active sessions table
db.exec(`
  CREATE TABLE IF NOT EXISTS active_sessions (
    user_id TEXT PRIMARY KEY,
    session_state TEXT NOT NULL,
    device_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Bookmarks table
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

// ============ PERFORMANCE MIDDLEWARE ============
const compression = require('compression');
const { getCache, CacheInvalidator } = require('./lib/cache');
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

// ============ Auth Middleware ============
const { authMiddleware } = require('./middleware/auth');
app.use(authMiddleware);

// ============ SECURE STATIC FILE SERVING ============
const { createSecureStatic, webpNegotiation } = require('./middleware/security');

// Serve from dist/ in production (Vite build output), public/ in development
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const STATIC_DIR = IS_PRODUCTION
  ? path.join(__dirname, 'dist')
  : path.join(__dirname, 'public');

app.use('/uploads', createSecureStatic(UPLOAD_DIR, '/uploads'));
app.use('/thumbnails', webpNegotiation(THUMB_DIR));
app.use('/thumbnails', createSecureStatic(THUMB_DIR, '/thumbnails'));
app.use('/dicom', createSecureStatic(DICOM_DIR, '/dicom'));
app.use(express.static(STATIC_DIR, {
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
    // Vite hashed assets get long-term caching (hash changes on content change)
    else if (IS_PRODUCTION && /\-[a-f0-9]{8,}\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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

// ============ Mount Route Modules ============

// Health check (top-level, no prefix)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes: /api/auth/*
const authRoutes = require('./routes/auth')(db);
app.use('/api/auth', authRoutes);

// Cases routes: /api/cases/*
const casesRoutes = require('./routes/cases')(db, cache, cacheInvalidator);
app.use('/api/cases', casesRoutes);

// DICOM routes: /api/dicom/*
const dicomRoutes = require('./routes/dicom')(db, cache);
app.use('/api/dicom', dicomRoutes);

// Quiz routes: /api/quiz/* and /api/review/* and /api/progress (GET)
const quizRoutes = require('./routes/quiz')(db);
app.use('/api/quiz', quizRoutes);
// The review/due endpoint was originally at /api/review/due, now at /api/quiz/review/due
// Mount it at the original path too for backwards compatibility
app.get('/api/review/due', (req, res, next) => {
  req.url = '/review/due' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
  quizRoutes(req, res, next);
});
// Progress GET was originally at /api/progress
app.get('/api/progress', (req, res, next) => {
  req.url = '/progress' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
  quizRoutes(req, res, next);
});

// Sync routes: /api/* (push, annotations, progress POST, session, bookmarks, sync)
const syncRoutes = require('./routes/sync')(db, VAPID_PUBLIC_KEY);
app.use('/api', syncRoutes);

// Admin routes: /api/admin/*
const adminRoutes = require('./routes/admin')(db, monitor);
app.use('/api/admin', adminRoutes);

// Public data endpoints (available without /admin prefix)
app.get('/api/filters', (req, res) => {
  const modalities = db.prepare('SELECT DISTINCT modality FROM cases WHERE modality IS NOT NULL ORDER BY modality').all();
  const bodyParts = db.prepare('SELECT DISTINCT body_part FROM cases WHERE body_part IS NOT NULL ORDER BY body_part').all();
  res.json({
    modalities: modalities.map(m => m.modality),
    bodyParts: bodyParts.map(b => b.body_part),
    difficulties: [1, 2, 3, 4, 5],
  });
});

app.get('/api/analytics', (req, res) => {
  const caseCount = db.prepare('SELECT COUNT(*) as count FROM cases').get();
  const imageCount = db.prepare('SELECT COUNT(*) as count FROM images').get();
  const byModality = db.prepare('SELECT modality, COUNT(*) as count FROM cases WHERE modality IS NOT NULL GROUP BY modality ORDER BY count DESC').all();
  const byBodyPart = db.prepare('SELECT body_part, COUNT(*) as count FROM cases WHERE body_part IS NOT NULL GROUP BY body_part ORDER BY count DESC').all();
  res.json({ counts: { cases: caseCount.count, images: imageCount.count }, byModality, byBodyPart });
});

app.get('/api/tags', (req, res) => {
  const tags = db.prepare('SELECT t.name, COUNT(ct.case_id) as count FROM tags t LEFT JOIN case_tags ct ON t.id = ct.tag_id GROUP BY t.id ORDER BY count DESC').all();
  res.json(tags);
});

// Serve beta signup page
app.get('/beta', (req, res) => {
  res.sendFile(path.join(__dirname, 'beta-signup.html'));
});

// Serve interview scheduling page
app.get('/interview', (req, res) => {
  res.sendFile(path.join(__dirname, 'interview-scheduling.html'));
});

// Serve frontend for any non-API route (SPA fallback)
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// ============ Error Handler ============
const { errorHandler } = require('./middleware/error');
app.use(errorHandler);

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
