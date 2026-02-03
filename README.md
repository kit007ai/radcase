# RadCase 🏥

A modern radiology case library for teaching and learning. Built for imaging informatics education.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### 📚 Case Library
- Full case management (create, edit, delete)
- Multi-image support with thumbnails
- Rich metadata: modality, body part, difficulty, tags
- Clinical history, findings, teaching points
- Search and filter functionality

### ✏️ Image Annotation
- Draw arrows, circles, rectangles
- Freehand drawing
- Text labels
- Multiple colors and line weights
- Undo/redo with keyboard shortcuts
- Save annotations per image

### 🎬 Presentation Mode
- Full-screen teaching presentations
- Progressive reveal (diagnosis, findings, teaching points)
- Keyboard navigation
- Perfect for conferences and lectures

### 🎯 Quiz Mode
- Random case selection with filters
- Self-assessment tracking
- Performance analytics
- Spaced repetition algorithm (SM-2)

### 📊 Analytics
- Quiz performance metrics
- Cases by modality/body part
- Identify weak areas
- Review history

### 📦 Import/Export
- Export entire library or single cases
- Import cases from JSON
- Includes images in base64
- Perfect for sharing and backup

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open in browser
open http://localhost:3001
```

## Keyboard Shortcuts

### Annotation Mode
- `A` - Arrow tool
- `C` - Circle tool
- `R` - Rectangle tool
- `L` - Line tool
- `F` - Freehand tool
- `T` - Text tool
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo

### Presentation Mode
- `←` `→` - Navigate images
- `D` - Reveal diagnosis
- `F` - Reveal findings
- `T` - Reveal teaching points
- `Space` - Reveal all
- `H` - Hide all
- `Esc` - Exit

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: SQLite (better-sqlite3)
- **Frontend**: Vanilla JS, Modern CSS
- **Image Processing**: Sharp

## API Endpoints

### Cases
- `GET /api/cases` - List all cases
- `GET /api/cases/:id` - Get single case
- `POST /api/cases` - Create case
- `PUT /api/cases/:id` - Update case
- `DELETE /api/cases/:id` - Delete case
- `POST /api/cases/:id/images` - Upload images

### Quiz
- `GET /api/quiz/random` - Get random case
- `POST /api/quiz/attempt` - Record attempt
- `GET /api/quiz/stats` - Get quiz statistics

### Import/Export
- `GET /api/export` - Export all cases
- `GET /api/cases/:id/export` - Export single case
- `POST /api/import` - Import cases

## Sample Data

Run the seed script to add sample radiology cases:

```bash
node seed-data.js
```

This adds 8 classic teaching cases covering:
- Pneumothorax
- Pneumonia
- Appendicitis
- Stroke
- Renal cell carcinoma
- Pulmonary embolism
- Bowel obstruction
- Subarachnoid hemorrhage

## File Structure

```
radcase/
├── server.js          # Express backend
├── radcase.db         # SQLite database
├── package.json
├── seed-data.js       # Sample data seeder
├── uploads/           # Original images
├── thumbnails/        # Thumbnail images
└── public/
    ├── index.html     # Main frontend
    ├── annotate.js    # Annotation engine
    ├── presentation.js # Presentation mode
    └── spaced-repetition.js # SR algorithm
```

## Future Ideas

- [ ] DICOM viewer integration
- [ ] Multi-user support
- [ ] Case sharing/collaboration
- [ ] AI-assisted findings detection
- [ ] Mobile app
- [ ] Integration with PACS

---

Built with 💜 by Kit & Raj | 2026
