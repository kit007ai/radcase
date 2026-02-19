/**
 * Performance Monitoring for RadCase
 * Tracks request metrics, response times, cache performance, memory/disk usage
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PerformanceMonitor {
  constructor() {
    this.startTime = Date.now();
    this.requests = {
      total: 0,
      byStatus: {},
      byEndpoint: {},
      errors: 0,
    };
    this.responseTimes = [];
    this.maxResponseTimeHistory = 1000; // Keep last 1000 measurements
    this.cacheRef = null;
    this.dataDirs = null; // Set via setDataDirs()
  }

  setCacheRef(cache) {
    this.cacheRef = cache;
  }

  setDataDirs(dirs) {
    this.dataDirs = dirs; // { uploads, thumbnails, dicom, db }
  }

  // Get disk usage for data directories
  getDiskUsage() {
    if (!this.dataDirs) return null;

    const dirSize = (dir) => {
      try {
        let total = 0;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            total += dirSize(full);
          } else {
            try { total += fs.statSync(full).size; } catch (_) {}
          }
        }
        return total;
      } catch (_) { return 0; }
    };

    const toMB = (bytes) => Math.round(bytes / 1024 / 1024 * 100) / 100;

    const uploadBytes = dirSize(this.dataDirs.uploads);
    const thumbBytes = dirSize(this.dataDirs.thumbnails);
    const dicomBytes = dirSize(this.dataDirs.dicom);
    let dbBytes = 0;
    try {
      dbBytes = fs.statSync(this.dataDirs.db).size;
      // Include WAL file
      try { dbBytes += fs.statSync(this.dataDirs.db + '-wal').size; } catch (_) {}
    } catch (_) {}

    const totalDataBytes = uploadBytes + thumbBytes + dicomBytes + dbBytes;

    // Get filesystem free space
    let freeBytes = 0, totalBytes = 0;
    try {
      const output = execSync(`df -B1 --output=avail,size "${this.dataDirs.uploads}" 2>/dev/null | tail -1`, { encoding: 'utf8' });
      const parts = output.trim().split(/\s+/);
      freeBytes = parseInt(parts[0]) || 0;
      totalBytes = parseInt(parts[1]) || 0;
    } catch (_) {}

    return {
      uploadsMB: toMB(uploadBytes),
      thumbnailsMB: toMB(thumbBytes),
      dicomMB: toMB(dicomBytes),
      databaseMB: toMB(dbBytes),
      totalDataMB: toMB(totalDataBytes),
      diskFreeMB: toMB(freeBytes),
      diskTotalMB: toMB(totalBytes),
      diskUsedPercent: totalBytes > 0 ? Math.round((1 - freeBytes / totalBytes) * 100) : 0,
    };
  }

  // Express middleware to track requests
  middleware() {
    return (req, res, next) => {
      const start = process.hrtime.bigint();

      // Set response time header before response is sent
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Number(process.hrtime.bigint() - start) / 1e6;
        if (!res.headersSent) {
          res.setHeader('X-Response-Time', `${duration.toFixed(1)}ms`);
        }
        return originalEnd.apply(this, args);
      };

      res.on('finish', () => {
        const duration = Number(process.hrtime.bigint() - start) / 1e6; // ms

        this.requests.total++;
        
        // Track by status code
        const status = res.statusCode;
        this.requests.byStatus[status] = (this.requests.byStatus[status] || 0) + 1;
        if (status >= 500) this.requests.errors++;

        // Track by endpoint (normalize path params)
        const endpoint = `${req.method} ${this.normalizePath(req.route?.path || req.path)}`;
        if (!this.requests.byEndpoint[endpoint]) {
          this.requests.byEndpoint[endpoint] = { count: 0, totalMs: 0, maxMs: 0 };
        }
        const ep = this.requests.byEndpoint[endpoint];
        ep.count++;
        ep.totalMs += duration;
        if (duration > ep.maxMs) ep.maxMs = duration;

        // Track response times
        this.responseTimes.push(duration);
        if (this.responseTimes.length > this.maxResponseTimeHistory) {
          this.responseTimes.shift();
        }

        // Header already set in res.end override above
      });

      next();
    };
  }

  normalizePath(p) {
    // Replace UUIDs and IDs with :id
    return p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
            .replace(/\/\d+/g, '/:num');
  }

  getMetrics() {
    const uptime = (Date.now() - this.startTime) / 1000;
    const mem = process.memoryUsage();
    const times = this.responseTimes;

    // Calculate percentiles
    const sorted = [...times].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

    const metrics = {
      server: {
        uptimeSeconds: Math.round(uptime),
        uptimeHuman: this.formatUptime(uptime),
        nodeVersion: process.version,
        pid: process.pid,
      },
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        externalMB: Math.round((mem.external || 0) / 1024 / 1024),
      },
      requests: {
        total: this.requests.total,
        errors: this.requests.errors,
        errorRate: this.requests.total > 0 
          ? ((this.requests.errors / this.requests.total) * 100).toFixed(2) + '%' 
          : '0%',
        requestsPerSecond: uptime > 0 ? (this.requests.total / uptime).toFixed(2) : '0',
        byStatus: this.requests.byStatus,
      },
      responseTimes: {
        avgMs: Math.round(avg * 10) / 10,
        p50Ms: Math.round(p50 * 10) / 10,
        p95Ms: Math.round(p95 * 10) / 10,
        p99Ms: Math.round(p99 * 10) / 10,
        sampleCount: times.length,
      },
      topEndpoints: this.getTopEndpoints(10),
    };

    // Add cache stats if available
    if (this.cacheRef) {
      metrics.cache = this.cacheRef.getStats();
    }

    // Add disk usage
    const disk = this.getDiskUsage();
    if (disk) {
      metrics.disk = disk;
    }

    return metrics;
  }

  getTopEndpoints(limit = 10) {
    return Object.entries(this.requests.byEndpoint)
      .map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        avgMs: Math.round((stats.totalMs / stats.count) * 10) / 10,
        maxMs: Math.round(stats.maxMs * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getHealth() {
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / 1024 / 1024;
    const errorRate = this.requests.total > 0
      ? (this.requests.errors / this.requests.total) * 100
      : 0;

    // Use absolute heap threshold (256MB) instead of percentage,
    // since small heaps will always show high percentage due to lazy GC
    const heapWarning = heapUsedMB > 256;
    const issues = [];
    if (heapWarning) issues.push('High heap usage: ' + Math.round(heapUsedMB) + 'MB');
    if (errorRate > 5) issues.push('High error rate: ' + errorRate.toFixed(1) + '%');

    // Check disk space
    const disk = this.getDiskUsage();
    const diskWarning = disk && disk.diskUsedPercent > 90;
    const diskCritical = disk && disk.diskUsedPercent > 95;
    if (diskCritical) issues.push('Critical disk space: ' + disk.diskUsedPercent + '% used (' + disk.diskFreeMB + ' MB free)');
    else if (diskWarning) issues.push('Low disk space: ' + disk.diskUsedPercent + '% used (' + disk.diskFreeMB + ' MB free)');

    return {
      status: issues.length === 0 ? 'healthy' : (diskCritical ? 'critical' : 'degraded'),
      issues,
      checks: {
        memory: heapWarning ? 'warning' : 'ok',
        errorRate: errorRate < 5 ? 'ok' : 'warning',
        disk: diskCritical ? 'critical' : (diskWarning ? 'warning' : 'ok'),
      },
      timestamp: new Date().toISOString(),
    };
  }

  formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  }
}

// Singleton
let _monitor = null;
function getMonitor() {
  if (!_monitor) _monitor = new PerformanceMonitor();
  return _monitor;
}

module.exports = { PerformanceMonitor, getMonitor };
