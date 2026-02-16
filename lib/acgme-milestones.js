const ALL_BODY_PARTS = JSON.stringify(["chest","abdomen","pelvis","neuro","musculoskeletal","breast","cardiac","pediatric","emergency","nuclear_medicine"]);
const ALL_MODALITIES = JSON.stringify(["CT","MRI","US","NM","XR","fluoroscopy","mammography","PET"]);

const MILESTONES = [
  // Patient Care (PC)
  {
    id: 'DR-PC1',
    domain: 'patient_care',
    subdomain: 'Consultative Role',
    description: 'Provides appropriate consultation to referring physicians, integrating clinical information with imaging findings to guide patient management.',
    level_descriptions: JSON.stringify({
      1: 'Identifies basic clinical indications for imaging studies. Provides limited clinical context when interpreting studies.',
      2: 'Correlates imaging findings with clinical history. Communicates findings to referring physicians with some guidance.',
      3: 'Independently integrates clinical information to provide appropriate imaging recommendations. Communicates actionable findings effectively.',
      4: 'Serves as an expert consultant, proactively providing differential diagnoses and management recommendations. Recognized as a valuable clinical partner.',
      5: 'Leads multidisciplinary conferences and tumor boards. Shapes institutional imaging utilization guidelines. Mentors others in consultative skills.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 1
  },
  {
    id: 'DR-PC2',
    domain: 'patient_care',
    subdomain: 'Image Interpretation',
    description: 'Interprets imaging studies accurately and efficiently across all modalities and body systems.',
    level_descriptions: JSON.stringify({
      1: 'Identifies normal anatomy on common imaging studies. Recognizes obvious abnormalities with supervision.',
      2: 'Systematically interprets common imaging studies. Identifies most significant findings with occasional guidance needed for subtle pathology.',
      3: 'Independently interprets studies across modalities with appropriate accuracy. Generates reasonable differential diagnoses for most findings.',
      4: 'Demonstrates expert-level interpretation with high accuracy. Identifies subtle findings and generates comprehensive differentials. Handles complex cases independently.',
      5: 'Recognized authority in image interpretation. Resolves discrepant interpretations. Contributes to development of interpretation standards.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 2
  },
  {
    id: 'DR-PC3',
    domain: 'patient_care',
    subdomain: 'Image-Guided Procedures',
    description: 'Performs image-guided diagnostic and therapeutic procedures safely and effectively.',
    level_descriptions: JSON.stringify({
      1: 'Describes indications, contraindications, and basic technique for common image-guided procedures. Observes procedures performed by others.',
      2: 'Performs basic image-guided procedures (thoracentesis, paracentesis, simple biopsies) with direct supervision. Obtains informed consent.',
      3: 'Independently performs common image-guided procedures safely. Manages routine complications. Applies appropriate post-procedure care.',
      4: 'Performs complex procedures independently (e.g., deep biopsies, drainages). Handles complications expertly. Optimizes technique for difficult cases.',
      5: 'Innovates procedural techniques. Teaches advanced procedures. Develops procedural protocols and quality metrics.'
    }),
    body_parts: JSON.stringify(["chest","abdomen","pelvis","musculoskeletal"]),
    modalities: JSON.stringify(["CT","US","fluoroscopy"]),
    display_order: 3
  },

  // Medical Knowledge (MK)
  {
    id: 'DR-MK1',
    domain: 'medical_knowledge',
    subdomain: 'Clinical Knowledge',
    description: 'Demonstrates knowledge of disease processes, pathophysiology, and their imaging manifestations.',
    level_descriptions: JSON.stringify({
      1: 'Recalls basic anatomy, pathophysiology, and imaging appearances of common diseases. Uses textbooks and references frequently.',
      2: 'Explains pathophysiology underlying imaging findings for common conditions. Applies knowledge to generate basic differential diagnoses.',
      3: 'Demonstrates solid knowledge of disease processes across organ systems. Correlates clinical and imaging findings to narrow differential diagnoses effectively.',
      4: 'Possesses comprehensive knowledge including uncommon entities. Integrates advanced pathophysiology with imaging for expert-level differential diagnosis.',
      5: 'Recognized as a knowledge resource. Contributes to medical literature. Identifies knowledge gaps in the field and addresses them through research.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 4
  },
  {
    id: 'DR-MK2',
    domain: 'medical_knowledge',
    subdomain: 'Physics Knowledge',
    description: 'Understands imaging physics principles and their application to image quality, safety, and protocol optimization.',
    level_descriptions: JSON.stringify({
      1: 'Recalls basic physics principles underlying each imaging modality. Identifies common imaging artifacts.',
      2: 'Explains how physics principles affect image quality. Recognizes when technical factors compromise diagnostic quality.',
      3: 'Applies physics knowledge to optimize imaging protocols. Understands radiation dose concepts and applies ALARA principles.',
      4: 'Designs and modifies imaging protocols for complex clinical scenarios. Troubleshoots advanced technical problems. Implements dose reduction strategies.',
      5: 'Leads physics education and protocol development. Evaluates new imaging technologies. Contributes to national standards and guidelines.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: JSON.stringify(["CT","MRI","US","NM","XR"]),
    display_order: 5
  },

  // Systems-Based Practice (SBP)
  {
    id: 'DR-SBP1',
    domain: 'systems_based_practice',
    subdomain: 'Quality Improvement',
    description: 'Participates in quality improvement initiatives to enhance patient care and imaging services.',
    level_descriptions: JSON.stringify({
      1: 'Identifies basic quality metrics in radiology (turnaround time, discrepancy rates). Aware of departmental QI activities.',
      2: 'Participates in peer review and quality conferences. Recognizes system-level factors that affect quality.',
      3: 'Leads quality improvement projects. Analyzes quality data and implements changes. Participates actively in peer learning.',
      4: 'Designs and implements sustained QI programs. Uses data analytics to drive improvement. Mentors others in QI methodology.',
      5: 'Directs departmental quality programs. Contributes to national quality standards. Publishes QI outcomes.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 6
  },
  {
    id: 'DR-SBP2',
    domain: 'systems_based_practice',
    subdomain: 'Patient Safety',
    description: 'Promotes patient safety in imaging, including contrast safety, radiation protection, and MRI safety.',
    level_descriptions: JSON.stringify({
      1: 'Aware of basic safety protocols (contrast allergies, MRI screening, pregnancy). Follows established safety procedures.',
      2: 'Applies safety protocols independently. Identifies potential safety hazards. Reports safety events.',
      3: 'Manages contrast reactions and procedural complications. Implements radiation dose optimization. Conducts MRI safety screening.',
      4: 'Leads safety initiatives. Develops departmental safety protocols. Performs root cause analysis of safety events.',
      5: 'Shapes institutional and national safety standards. Innovates safety processes. Recognized as a safety leader.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 7
  },
  {
    id: 'DR-SBP3',
    domain: 'systems_based_practice',
    subdomain: 'Systems Navigation',
    description: 'Navigates and improves healthcare systems to optimize patient care delivery and resource utilization.',
    level_descriptions: JSON.stringify({
      1: 'Understands basic workflow of imaging departments. Aware of the roles of different team members.',
      2: 'Navigates PACS, RIS, and EHR systems effectively. Understands imaging utilization and appropriateness criteria.',
      3: 'Applies evidence-based appropriateness criteria. Coordinates care across departments. Manages workflow efficiently.',
      4: 'Optimizes departmental workflows and resource utilization. Implements informatics solutions. Advocates for system improvements.',
      5: 'Designs and implements system-wide improvements. Leads informatics initiatives. Influences healthcare policy at institutional or national level.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 8
  },

  // Practice-Based Learning and Improvement (PBLI)
  {
    id: 'DR-PBLI1',
    domain: 'practice_based_learning',
    subdomain: 'Evidence-Based Practice',
    description: 'Applies evidence-based principles to clinical decision-making and imaging practice.',
    level_descriptions: JSON.stringify({
      1: 'Identifies sources of evidence-based radiology literature. Reads assigned articles and textbook chapters.',
      2: 'Searches and appraises radiology literature. Applies published evidence to clinical questions with guidance.',
      3: 'Independently applies evidence-based medicine principles to imaging decisions. Critically appraises literature and integrates findings into practice.',
      4: 'Conducts literature reviews and synthesizes evidence for complex clinical questions. Develops evidence-based protocols and guidelines.',
      5: 'Leads evidence-based practice initiatives. Generates new evidence through research. Influences practice guidelines nationally.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 9
  },
  {
    id: 'DR-PBLI2',
    domain: 'practice_based_learning',
    subdomain: 'Reflective Practice',
    description: 'Engages in reflective practice and self-directed learning to continuously improve performance.',
    level_descriptions: JSON.stringify({
      1: 'Accepts feedback from supervisors. Identifies personal knowledge gaps when prompted.',
      2: 'Seeks feedback proactively. Develops basic learning plans to address identified weaknesses.',
      3: 'Systematically analyzes personal performance data (accuracy, discrepancy rates). Creates and follows structured self-improvement plans.',
      4: 'Models reflective practice for others. Uses multiple data sources for self-assessment. Adapts learning strategies based on outcomes.',
      5: 'Leads reflective practice programs. Develops assessment tools for others. Contributes to understanding of expertise development in radiology.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 10
  },

  // Professionalism (PROF)
  {
    id: 'DR-PROF1',
    domain: 'professionalism',
    subdomain: 'Professional Behavior',
    description: 'Demonstrates professional behavior including accountability, responsiveness, and commitment to excellence.',
    level_descriptions: JSON.stringify({
      1: 'Punctual and prepared. Responds to requests in a timely manner. Presents a professional appearance.',
      2: 'Takes ownership of assigned work. Demonstrates reliability and follow-through. Respects patient confidentiality.',
      3: 'Self-directed and accountable. Manages competing priorities effectively. Demonstrates leadership among peers.',
      4: 'Models professional behavior. Mentors junior trainees. Addresses unprofessional behavior constructively.',
      5: 'Shapes professional culture. Leads professionalism initiatives. Recognized as an exemplar of professional conduct.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 11
  },
  {
    id: 'DR-PROF2',
    domain: 'professionalism',
    subdomain: 'Ethical Practice',
    description: 'Practices ethically, recognizing and managing conflicts of interest and maintaining patient trust.',
    level_descriptions: JSON.stringify({
      1: 'Aware of basic ethical principles in medicine. Identifies obvious ethical dilemmas.',
      2: 'Applies ethical principles to common clinical scenarios. Recognizes conflicts of interest.',
      3: 'Manages ethical dilemmas independently. Advocates for patients while respecting autonomy. Maintains appropriate boundaries.',
      4: 'Guides others through ethical challenges. Contributes to ethics policy development. Leads by example in ethical practice.',
      5: 'Serves on ethics committees. Shapes institutional ethical guidelines. Publishes in medical ethics.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 12
  },

  // Interpersonal & Communication Skills (ICS)
  {
    id: 'DR-ICS1',
    domain: 'interpersonal_communication',
    subdomain: 'Patient Communication',
    description: 'Communicates effectively with patients, explaining procedures, findings, and results in an understandable manner.',
    level_descriptions: JSON.stringify({
      1: 'Introduces self to patients. Provides basic explanations of imaging procedures. Obtains simple consent.',
      2: 'Explains procedures and findings to patients in understandable language. Addresses patient concerns and anxiety.',
      3: 'Communicates complex findings and diagnoses to patients with empathy. Manages difficult conversations (unexpected findings, bad news).',
      4: 'Expert in patient communication across diverse populations. Handles complex disclosure situations. Teaches communication skills to others.',
      5: 'Develops patient communication programs and materials. Leads training in difficult conversations. Advocates for patient-centered communication.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 13
  },
  {
    id: 'DR-ICS2',
    domain: 'interpersonal_communication',
    subdomain: 'Interprofessional Communication',
    description: 'Communicates effectively with healthcare team members to coordinate patient care.',
    level_descriptions: JSON.stringify({
      1: 'Communicates basic findings to team members. Participates in team discussions when asked.',
      2: 'Provides clear verbal and written communications to referring clinicians. Participates actively in multidisciplinary discussions.',
      3: 'Leads effective communication with referring physicians for complex cases. Provides actionable recommendations. Manages critical result communication.',
      4: 'Serves as a communication leader in multidisciplinary settings. Resolves communication conflicts. Designs communication workflows.',
      5: 'Models and teaches expert interprofessional communication. Develops institutional communication standards. Influences national reporting guidelines.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 14
  },
  {
    id: 'DR-ICS3',
    domain: 'interpersonal_communication',
    subdomain: 'Reporting',
    description: 'Produces clear, concise, and clinically relevant radiology reports.',
    level_descriptions: JSON.stringify({
      1: 'Generates basic structured reports with supervision. Reports contain relevant findings but may lack organization.',
      2: 'Produces organized reports with appropriate use of radiology terminology. Reports include pertinent positives and negatives.',
      3: 'Independently generates clear, concise reports with actionable impressions. Uses structured reporting when appropriate. Communicates critical findings per policy.',
      4: 'Produces expert-level reports that drive clinical decision-making. Develops reporting templates and standards. Reports serve as teaching examples.',
      5: 'Leads reporting standardization efforts. Contributes to national reporting guidelines (e.g., RSNA reporting templates). Innovates in report communication.'
    }),
    body_parts: ALL_BODY_PARTS,
    modalities: ALL_MODALITIES,
    display_order: 15
  }
];

function seedMilestones(db) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO acgme_milestones (id, domain, subdomain, description, level_descriptions, body_parts, modalities, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const m of MILESTONES) {
    stmt.run(m.id, m.domain, m.subdomain, m.description, m.level_descriptions, m.body_parts, m.modalities, m.display_order);
  }
}

module.exports = { seedMilestones, MILESTONES };
