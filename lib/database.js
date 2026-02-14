/**
 * Database Abstraction Layer for RadCase
 * Supports SQLite (current) and PostgreSQL (migration target)
 * Provides unified interface for zero-downtime migration
 */

const path = require('path');

class DatabaseAdapter {
  constructor(options = {}) {
    this.type = options.type || process.env.DB_TYPE || 'sqlite';
    this.db = null;
    this.pool = null;
  }

  async initialize() {
    if (this.type === 'postgresql' || this.type === 'postgres') {
      return this.initPostgreSQL();
    }
    return this.initSQLite();
  }

  initSQLite() {
    const Database = require('better-sqlite3');
    const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'radcase.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');
    console.log('✅ SQLite database initialized (WAL mode, 64MB cache)');
    return this;
  }

  async initPostgreSQL() {
    try {
      const { Pool } = require('pg');
      this.pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'radcase',
        user: process.env.DB_USER || 'radcase',
        password: process.env.DB_PASSWORD,
        max: parseInt(process.env.DB_POOL_MAX) || 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
      await this.pool.query('SELECT 1');
      this.type = 'postgresql';
      console.log('✅ PostgreSQL database connected');
    } catch (e) {
      console.warn('⚠️  PostgreSQL not available, falling back to SQLite');
      this.type = 'sqlite';
      this.initSQLite();
    }
    return this;
  }

  // Unified query interface
  all(sql, params = []) {
    if (this.type === 'sqlite') {
      return this.db.prepare(sql).all(...(Array.isArray(params) ? params : [params]));
    }
    // PostgreSQL - convert ? to $1, $2, etc.
    return this.pool.query(this.convertPlaceholders(sql), params)
      .then(res => res.rows);
  }

  get(sql, params = []) {
    if (this.type === 'sqlite') {
      return this.db.prepare(sql).get(...(Array.isArray(params) ? params : [params]));
    }
    return this.pool.query(this.convertPlaceholders(sql), params)
      .then(res => res.rows[0] || null);
  }

  run(sql, params = []) {
    if (this.type === 'sqlite') {
      return this.db.prepare(sql).run(...(Array.isArray(params) ? params : [params]));
    }
    return this.pool.query(this.convertPlaceholders(sql), params)
      .then(res => ({ changes: res.rowCount }));
  }

  // For direct access to underlying db (migration period)
  getRawDB() {
    return this.db || this.pool;
  }

  convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  close() {
    if (this.db) this.db.close();
    if (this.pool) this.pool.end();
  }
}

// Singleton
let _db = null;
function getDatabase(options) {
  if (!_db) {
    _db = new DatabaseAdapter(options);
    _db.initialize();
  }
  return _db;
}

module.exports = { DatabaseAdapter, getDatabase };
