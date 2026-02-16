// Simple in-memory rate limiter
// Tracks request counts per IP within a sliding window

function createRateLimiter({ maxRequests = 10, windowMs = 60 * 1000 } = {}) {
  const hits = new Map(); // ip -> [{ timestamp }]

  // Clean up expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of hits) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(ip);
      } else {
        hits.set(ip, valid);
      }
    }
  }, windowMs);

  return function rateLimit(req, res, next) {
    if (process.env.NODE_ENV === 'test') return next();
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!hits.has(ip)) {
      hits.set(ip, []);
    }

    const timestamps = hits.get(ip).filter(t => now - t < windowMs);
    timestamps.push(now);
    hits.set(ip, timestamps);

    if (timestamps.length > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.'
      });
    }

    next();
  };
}

module.exports = { createRateLimiter };
