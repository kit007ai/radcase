#!/usr/bin/env node
// Generate sample radiology images using sharp and add to database
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('better-sqlite3')('./radcase.db');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const THUMB_DIR = path.join(__dirname, 'thumbnails');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(THUMB_DIR, { recursive: true });

// Generate synthetic radiology-style images
async function generateRadiologyImage(config) {
  const { width = 800, height = 800, type = 'xray', label = '' } = config;
  
  // Create dark background (like radiology images)
  let img;
  
  if (type === 'xray') {
    // X-ray style: dark with lighter anatomical region
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="body" cx="50%" cy="45%" r="40%">
          <stop offset="0%" style="stop-color:#444;stop-opacity:1" />
          <stop offset="60%" style="stop-color:#222;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#111;stop-opacity:1" />
        </radialGradient>
        <radialGradient id="lung1" cx="35%" cy="40%" r="15%">
          <stop offset="0%" style="stop-color:#111;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#333;stop-opacity:1" />
        </radialGradient>
        <radialGradient id="lung2" cx="65%" cy="40%" r="15%">
          <stop offset="0%" style="stop-color:#111;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#333;stop-opacity:1" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="#0a0a0a"/>
      <ellipse cx="50%" cy="45%" rx="35%" ry="42%" fill="url(#body)"/>
      <ellipse cx="35%" cy="38%" rx="12%" ry="18%" fill="url(#lung1)"/>
      <ellipse cx="65%" cy="38%" rx="12%" ry="18%" fill="url(#lung2)"/>
      <line x1="50%" y1="15%" x2="50%" y2="75%" stroke="#555" stroke-width="3"/>
      <text x="20" y="30" fill="#888" font-size="14" font-family="monospace">${label}</text>
      <text x="${width-80}" y="${height-10}" fill="#666" font-size="12" font-family="monospace">RADCASE</text>
    </svg>`;
    img = sharp(Buffer.from(svg));
  } else if (type === 'ct-head') {
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="skull" cx="50%" cy="50%" r="35%">
          <stop offset="0%" style="stop-color:#333;stop-opacity:1" />
          <stop offset="70%" style="stop-color:#555;stop-opacity:1" />
          <stop offset="85%" style="stop-color:#222;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="#0a0a0a"/>
      <circle cx="50%" cy="50%" r="35%" fill="url(#skull)"/>
      <ellipse cx="42%" cy="48%" rx="8%" ry="10%" fill="#111" opacity="0.7"/>
      <ellipse cx="58%" cy="48%" rx="8%" ry="10%" fill="#111" opacity="0.7"/>
      <text x="20" y="30" fill="#888" font-size="14" font-family="monospace">${label}</text>
      <text x="${width-80}" y="${height-10}" fill="#666" font-size="12" font-family="monospace">RADCASE</text>
    </svg>`;
    img = sharp(Buffer.from(svg));
  } else if (type === 'ct-abdomen') {
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="body" cx="50%" cy="50%" r="40%">
          <stop offset="0%" style="stop-color:#333;stop-opacity:1" />
          <stop offset="80%" style="stop-color:#444;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="#0a0a0a"/>
      <ellipse cx="50%" cy="50%" rx="38%" ry="42%" fill="url(#body)"/>
      <ellipse cx="40%" cy="40%" rx="10%" ry="12%" fill="#444" opacity="0.6"/>
      <ellipse cx="60%" cy="42%" rx="6%" ry="8%" fill="#3a3a3a" opacity="0.5"/>
      <circle cx="50%" cy="55%" r="4%" fill="#2a2a2a" opacity="0.4"/>
      <text x="20" y="30" fill="#888" font-size="14" font-family="monospace">${label}</text>
      <text x="${width-80}" y="${height-10}" fill="#666" font-size="12" font-family="monospace">RADCASE</text>
    </svg>`;
    img = sharp(Buffer.from(svg));
  } else {
    // Ultrasound style
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="us" cx="50%" cy="40%" r="45%">
          <stop offset="0%" style="stop-color:#555;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#333;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#111;stop-opacity:1" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="#0a0a0a"/>
      <path d="M ${width*0.2} ${height*0.05} L ${width*0.8} ${height*0.05} L ${width*0.95} ${height*0.95} L ${width*0.05} ${height*0.95} Z" fill="url(#us)"/>
      <ellipse cx="50%" cy="45%" rx="15%" ry="12%" fill="#222" opacity="0.8"/>
      <text x="20" y="30" fill="#00ccff" font-size="14" font-family="monospace">${label}</text>
      <text x="${width-80}" y="${height-10}" fill="#666" font-size="12" font-family="monospace">RADCASE</text>
    </svg>`;
    img = sharp(Buffer.from(svg));
  }

  return img.jpeg({ quality: 85 }).toBuffer();
}

