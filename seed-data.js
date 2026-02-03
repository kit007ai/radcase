// RadCase Sample Data Seeder
const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const db = new Database(path.join(__dirname, 'radcase.db'));

const sampleCases = [
  {
    title: "Classic Pneumothorax",
    modality: "X-Ray",
    body_part: "Chest",
    diagnosis: "Right-sided tension pneumothorax",
    difficulty: 2,
    clinical_history: "45-year-old male presents with sudden onset chest pain and shortness of breath after a motor vehicle accident. Decreased breath sounds on the right.",
    findings: "Complete collapse of the right lung with visible visceral pleural line. Mediastinal shift to the left. Flattening of the right hemidiaphragm. No rib fractures identified.",
    teaching_points: "1. Always look for the visceral pleural line - it's the key finding\\n2. Tension pneumothorax shows mediastinal shift AWAY from the affected side\\n3. This is a medical emergency requiring immediate decompression\\n4. Expiratory films can help visualize small pneumothoraces",
    tags: ["emergency", "trauma", "must-know", "chest"]
  },
  {
    title: "Lobar Pneumonia",
    modality: "X-Ray",
    body_part: "Chest",
    diagnosis: "Right lower lobe pneumonia",
    difficulty: 1,
    clinical_history: "68-year-old female with 3 days of productive cough, fever (38.9°C), and right-sided pleuritic chest pain. History of COPD.",
    findings: "Dense consolidation in the right lower lobe with air bronchograms. The right hemidiaphragm is obscured (silhouette sign positive). No pleural effusion. The remaining lung fields are clear.",
    teaching_points: "1. Air bronchograms indicate alveolar disease\\n2. Silhouette sign helps localize the abnormality\\n3. Lobar pneumonia respects fissures\\n4. Common organisms: Strep pneumoniae, H. influenzae",
    tags: ["infection", "classic", "chest"]
  },
  {
    title: "Appendicitis with Perforation",
    modality: "CT",
    body_part: "Abdomen",
    diagnosis: "Perforated appendicitis with periappendiceal abscess",
    difficulty: 2,
    clinical_history: "23-year-old male with 4 days of RLQ pain, initially periumbilical. Now with fever, elevated WBC (18,000), and rebound tenderness.",
    findings: "Dilated appendix (13mm diameter) with appendicolith. Periappendiceal fat stranding and fluid collection measuring 4x3cm consistent with abscess. Free fluid in the pelvis. No free air.",
    teaching_points: "1. Appendix >6mm is abnormal\\n2. Appendicolith is present in ~25% of cases but highly specific\\n3. Perforation signs: abscess, extraluminal air, phlegmon\\n4. Secondary signs: cecal wall thickening, mesenteric lymphadenopathy",
    tags: ["emergency", "acute abdomen", "surgery"]
  },
  {
    title: "Acute Ischemic Stroke - MCA Territory",
    modality: "CT",
    body_part: "Head",
    diagnosis: "Acute left MCA territory infarct",
    difficulty: 3,
    clinical_history: "72-year-old right-handed male found with right-sided weakness and aphasia. Last known well 2 hours ago. History of atrial fibrillation, not on anticoagulation.",
    findings: "Loss of gray-white matter differentiation in the left insular cortex and left frontal operculum. Hyperdense left MCA sign. No hemorrhage. ASPECTS score: 8.",
    teaching_points: "1. Hyperdense MCA sign indicates acute thrombus\\n2. Early CT signs: loss of insular ribbon, obscuration of lentiform nucleus\\n3. ASPECTS score guides treatment decisions\\n4. CT angiography and perfusion help identify salvageable tissue",
    tags: ["emergency", "stroke", "neurology", "must-know"]
  },
  {
    title: "Renal Cell Carcinoma",
    modality: "CT",
    body_part: "Abdomen",
    diagnosis: "Right renal cell carcinoma (clear cell type)",
    difficulty: 3,
    clinical_history: "58-year-old male with incidental finding during workup for abdominal pain. No hematuria. Non-smoker.",
    findings: "5.2 cm heterogeneously enhancing mass arising from the upper pole of the right kidney. Enhancement from 35 HU to 110 HU post-contrast. No renal vein invasion. No lymphadenopathy. No metastases in visualized portions of liver or lungs.",
    teaching_points: "1. Enhancement >15-20 HU suggests malignancy\\n2. Clear cell RCC is hypervascular, papillary is hypovascular\\n3. Always check for renal vein and IVC invasion\\n4. Staging determines surgical approach (partial vs radical nephrectomy)",
    tags: ["oncology", "renal", "staging"]
  },
  {
    title: "Pulmonary Embolism",
    modality: "CT",
    body_part: "Chest",
    diagnosis: "Bilateral pulmonary emboli with right heart strain",
    difficulty: 2,
    clinical_history: "45-year-old female, 2 weeks post-operative from knee surgery, presents with acute dyspnea and chest pain. D-dimer elevated. HR 115, SpO2 88% on room air.",
    findings: "Filling defects in the right main pulmonary artery extending into the right lower lobe artery. Additional filling defect in the left lower lobe segmental artery. RV:LV ratio 1.3 indicating right heart strain. No pulmonary infarct.",
    teaching_points: "1. PE appears as filling defects on CTPA\\n2. RV:LV ratio >1.0 indicates right heart strain and worse prognosis\\n3. Signs of infarct: peripheral wedge-shaped opacity\\n4. Always check for DVT source (add CT venogram if needed)",
    tags: ["emergency", "vascular", "must-know", "chest"]
  },
  {
    title: "Bowel Obstruction",
    modality: "CT",
    body_part: "Abdomen",
    diagnosis: "Small bowel obstruction secondary to adhesions",
    difficulty: 2,
    clinical_history: "67-year-old female with previous hysterectomy presents with abdominal distension, vomiting, and obstipation for 2 days.",
    findings: "Dilated small bowel loops up to 4.5 cm with multiple air-fluid levels. Transition point in the right lower quadrant with decompressed distal ileum. No bowel wall thickening, pneumatosis, or mesenteric haziness to suggest ischemia. Collapsed colon.",
    teaching_points: "1. Small bowel >3cm is dilated\\n2. Look for the transition point - determines cause and location\\n3. Signs of strangulation: mesenteric haziness, reduced enhancement, pneumatosis\\n4. Adhesions are #1 cause in patients with prior surgery",
    tags: ["emergency", "acute abdomen", "surgery"]
  },
  {
    title: "Subarachnoid Hemorrhage",
    modality: "CT",
    body_part: "Head",
    diagnosis: "Subarachnoid hemorrhage - Fisher Grade 3",
    difficulty: 2,
    clinical_history: "52-year-old female with sudden onset 'worst headache of my life' followed by brief loss of consciousness. Blood pressure 180/95.",
    findings: "High-density blood in the basal cisterns, sylvian fissures bilaterally, and interhemispheric fissure. No intraparenchymal or intraventricular extension. No hydrocephalus currently.",
    teaching_points: "1. SAH appears hyperdense in cisterns and fissures\\n2. Fisher grade predicts vasospasm risk\\n3. Most common cause: ruptured aneurysm (berry aneurysm)\\n4. CTA should follow to identify aneurysm location",
    tags: ["emergency", "neurology", "must-know", "vascular"]
  }
];

// Insert sample cases
const insertCase = db.prepare(`
  INSERT INTO cases (id, title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
const linkTag = db.prepare('INSERT OR IGNORE INTO case_tags (case_id, tag_id) VALUES (?, ?)');

console.log('Seeding RadCase with sample data...');

for (const c of sampleCases) {
  const id = uuidv4();
  
  insertCase.run(
    id, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty,
    c.clinical_history, c.teaching_points, c.findings
  );

  // Add tags
  for (const tagName of c.tags) {
    insertTag.run(tagName);
    const tag = getTagId.get(tagName);
    if (tag) linkTag.run(id, tag.id);
  }

  console.log(`  ✓ Added: ${c.title}`);
}

console.log(`\n✅ Seeded ${sampleCases.length} sample cases!`);
console.log('Note: These are text-only cases. Add your own images through the UI.');
