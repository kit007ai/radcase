#!/usr/bin/env node
/**
 * SQLite → PostgreSQL Data Migration Script
 * Usage: DB_HOST=localhost DB_NAME=radcase DB_USER=radcase DB_PASSWORD=xxx node migrations/migrate-sqlite-to-pg.js
 */

const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

async function migrate() {
  const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'radcase.db');
  
  if (!fs.existsSync(sqlitePath)) {
    console.error('SQLite database not found:', sqlitePath);
    process.exit(1);
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pg = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'radcase',
    user: process.env.DB_USER || 'radcase',
    password: process.env.DB_PASSWORD,
  });

  console.log('🚀 Starting SQLite → PostgreSQL migration');

  try {
    // Run schema
    const schema = fs.readFileSync(path.join(__dirname, '001_postgresql_initial.sql'), 'utf8');
    await pg.query(schema);
    console.log('✅ Schema created');

    // Migrate tables
    const tables = ['cases', 'images', 'dicom_series', 'users', 'user_case_progress', 'quiz_attempts'];
    
    for (const table of tables) {
      try {
        const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
        if (rows.length === 0) {
          console.log(`  ⏭️  ${table}: empty, skipping`);
          continue;
        }

        const columns = Object.keys(rows[0]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const insertSQL = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

        let migrated = 0;
        for (const row of rows) {
          const values = columns.map(c => row[c]);
          await pg.query(insertSQL, values);
          migrated++;
        }
        console.log(`  ✅ ${table}: ${migrated} rows migrated`);
      } catch (e) {
        console.warn(`  ⚠️  ${table}: ${e.message}`);
      }
    }

    // Verify
    console.log('\n📊 Verification:');
    for (const table of tables) {
      try {
        const sqliteCount = sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
        const pgResult = await pg.query(`SELECT COUNT(*) as count FROM ${table}`);
        const pgCount = parseInt(pgResult.rows[0].count);
        const match = sqliteCount === pgCount ? '✅' : '⚠️';
        console.log(`  ${match} ${table}: SQLite=${sqliteCount} PostgreSQL=${pgCount}`);
      } catch (e) {
        console.log(`  ⏭️  ${table}: not in SQLite`);
      }
    }

    console.log('\n✅ Migration complete!');
  } catch (e) {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
  } finally {
    sqlite.close();
    await pg.end();
  }
}

if (require.main === module) {
  migrate().catch(console.error);
}

module.exports = { migrate };