// Map cases to image configs
const caseImageConfigs = {
  'Classic Pneumothorax': { type: 'xray', label: 'CXR PA' },
  'Lobar Pneumonia': { type: 'xray', label: 'CXR PA' },
  'Tension Pneumothorax': { type: 'xray', label: 'CXR AP Portable' },
  'Appendicitis with Perforation': { type: 'ct-abdomen', label: 'CT Abd/Pel +C' },
  'Acute Ischemic Stroke - MCA Territory': { type: 'ct-head', label: 'CT Head W/O' },
  'Renal Cell Carcinoma': { type: 'ct-abdomen', label: 'CT Abd +C' },
  'Pulmonary Embolism': { type: 'xray', label: 'CTPA' },
  'Bowel Obstruction': { type: 'ct-abdomen', label: 'CT Abd/Pel' },
  'Subarachnoid Hemorrhage': { type: 'ct-head', label: 'CT Head W/O' },
  'Pulmonary Embolism - Saddle Type': { type: 'ct-abdomen', label: 'CTPA' },
  'Acute Appendicitis': { type: 'ct-abdomen', label: 'CT Abd/Pel +C' },
  'Small Bowel Obstruction': { type: 'ct-abdomen', label: 'CT Abd/Pel' },
  'Aortic Dissection - Type A': { type: 'ct-abdomen', label: 'CTA Chest' },
  'Pneumoperitoneum - Perforated Viscus': { type: 'ct-abdomen', label: 'CT Abd/Pel' },
  'Epidural Hematoma': { type: 'ct-head', label: 'CT Head W/O' },
  'Subdural Hematoma - Acute': { type: 'ct-head', label: 'CT Head W/O' },
  'Cholecystitis - Acute': { type: 'ultrasound', label: 'US RUQ' },
  'Abdominal Aortic Aneurysm - Ruptured': { type: 'ct-abdomen', label: 'CTA Abd/Pel' },
  'Pulmonary Nodule - Suspicious': { type: 'ct-abdomen', label: 'CT Chest +C' },
  'Mesenteric Ischemia - Acute': { type: 'ct-abdomen', label: 'CTA Abd' },
  'Diverticulitis - Acute Complicated': { type: 'ct-abdomen', label: 'CT Abd/Pel +C' },
  'Ovarian Torsion': { type: 'ultrasound', label: 'US Pelvis' },
  "Cervical Spine Fracture - Hangman's": { type: 'ct-head', label: 'CT C-Spine' },
  'Liver Metastases': { type: 'ct-abdomen', label: 'CT Abd +C' },
};

async function main() {
  const cases = db.prepare('SELECT id, title, modality FROM cases').all();
  const insertImg = db.prepare('INSERT INTO images (id, case_id, filename, original_name, sequence) VALUES (?, ?, ?, ?, ?)');
  
  let count = 0;
  for (const c of cases) {
    // Skip test/demo cases and cases that already have real images
    if (c.title.startsWith('Test') || c.title.startsWith('Demo:')) continue;
    
    const existing = db.prepare('SELECT COUNT(*) as cnt FROM images WHERE case_id = ?').get(c.id);
    if (existing.cnt > 0) continue;
    
    const config = caseImageConfigs[c.title] || { type: 'ct-abdomen', label: c.modality || 'CT' };
    
    const imgBuffer = await generateRadiologyImage({ ...config, width: 800, height: 800 });
    const hash = crypto.randomBytes(16).toString('hex');
    const filename = `${hash}.jpg`;
    
    // Write upload
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), imgBuffer);
    
    // Create thumbnail
    const thumbBuffer = await sharp(imgBuffer).resize(400, 400, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
    fs.writeFileSync(path.join(THUMB_DIR, filename), thumbBuffer);
    
    // Insert into DB
    const imgId = crypto.randomUUID();
    insertImg.run(imgId, c.id, filename, `${c.title.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`, 1);
    
    count++;
    console.log(`✓ ${c.title}`);
  }
  
  console.log(`\nAdded images to ${count} cases`);
  db.close();
}

main().catch(console.error);
