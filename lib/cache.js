/**
 * Multi-Layer Cache System for RadCase
 * Layer 1: In-memory LRU cache (always available)
 * Layer 2: Redis (when available, graceful fallback)
 */

const { LRUCache } = require('lru-cache');

// ============ IN-MEMORY LRU CACHE ============
class MemoryCache {
  constructor(options = {}) {
    this.cache = new LRUCache({
      max: options.max || 500,
      maxSize: options.maxSize || 50 * 1024 * 1024, // 50MB default
      sizeCalculation: (value) => {
        if (typeof value === 'string') return value.length;
        if (Buffer.isBuffer(value)) return value.length;
        return JSON.stringify(value).length;
      },
      ttl: options.ttl || 1000 * 60 * 60, // 1 hour default
    });
    this.stats = { hits: 0, misses: 0, sets: 0 };
  }

  async get(key) {
    const val = this.cache.get(key);
    if (val !== undefined) {
      this.stats.hits++;
      return val;
    }
    this.stats.misses++;
    return null;
  }

  async set(key, value, ttlMs) {
    this.stats.sets++;
    this.cache.set(key, value, ttlMs ? { ttl: ttlMs } : undefined);
  }

  async del(key) {
    this.cache.delete(key);
  }

  async delPattern(pattern) {
    // Simple pattern matching for in-memory cache
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : '0%',
      size: this.cache.size,
      calculatedSize: this.cache.calculatedSize,
    };
  }
}

// ============ REDIS CACHE ADAPTER ============
class RedisCache {
  constructor(options = {}) {
    this.connected = false;
    this.redis = null;
    this.stats = { hits: 0, misses: 0, sets: 0 };

    try {
      const Redis = require('ioredis');
      this.redis = new Redis({
        host: options.host || process.env.REDIS_HOST || 'localhost',
        port: options.port || process.env.REDIS_PORT || 6379,
        password: options.password || process.env.REDIS_PASSWORD,
        db: options.db || 0,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      this.redis.on('connect', () => {
        this.connected = true;
        console.log('✅ Redis cache connected');
      });
      this.redis.on('error', () => {
        this.connected = false;
      });
      this.redis.on('close', () => {
        this.connected = false;
      });

      // Try connecting
      this.redis.connect().catch(() => {
        console.log('ℹ️  Redis not available, using in-memory cache only');
        this.redis = null;
      });
    } catch (e) {
      console.log('ℹ️  Redis module not available, using in-memory cache only');
      this.redis = null;
    }
  }

  async get(key) {
    if (!this.connected || !this.redis) return null;
    try {
      const val = await this.redis.get(key);
      if (val !== null) {
        this.stats.hits++;
        return JSON.parse(val);
      }
      this.stats.misses++;
      return null;
    } catch {
      return null;
    }
  }

  async set(key, value, ttlMs) {
    if (!this.connected || !this.redis) return;
    try {
      this.stats.sets++;
      const ttlSec = Math.ceil((ttlMs || 3600000) / 1000);
      await this.redis.setex(key, ttlSec, JSON.stringify(value));
    } catch {
      // ignore
    }
  }

  async del(key) {
    if (!this.connected || !this.redis) return;
    try { await this.redis.del(key); } catch {}
  }

  async delPattern(pattern) {
    if (!this.connected || !this.redis) return;
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) await this.redis.del(...keys);
    } catch {}
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      connected: this.connected,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : '0%',
    };
  }
}

// ============ MULTI-LAYER CACHE ============
class MultiLayerCache {
  constructor(options = {}) {
    this.memory = new MemoryCache(options.memory || {});
    this.redis = new RedisCache(options.redis || {});
  }

  async get(key) {
    // Try memory first
    let val = await this.memory.get(key);
    if (val !== null) return val;

    // Try Redis
    val = await this.redis.get(key);
    if (val !== null) {
      // Promote to memory cache
      await this.memory.set(key, val);
      return val;
    }

    return null;
  }

  async set(key, value, ttlMs) {
    await Promise.all([
      this.memory.set(key, value, ttlMs),
      this.redis.set(key, value, ttlMs),
    ]);
  }

  async del(key) {
    await Promise.all([
      this.memory.del(key),
      this.redis.del(key),
    ]);
  }

  async delPattern(pattern) {
    await Promise.all([
      this.memory.delPattern(pattern),
      this.redis.delPattern(pattern),
    ]);
  }

  getStats() {
    return {
      memory: this.memory.getStats(),
      redis: this.redis.getStats(),
    };
  }
}

// ============ EXPRESS CACHE MIDDLEWARE ============
function cacheMiddleware(cache, options = {}) {
  const {
    ttl = 5 * 60 * 1000, // 5 minutes
    keyPrefix = 'api:',
    keyGenerator = null,
    condition = () => true,
  } = options;

  return async (req, res, next) => {
    if (req.method !== 'GET' || !condition(req)) {
      return next();
    }

    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : `${keyPrefix}${req.originalUrl}`;

    try {
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', cacheKey);
        return res.json(cached);
      }
    } catch {}

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(cacheKey, data, ttl).catch(() => {});
        res.set('X-Cache', 'MISS');
      }
      return originalJson(data);
    };

    next();
  };
}

// ============ CACHE INVALIDATION HELPERS ============
class CacheInvalidator {
  constructor(cache) {
    this.cache = cache;
  }

  async invalidateCase(caseId) {
    await Promise.all([
      this.cache.delPattern(`api:*/api/cases*`),
      this.cache.delPattern(`api:*/api/dicom/${caseId}*`),
      this.cache.del(`dicom:case:${caseId}`),
    ]);
  }

  async invalidateAllCases() {
    await this.cache.delPattern('api:*/api/cases*');
  }

  async invalidateUser(userId) {
    await this.cache.delPattern(`session:${userId}*`);
    await this.cache.delPattern(`api:*/api/user/${userId}*`);
  }
}

// ============ SINGLETON INSTANCE ============
let _instance = null;

function getCache(options) {
  if (!_instance) {
    _instance = new MultiLayerCache(options);
  }
  return _instance;
}

module.exports = {
  MemoryCache,
  RedisCache,
  MultiLayerCache,
  cacheMiddleware,
  CacheInvalidator,
  getCache,
};
