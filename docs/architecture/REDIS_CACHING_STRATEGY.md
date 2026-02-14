# Redis Caching Strategy Design

**Priority:** P1 (Complete by Feb 15)  
**Author:** Architecture & Performance Lead  
**Focus:** Session management, metadata caching, and performance acceleration

---

## Caching Strategy Overview

### Current State: No Caching
- Database queries executed on every request
- DICOM metadata parsed on-demand
- File system accessed directly for thumbnails
- Session data stored in JWT tokens only
- Repeated calculations for window/level settings

**Impact:** High database load, slow response times, poor scalability

### Target State: Multi-Layer Caching
- Redis for hot data and session management
- Application-level caching for computed results
- Browser caching for static assets
- CDN caching for DICOM files (future)

---

## Redis Architecture Design

### Caching Layers

#### Layer 1: Session & Authentication Cache
**Purpose:** Fast authentication + user session management  
**TTL:** 24 hours (configurable)  
**Data Volume:** ~1KB per active user

```
Key Pattern: session:{user_id}
Value: {
  userId: "uuid",
  username: "string",
  role: "resident|attending|admin",
  institutionId: "uuid",
  lastActivity: timestamp,
  preferences: { ... }
}
```

#### Layer 2: DICOM Metadata Cache
**Purpose:** Fast case and series metadata retrieval  
**TTL:** 1 hour (metadata rarely changes)  
**Data Volume:** ~5-50KB per case

```
Key Pattern: dicom:case:{case_id}
Value: {
  caseInfo: { title, modality, difficulty, ... },
  seriesList: [
    {
      id: "uuid",
      seriesUid: "string", 
      imageCount: number,
      windowCenter: number,
      windowWidth: number,
      fileList: ["file1.dcm", "file2.dcm", ...]
    }
  ]
}
```

#### Layer 3: Computed Results Cache
**Purpose:** Cache expensive calculations  
**TTL:** 6 hours (computation-heavy operations)  
**Data Volume:** ~1-10KB per computation

```
Key Patterns:
- thumbnails:{case_id}:{series_id} → base64 thumbnail
- window_levels:{series_uid} → { center: number, width: number }
- case_search:{query_hash} → [case_ids]
- user_progress:{user_id} → learning progress summary
```

#### Layer 4: API Response Cache
**Purpose:** Cache full API responses  
**TTL:** 5-15 minutes  
**Data Volume:** Variable

```
Key Patterns:
- api:cases:list:{filters_hash} → cases array
- api:user:{user_id}:progress → spaced repetition data
- api:analytics:{timeframe} → aggregated metrics
```

---

## Redis Configuration

### Redis Instance Setup

#### Production Configuration
```bash
# redis.conf optimizations for RadCase
maxmemory 2gb                    # Adjust based on available RAM
maxmemory-policy allkeys-lru     # Evict least recently used keys

# Persistence (for session data recovery)
save 900 1                       # Save if at least 1 key changed in 15min
save 300 10                      # Save if at least 10 keys changed in 5min
save 60 10000                    # Save if at least 10k keys changed in 1min

# Network optimizations
tcp-keepalive 300
timeout 0

# Memory optimizations
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
zset-max-ziplist-entries 128
```

#### Connection Pool Configuration
```javascript
// config/redis.js
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: 0,
  
  // Connection pool
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableOfflineQueue: false,
  
  // Performance tuning
  lazyConnect: true,
  maxLoadingTimeout: 2000,
  
  // Cluster support (if needed)
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err));

module.exports = redis;
```

---

## Caching Implementation

### Session Management with Redis

#### Enhanced Session Middleware
```javascript
// middleware/session-cache.js
const redis = require('../config/redis');

class SessionCache {
  constructor(ttl = 24 * 60 * 60) { // 24 hours default
    this.ttl = ttl;
  }
  
  async storeSession(userId, sessionData) {
    const key = `session:${userId}`;
    await redis.setex(key, this.ttl, JSON.stringify(sessionData));
  }
  
  async getSession(userId) {
    const key = `session:${userId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }
  
  async refreshSession(userId) {
    const key = `session:${userId}`;
    await redis.expire(key, this.ttl);
  }
  
  async invalidateSession(userId) {
    const key = `session:${userId}`;
    await redis.del(key);
  }
}

