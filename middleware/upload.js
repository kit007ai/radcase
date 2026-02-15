const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_DICOM_MIMES,
  validateFileType,
  generateSecureFilename
} = require('../lib/security-utils');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const DICOM_DIR = path.join(__dirname, '..', 'dicom');

// Enhanced multer storage with security validation
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const secureFilename = generateSecureFilename(file.originalname);
    cb(null, secureFilename);
  }
});

// File filter for uploads - validate MIME types
const imageFileFilter = (req, file, cb) => {
  console.log(`Upload attempt: ${file.originalname}, MIME: ${file.mimetype}`);

  if (validateFileType(file.mimetype, ALLOWED_IMAGE_MIMES)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${ALLOWED_IMAGE_MIMES.join(', ')}`), false);
  }
};

// Standard image upload with security
const upload = multer({
  storage,
  limits: {
    fileSize: (process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024,
    files: 20
  },
  fileFilter: imageFileFilter
});

// DICOM upload storage
const dicomStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.dicomSeriesId) {
      req.dicomSeriesId = req.params.seriesId || uuidv4();
    }
    const seriesDir = path.join(DICOM_DIR, req.dicomSeriesId);
    fs.mkdirSync(seriesDir, { recursive: true });
    console.log(`DICOM destination: seriesId=${req.dicomSeriesId}, file=${file.originalname}`);
    cb(null, seriesDir);
  },
  filename: (req, file, cb) => {
    const secureFilename = generateSecureFilename(file.originalname || 'dicom.dcm');
    cb(null, secureFilename);
  }
});

// DICOM file filter
const dicomFileFilter = (req, file, cb) => {
  console.log(`DICOM upload: ${file.originalname}, MIME: ${file.mimetype}`);

  if (validateFileType(file.mimetype, ALLOWED_DICOM_MIMES) ||
      file.originalname.toLowerCase().endsWith('.dcm') ||
      file.originalname.toLowerCase().includes('dicom')) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid DICOM file type. MIME: ${file.mimetype}`), false);
  }
};

const dicomUpload = multer({
  storage: dicomStorage,
  limits: {
    fileSize: (process.env.MAX_DICOM_FILE_SIZE_MB || 500) * 1024 * 1024,
    files: 1000
  },
  fileFilter: dicomFileFilter
});

module.exports = { upload, dicomUpload };
