// RadCase Production Metrics Collection
// Comprehensive monitoring for Prometheus integration

const promClient = require('prom-client');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Create a Registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics for RadCase

// HTTP request metrics
const httpRequestsTotal = new promClient.Counter({
  name: 'radcase_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const httpRequestDuration = new promClient.Histogram({
  name: 'radcase_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

// Database metrics
const databaseQueryDuration = new promClient.Histogram({
  name: 'radcase_database_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['query_type', 'table'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register]
});

const databaseConnectionsActive = new promClient.Gauge({
  name: 'radcase_database_connections_active',
  help: 'Number of active database connections',
  registers: [register]
});

const databaseQueryErrors = new promClient.Counter({
  name: 'radcase_database_query_errors_total',
  help: 'Total number of database query errors',
  labelNames: ['error_type'],
  registers: [register]
});

// Business metrics
const activeSessions = new promClient.Gauge({
  name: 'radcase_active_sessions',
  help: 'Number of active user sessions',
  registers: [register]
});

const activeUsers = new promClient.Gauge({
  name: 'radcase_active_users',
  help: 'Number of active users',
  registers: [register]
});

const casesTotal = new promClient.Gauge({
  name: 'radcase_cases_total',
  help: 'Total number of cases in the database',
  registers: [register]
});

const usersTotal = new promClient.Gauge({
  name: 'radcase_users_total',
  help: 'Total number of registered users',
  registers: [register]
});

const userLogins = new promClient.Counter({
  name: 'radcase_user_logins_total',
  help: 'Total number of user logins',
  labelNames: ['success'],
  registers: [register]
});

const failedLogins = new promClient.Counter({
  name: 'radcase_failed_logins_total',
  help: 'Total number of failed login attempts',
  labelNames: ['reason'],
  registers: [register]
});

const quizAttempts = new promClient.Counter({
  name: 'radcase_quiz_attempts_total',
  help: 'Total number of quiz attempts',
  labelNames: ['correct'],
  registers: [register]
});

const casesViewed = new promClient.Counter({
  name: 'radcase_cases_viewed_total',
  help: 'Total number of case views',
  labelNames: ['modality', 'body_part'],
  registers: [register]
});

// DICOM processing metrics
const dicomProcessingDuration = new promClient.Histogram({
  name: 'radcase_dicom_processing_duration_seconds',
  help: 'DICOM file processing duration in seconds',
  labelNames: ['operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register]
});

const dicomFilesProcessed = new promClient.Counter({
  name: 'radcase_dicom_files_processed_total',
  help: 'Total number of DICOM files processed',
  labelNames: ['status'],
  registers: [register]
});

const dicomStorageUsed = new promClient.Gauge({
  name: 'radcase_dicom_storage_bytes',
  help: 'DICOM storage usage in bytes',
  registers: [register]
});

// File storage metrics
const storageUsed = new promClient.Gauge({
  name: 'radcase_storage_used_bytes',
  help: 'Storage usage in bytes',
  labelNames: ['type'],
  registers: [register]
});

const fileUploads = new promClient.Counter({
  name: 'radcase_file_uploads_total',
  help: 'Total number of file uploads',
  labelNames: ['type', 'status'],
  registers: [register]
});

// Security metrics
const securityEvents = new promClient.Counter({
  name: 'radcase_security_events_total',
  help: 'Total number of security events',
  labelNames: ['event_type', 'severity'],
  registers: [register]
});

const rateLimitHits = new promClient.Counter({
  name: 'radcase_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint', 'ip'],
  registers: [register]
});

// Cache metrics (for Redis)
const cacheHits = new promClient.Counter({
  name: 'radcase_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register]
});

const cacheMisses = new promClient.Counter({
  name: 'radcase_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register]
});

// Error metrics
const errorCount = new promClient.Counter({
  name: 'radcase_errors_total',
  help: 'Total number of application errors',
  labelNames: ['error_type', 'severity'],
  registers: [register]
});

// Performance metrics
const memoryUsage = new promClient.Gauge({
  name: 'radcase_memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['type'],
  registers: [register]
});

const cpuUsage = new promClient.Gauge({
  name: 'radcase_cpu_usage_percent',
  help: 'CPU usage percentage',
  registers: [register]
});

// Middleware to collect HTTP metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  // Increment request counter
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    // Record metrics
    httpRequestsTotal.inc({
      method: req.method,
      route: route,
      status: res.statusCode
    });
    
    httpRequestDuration.observe({
      method: req.method,
      route: route,
      status: res.statusCode
    }, duration);
    
    originalEnd.apply(this, args);
  };
  
  next();
};