// Express middleware
async function sessionMiddleware(req, res, next) {
  const sessionCache = new SessionCache();
  
  if (req.user) {
    // Check Redis for session first
    const cachedSession = await sessionCache.getSession(req.user.id);
    
    if (cachedSession) {
      req.user = { ...req.user, ...cachedSession };
      // Refresh TTL on activity
      await sessionCache.refreshSession(req.user.id);
    } else {
      // Session not in cache, store it
      await sessionCache.storeSession(req.user.id, {
        lastActivity: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    }
  }
  
  next();
}
```

### DICOM Metadata Caching

#### Case & Series Metadata Cache
```javascript
// services/dicom-cache.js
class DicomCache {
  constructor(redis) {
    this.redis = redis;
    this.metadataTTL = 3600; // 1 hour
    this.thumbnailTTL = 86400; // 24 hours
  }
  
  async getCaseMetadata(caseId) {
    const key = `dicom:case:${caseId}`;
    const cached = await this.redis.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Not in cache, fetch from database
    const metadata = await this.fetchCaseMetadataFromDB(caseId);
    
    // Cache for future requests
    await this.redis.setex(key, this.metadataTTL, JSON.stringify(metadata));
    
    return metadata;
  }
  
  async cacheThumbnail(caseId, seriesId, thumbnailBase64) {
    const key = `thumbnails:${caseId}:${seriesId}`;
    await this.redis.setex(key, this.thumbnailTTL, thumbnailBase64);
  }
  
  async getThumbnail(caseId, seriesId) {
    const key = `thumbnails:${caseId}:${seriesId}`;
    return await this.redis.get(key);
  }
  
  async invalidateCaseCache(caseId) {
    const pattern = `dicom:case:${caseId}*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
  
  // Pre-warm cache for popular cases
  async prewarmPopularCases() {
    const popularCases = await this.getPopularCaseIds();
    
    for (const caseId of popularCases) {
      try {
        await this.getCaseMetadata(caseId);
        console.log(`Pre-warmed cache for case: ${caseId}`);
      } catch (error) {
        console.error(`Failed to pre-warm case ${caseId}:`, error);
      }
    }
  }
}
```

### API Response Caching

#### Smart Response Caching Middleware
```javascript
// middleware/response-cache.js
function createCacheMiddleware(options = {}) {
  const {
    ttl = 300, // 5 minutes default
    keyGenerator = (req) => `api:${req.path}:${JSON.stringify(req.query)}`,
    shouldCache = () => true,
    varyBy = []
  } = options;
  
  return async (req, res, next) => {
    if (req.method !== 'GET' || !shouldCache(req)) {
      return next();
    }
    
    const cacheKey = keyGenerator(req);
    
    try {
      // Check cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        res.set('X-Cache', 'HIT');
        return res.json(data);
      }
      
      // Cache miss - intercept response
      const originalSend = res.json;
      res.json = function(data) {
        // Cache successful responses
        if (res.statusCode === 200) {
          redis.setex(cacheKey, ttl, JSON.stringify(data)).catch(console.error);
          res.set('X-Cache', 'MISS');
        }
        
        originalSend.call(this, data);
      };
      
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next(); // Fail gracefully
    }
  };
}

// Usage examples
app.get('/api/cases', 
  createCacheMiddleware({ ttl: 600 }), // 10 minutes
  getCasesHandler
);

app.get('/api/dicom/:caseId',
  createCacheMiddleware({ 
    ttl: 3600,
    keyGenerator: (req) => `api:dicom:${req.params.caseId}`
  }),
  getDicomSeriesHandler
);
```

### Cache Invalidation Strategy

#### Smart Cache Invalidation
```javascript
// services/cache-invalidation.js
class CacheInvalidation {
  constructor(redis) {
    this.redis = redis;
  }
  
  async invalidateCase(caseId) {
    const patterns = [
      `dicom:case:${caseId}*`,
      `api:dicom:${caseId}*`,
      `thumbnails:${caseId}:*`,
      'api:cases:*' // Invalidate case lists
    ];
    
    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
  
  async invalidateUser(userId) {
    const patterns = [
      `session:${userId}`,
      `user_progress:${userId}*`,
      `api:user:${userId}:*`
    ];
    
    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
  
  async invalidateByTag(tag) {
    // Invalidate all cache entries with a specific tag
    const pattern = `*:tag:${tag}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
  
  // Automatic cleanup of expired keys
  async scheduleCleanup() {
    setInterval(async () => {
      // Remove keys that match certain patterns and are near expiry
      const patterns = ['session:*', 'api:*'];
      
      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        for (const key of keys) {
          const ttl = await this.redis.ttl(key);
          if (ttl > 0 && ttl < 60) { // Less than 1 minute left
            await this.redis.del(key);
          }
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }
}
```

---

## Performance Monitoring

### Cache Performance Metrics

#### Redis Monitoring Dashboard
```javascript
// services/cache-metrics.js
class CacheMetrics {
  constructor(redis) {
    this.redis = redis;
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      avgResponseTime: 0
    };
  }
  
  async collectMetrics() {
    const info = await this.redis.info('stats');
    const lines = info.split('\r\n');
    
    const stats = {};
    lines.forEach(line => {
      const [key, value] = line.split(':');
      if (key && value) {
        stats[key] = value;
      }
    });
    
    return {
      keyspace_hits: parseInt(stats.keyspace_hits) || 0,
      keyspace_misses: parseInt(stats.keyspace_misses) || 0,
      used_memory: stats.used_memory,
      connected_clients: parseInt(stats.connected_clients) || 0,
      total_commands_processed: parseInt(stats.total_commands_processed) || 0,
      hit_rate: this.calculateHitRate(stats)
    };
  }
  
  calculateHitRate(stats) {
    const hits = parseInt(stats.keyspace_hits) || 0;
    const misses = parseInt(stats.keyspace_misses) || 0;
    const total = hits + misses;
    
    return total > 0 ? (hits / total) * 100 : 0;
  }
  
  // Performance benchmark
  async benchmarkCachePerformance() {
    const iterations = 1000;
    const testKey = 'benchmark:test';
    const testValue = 'test_value';
    
    // Set performance
    const setStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      await this.redis.set(`${testKey}:${i}`, testValue);
    }
    const setTime = Date.now() - setStart;
    
    // Get performance
    const getStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      await this.redis.get(`${testKey}:${i}`);
    }
    const getTime = Date.now() - getStart;
    
    // Cleanup
    const keys = await this.redis.keys(`${testKey}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    
    return {
      setOpsPerSecond: iterations / (setTime / 1000),
      getOpsPerSecond: iterations / (getTime / 1000),
      avgSetTime: setTime / iterations,
      avgGetTime: getTime / iterations
    };
  }
}
```

### Cache Health Monitoring
```javascript
// Monitor cache health and automatically fix issues
class CacheHealthMonitor {
  constructor(redis) {
    this.redis = redis;
    this.healthChecks = [];
  }
  
  async checkHealth() {
    const issues = [];
    
    // Check hit rate
    const metrics = await new CacheMetrics(this.redis).collectMetrics();
    if (metrics.hit_rate < 70) {
      issues.push(`Low hit rate: ${metrics.hit_rate.toFixed(1)}%`);
    }
    
    // Check memory usage
    const memoryInfo = await this.redis.info('memory');
    const usedMemoryMb = parseInt(memoryInfo.match(/used_memory:(\d+)/)?.[1] || 0) / (1024 * 1024);
    if (usedMemoryMb > 1500) { // Alert if using >1.5GB
      issues.push(`High memory usage: ${usedMemoryMb.toFixed(1)}MB`);
    }
    
    // Check connection count
    if (metrics.connected_clients > 50) {
      issues.push(`High connection count: ${metrics.connected_clients}`);
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      metrics
    };
  }
  
  async startHealthMonitoring() {
    setInterval(async () => {
      const health = await this.checkHealth();
      if (!health.healthy) {
        console.warn('Cache health issues detected:', health.issues);
        // Could trigger alerts or auto-remediation here
      }
    }, 60 * 1000); // Every minute
  }
}
```

---

## Implementation Timeline

### Sprint 1 Implementation Plan

#### Day 1: Redis Setup & Basic Session Caching
- [ ] Redis instance configuration
- [ ] Session middleware implementation
- [ ] Basic session caching

#### Day 2: DICOM Metadata Caching
- [ ] Case metadata caching service
- [ ] Thumbnail caching implementation
- [ ] Cache invalidation for case updates

#### Day 3: API Response Caching
- [ ] Response caching middleware
- [ ] Cache key generation strategies
- [ ] Performance testing

#### Day 4: Monitoring & Optimization
- [ ] Cache metrics collection
- [ ] Health monitoring setup
- [ ] Performance benchmarking

#### Day 5: Integration Testing & Documentation
- [ ] End-to-end cache testing
- [ ] Performance validation
- [ ] Documentation completion

### Performance Targets

| Metric | Current | Target | Improvement |
|--------|---------|---------|-------------|
| Session lookup | 50ms (DB) | 5ms (Redis) | 10x faster |
| Case metadata | 100ms (DB+compute) | 10ms (cache) | 10x faster |
| API response time | 200-500ms | 50-100ms | 3-5x faster |
| Cache hit rate | 0% | 85%+ | ∞ improvement |
| Database load | 100% | 30-40% | 60-70% reduction |

---

## Risk Mitigation

### Cache Failure Scenarios
1. **Redis downtime:** Graceful fallback to database
2. **Cache corruption:** Automatic cache invalidation
3. **Memory pressure:** LRU eviction policy
4. **Network latency:** Connection pooling + retry logic

### Monitoring & Alerting
- Redis memory usage > 80%
- Cache hit rate < 70%
- Connection failures > 1%
- Response time degradation > 50%

---

**Status:** ✅ Redis caching strategy designed  
**Next:** Cloud storage planning  
**Dependencies:** Redis instance provisioning, environment setup