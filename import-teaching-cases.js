#!/usr/bin/env node
/**
 * Import Teaching Cases into RadCase
 * Run: node import-teaching-cases.js
 */

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'radcase.db'));

// Load teaching cases
const casesFile = path.join(__dirname, 'teaching-cases.json');
const data = JSON.parse(fs.readFileSync(casesFile, 'utf-8'));

console.log('📚 RadCase Teaching Case Importer');
console.log('==================================\n');
console.log(`Found ${data.cases.length} teaching cases to import\n`);

// Prepare statements
const insertCase = db.prepare(`
  INSERT INTO cases (id, title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
const linkTag = db.prepare('INSERT OR IGNORE INTO case_tags (case_id, tag_id) VALUES (?, ?)');
const checkExists = db.prepare('SELECT id FROM cases WHERE title = ?');

let imported = 0;
let skipped = 0;

for (const c of data.cases) {
  // Check if case already exists
  const existing = checkExists.get(c.title);
  if (existing) {
    console.log(`⏭️  Skipping "${c.title}" (already exists)`);
    skipped++;
    continue;
  }

  const id = uuidv4();
  
  try {
    // Insert case
    insertCase.run(
      id,
      c.title,
      c.modality,
      c.body_part,
      c.diagnosis,
      c.difficulty || 2,
      c.clinical_history,
      c.teaching_points,
      c.findings
    );

    // Handle tags
    if (c.tags && c.tags.length > 0) {
      for (const tagName of c.tags) {
        insertTag.run(tagName.toLowerCase());
        const tag = getTagId.get(tagName.toLowerCase());
        if (tag) {
          linkTag.run(id, tag.id);
        }
      }
    }

    console.log(`✅ Imported: ${c.title}`);
    imported++;
  } catch (err) {
    console.error(`❌ Failed to import "${c.title}": ${err.message}`);
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Imported: ${imported}`);
console.log(`   Skipped: ${skipped}`);
console.log(`   Total cases in database: ${db.prepare('SELECT COUNT(*) as count FROM cases').get().count}`);

db.close();
console.log('\n✅ Import complete! Cases are ready - just upload DICOM images for each.');