// Database metrics collection wrapper
const wrapDatabaseQuery = (db, queryType, tableName) => {
  return (query, params) => {
    const start = Date.now();
    
    try {
      const result = db.prepare(query).all(params);
      const duration = (Date.now() - start) / 1000;
      
      databaseQueryDuration.observe({
        query_type: queryType,
        table: tableName
      }, duration);
      
      return result;
    } catch (error) {
      databaseQueryErrors.inc({
        error_type: error.name || 'Unknown'
      });
      throw error;
    }
  };
};

// Business metrics collection functions
const updateBusinessMetrics = (db) => {
  try {
    // Update total counts
    const casesCount = db.prepare('SELECT COUNT(*) as count FROM cases').get();
    casesTotal.set(casesCount.count);
    
    const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    usersTotal.set(usersCount.count);
    
    // Update active sessions (last 30 minutes)
    const activeSessionsCount = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM quiz_attempts 
      WHERE attempted_at > datetime('now', '-30 minutes')
    `).get();
    activeSessions.set(activeSessionsCount.count || 0);
    
    // Active users (last 24 hours)
    const activeUsersCount = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM quiz_attempts 
      WHERE attempted_at > datetime('now', '-24 hours')
    `).get();
    activeUsers.set(activeUsersCount.count || 0);
    
  } catch (error) {
    console.error('Error updating business metrics:', error);
  }
};

// Storage metrics collection
const updateStorageMetrics = () => {
  try {
    const directories = ['uploads', 'thumbnails', 'dicom'];
    
    directories.forEach(dir => {
      const dirPath = path.join(__dirname, dir);
      if (fs.existsSync(dirPath)) {
        const size = getDirSize(dirPath);
        storageUsed.set({ type: dir }, size);
      }
    });
  } catch (error) {
    console.error('Error updating storage metrics:', error);
  }
};

// Helper function to calculate directory size
const getDirSize = (dirPath) => {
  let size = 0;
  
  try {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        size += stats.size;
      } else if (stats.isDirectory()) {
        size += getDirSize(filePath);
      }
    });
  } catch (error) {
    console.error(`Error calculating size for ${dirPath}:`, error);
  }
  
  return size;
};

// System metrics collection
const updateSystemMetrics = () => {
  try {
    const usage = process.memoryUsage();
    
    memoryUsage.set({ type: 'rss' }, usage.rss);
    memoryUsage.set({ type: 'heapUsed' }, usage.heapUsed);
    memoryUsage.set({ type: 'heapTotal' }, usage.heapTotal);
    memoryUsage.set({ type: 'external' }, usage.external);
    
    // CPU usage (simplified - in production, use proper CPU monitoring)
    const cpuUsageValue = process.cpuUsage();
    const cpuPercent = ((cpuUsageValue.user + cpuUsageValue.system) / 1000000) * 100;
    cpuUsage.set(cpuPercent);
    
  } catch (error) {
    console.error('Error updating system metrics:', error);
  }
};

// Start periodic metrics collection
const startMetricsCollection = (db) => {
  // Update business metrics every 30 seconds
  setInterval(() => {
    updateBusinessMetrics(db);
  }, 30000);
  
  // Update storage metrics every 5 minutes
  setInterval(() => {
    updateStorageMetrics();
  }, 300000);
  
  // Update system metrics every 15 seconds
  setInterval(() => {
    updateSystemMetrics();
  }, 15000);
  
  console.log('📊 Metrics collection started');
};

// Health check function
const getHealthStatus = (db) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
    uptime: process.uptime(),
    checks: {}
  };
  
  try {
    // Database check
    const dbCheck = db.prepare('SELECT 1').get();
    health.checks.database = dbCheck ? 'healthy' : 'unhealthy';
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'unhealthy';
  }
  
  try {
    // File system checks
    const directories = ['uploads', 'thumbnails', 'dicom'];
    health.checks.filesystem = {};
    
    directories.forEach(dir => {
      const dirPath = path.join(__dirname, dir);
      health.checks.filesystem[dir] = fs.existsSync(dirPath) ? 'healthy' : 'missing';
    });
  } catch (error) {
    health.checks.filesystem = 'error';
    health.status = 'degraded';
  }
  
  // Memory check
  const memUsage = process.memoryUsage();
  const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  health.checks.memory = {
    status: memUsagePercent > 90 ? 'high' : 'normal',
    heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024)
  };
  
  return health;
};

module.exports = {
  register,
  metricsMiddleware,
  wrapDatabaseQuery,
  startMetricsCollection,
  getHealthStatus,
  
  // Individual metrics for manual instrumentation
  httpRequestsTotal,
  httpRequestDuration,
  databaseQueryDuration,
  userLogins,
  failedLogins,
  quizAttempts,
  casesViewed,
  dicomProcessingDuration,
  dicomFilesProcessed,
  fileUploads,
  securityEvents,
  rateLimitHits,
  cacheHits,
  cacheMisses,
  errorCount
};