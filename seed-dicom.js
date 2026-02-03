#!/usr/bin/env node
/**
 * Seed DICOM Series for RadCase Sample Cases
 * Links existing DICOM files in the dicom/ folder to sample cases
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const db = new Database(path.join(__dirname, 'radcase.db'));
const DICOM_DIR = path.join(__dirname, 'dicom');

// Map of folder names to case titles (partial match)
const DICOM_MAPPING = [
  {
    folder: 'demo-chest-ct-50',
    caseMatch: 'Pneumothorax',
    description: 'Chest CT - 50 slice series',
    modality: 'CT',
    windowCenter: -600,
    windowWidth: 1500
  },
  {
    folder: 'demo-chest-ct-50',
    caseMatch: 'Pulmonary Embolism',
    description: 'CTPA - 50 slice series',
    modality: 'CT',
    windowCenter: 100,
    windowWidth: 700
  },
  {
    folder: 'demo-chest-ct-50',
    caseMatch: 'Pneumonia',
    description: 'Chest CT - Mediastinal',
    modality: 'CT', 
    windowCenter: 40,
    windowWidth: 400
  },
  {
    folder: 'demo-head-ct-30',
    caseMatch: 'Ischemic Stroke',
    description: 'Head CT - Brain Window',
    modality: 'CT',
    windowCenter: 40,
    windowWidth: 80
  },
  {
    folder: 'demo-head-ct-30',
    caseMatch: 'Subarachnoid',
    description: 'Head CT - SAH Protocol',
    modality: 'CT',
    windowCenter: 40,
    windowWidth: 150
  },
  {
    folder: 'demo-chest-ct-50',
    caseMatch: 'Appendicitis',
    description: 'Abdominal CT',
    modality: 'CT',
    windowCenter: 40,
    windowWidth: 400
  },
  {
    folder: 'demo-chest-ct-50',
    caseMatch: 'Renal Cell',
    description: 'Abdominal CT - Renal',
    modality: 'CT',
    windowCenter: 40,
    windowWidth: 400
  },
  {
    folder: 'demo-chest-ct-50',
    caseMatch: 'Bowel Obstruction',
    description: 'Abdominal CT',
    modality: 'CT',
    windowCenter: 40,
    windowWidth: 400
  }
];

function getDicomFilesInFolder(folderPath) {
  if (!fs.existsSync(folderPath)) return [];
  return fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.dcm') || (!f.includes('.') && fs.statSync(path.join(folderPath, f)).isFile()))
    .sort();
}

function main() {
  console.log('🏥 RadCase DICOM Seeder');
  console.log('=======================\n');

  // Get all cases
  const cases = db.prepare('SELECT id, title FROM cases').all();
  console.log(`Found ${cases.length} cases in database\n`);

  let added = 0;
  let skipped = 0;

  for (const mapping of DICOM_MAPPING) {
    const folderPath = path.join(DICOM_DIR, mapping.folder);
    const files = getDicomFilesInFolder(folderPath);
    
    if (files.length === 0) {
      console.log(`⚠️  No DICOM files found in: ${mapping.folder}`);
      continue;
    }

    // Find matching case
    const matchingCase = cases.find(c => 
      c.title.toLowerCase().includes(mapping.caseMatch.toLowerCase())
    );

    if (!matchingCase) {
      console.log(`⚠️  No case matching "${mapping.caseMatch}"`);
      continue;
    }

    // Check if this case already has this specific series description
    const existingForCase = db.prepare(
      'SELECT id FROM dicom_series WHERE case_id = ? AND series_description = ?'
    ).get(matchingCase.id, mapping.description);

    if (existingForCase) {
      console.log(`⏭️  "${matchingCase.title}" already has "${mapping.description}"`);
      skipped++;
      continue;
    }

    // Create unique folder for this series (copy files)
    const seriesId = uuidv4();
    const targetFolder = `case-${seriesId.slice(0, 8)}`;
    const targetPath = path.join(DICOM_DIR, targetFolder);
    
    fs.mkdirSync(targetPath, { recursive: true });
    
    for (const file of files) {
      fs.copyFileSync(
        path.join(folderPath, file),
        path.join(targetPath, file)
      );
    }

    // Insert series record
    db.prepare(`
      INSERT INTO dicom_series (
        id, case_id, series_description, modality, num_images, 
        folder_name, window_center, window_width
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      seriesId,
      matchingCase.id,
      mapping.description,
      mapping.modality,
      files.length,
      targetFolder,
      mapping.windowCenter,
      mapping.windowWidth
    );

    console.log(`✅ Added "${mapping.description}" (${files.length} slices) → "${matchingCase.title}"`);
    added++;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Added: ${added} series`);
  console.log(`   Skipped: ${skipped} (already exist)`);
  
  // Show total
  const totalSeries = db.prepare('SELECT COUNT(*) as count FROM dicom_series').get();
  const casesWithDicom = db.prepare('SELECT COUNT(DISTINCT case_id) as count FROM dicom_series').get();
  console.log(`\n   Total DICOM series: ${totalSeries.count}`);
  console.log(`   Cases with DICOM: ${casesWithDicom.count}/${cases.length}`);
}

main();
