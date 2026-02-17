const express = require('express');
const path = require('path');
const fs = require('fs');
const dicomParser = require('dicom-parser');
const { cacheMiddleware } = require('../lib/cache');
const { requireAuth } = require('../middleware/auth');

const DICOM_DIR = path.join(__dirname, '..', 'dicom');

const router = express.Router();

// Helper function to parse DICOM metadata
function parseDicomFile(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const byteArray = new Uint8Array(arrayBuffer);
    const dataSet = dicomParser.parseDicom(byteArray);

    const getString = (tag) => {
      try { return dataSet.string(tag) || ''; } catch (e) { return ''; }
    };
    const getNumber = (tag) => {
      try { return parseFloat(dataSet.string(tag)) || null; } catch (e) { return null; }
    };

    return {
      patientName: getString('x00100010'),
      patientId: getString('x00100020'),
      studyDescription: getString('x00081030'),
      seriesDescription: getString('x0008103e'),
      modality: getString('x00080060'),
      seriesInstanceUID: getString('x0020000e'),
      studyInstanceUID: getString('x0020000d'),
      sopInstanceUID: getString('x00080018'),
      instanceNumber: parseInt(getString('x00200013')) || 0,
      windowCenter: getNumber('x00281050'),
      windowWidth: getNumber('x00281051'),
      rows: parseInt(getString('x00280010')) || 0,
      columns: parseInt(getString('x00280011')) || 0,
      bitsAllocated: parseInt(getString('x00280100')) || 16,
      pixelSpacing: getString('x00280030'),
      sliceThickness: getNumber('x00180050'),
      sliceLocation: getNumber('x00201041')
    };
  } catch (e) {
    console.error('Error parsing DICOM:', e.message);
    return null;
  }
}

module.exports = function(db, cache) {
  const apiCache1h = cacheMiddleware(cache, { ttl: 60 * 60 * 1000 });

  // Get list of DICOM images in a series (for viewer)
  router.get('/series', apiCache1h, (req, res) => {
    const { path: seriesPath, seriesId } = req.query;
    const folder = seriesId || seriesPath;

    if (!folder) {
      return res.status(400).json({ error: 'Series path or ID required' });
    }

    const seriesDir = path.resolve(DICOM_DIR, folder);

    if (!seriesDir.startsWith(DICOM_DIR + path.sep) && seriesDir !== DICOM_DIR) {
      return res.status(400).json({ error: 'Invalid series path' });
    }

    if (!fs.existsSync(seriesDir)) {
      return res.status(404).json({ error: 'Series not found' });
    }

    try {
      const files = fs.readdirSync(seriesDir)
        .filter(f => f.endsWith('.dcm') || !f.includes('.'))
        .map(filename => {
          const filePath = path.join(seriesDir, filename);
          const metadata = parseDicomFile(filePath);
          return {
            filename,
            instanceNumber: metadata?.instanceNumber || 0,
            sliceLocation: metadata?.sliceLocation
          };
        })
        .sort((a, b) => {
          if (a.sliceLocation !== null && b.sliceLocation !== null) {
            return a.sliceLocation - b.sliceLocation;
          }
          return a.instanceNumber - b.instanceNumber;
        });

      const imageIds = files.map(f => `wadouri:/dicom/${folder}/${f.filename}`);

      const firstFile = path.join(seriesDir, files[0]?.filename);
      const metadata = files.length > 0 ? parseDicomFile(firstFile) : null;

      res.json({
        imageIds,
        numImages: files.length,
        metadata
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get DICOM series info
  router.get('/:seriesId', (req, res) => {
    const series = db.prepare('SELECT * FROM dicom_series WHERE id = ?').get(req.params.seriesId);

    if (!series) {
      return res.status(404).json({ error: 'Series not found' });
    }

    const seriesDir = path.join(DICOM_DIR, series.folder_name);
    if (!fs.existsSync(seriesDir)) {
      return res.json({ ...series, files: 0, imageIds: [] });
    }

    const files = fs.readdirSync(seriesDir)
      .filter(f => f.endsWith('.dcm') || !f.includes('.'))
      .map(filename => {
        const metadata = parseDicomFile(path.join(seriesDir, filename));
        return {
          filename,
          instanceNumber: metadata?.instanceNumber || 0,
          sliceLocation: metadata?.sliceLocation
        };
      })
      .sort((a, b) => {
        if (a.sliceLocation !== null && b.sliceLocation !== null &&
            a.sliceLocation !== undefined && b.sliceLocation !== undefined) {
          return a.sliceLocation - b.sliceLocation;
        }
        return a.instanceNumber - b.instanceNumber;
      });

    res.json({
      ...series,
      files: files.length,
      imageIds: files.map(f => `wadouri:/dicom/${series.folder_name}/${f.filename}`)
    });
  });

  // Delete DICOM series
  router.delete('/:seriesId', requireAuth, (req, res) => {
    const series = db.prepare('SELECT folder_name FROM dicom_series WHERE id = ?').get(req.params.seriesId);

    if (series) {
      const seriesDir = path.join(DICOM_DIR, series.folder_name);
      if (fs.existsSync(seriesDir)) {
        fs.rmSync(seriesDir, { recursive: true, force: true });
      }

      db.prepare('DELETE FROM dicom_series WHERE id = ?').run(req.params.seriesId);
    }

    res.json({ message: 'Series deleted' });
  });

  return router;
};

// Export parseDicomFile for use by cases route
module.exports.parseDicomFile = parseDicomFile;
