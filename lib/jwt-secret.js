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

module.exports = JWT_SECRET;
