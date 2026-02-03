#!/usr/bin/env node
/**
 * Generate Synthetic DICOM Series for RadCase Demo (v2)
 * Uses dcmjs for proper DICOM file creation
 */

const fs = require('fs');
const path = require('path');
const dcmjs = require('dcmjs');

const { DicomDict, DicomMetaDictionary, datasetToBuffer } = dcmjs.data;

const DICOM_DIR = path.join(__dirname, 'dicom');

// Generate synthetic pixel data
function generatePixelData(width, height, sliceIndex, totalSlices, pattern = 'chest') {
  const pixels = new Uint16Array(width * height);
  
  const centerX = width / 2;
  const centerY = height / 2;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.min(width, height) / 2;
      
      let value = 0;
      const sliceRatio = sliceIndex / totalSlices;
      
      if (pattern === 'chest') {
        const bodyRadius = maxDist * 0.9;
        const lungRadius = maxDist * 0.35;
        const lungOffset = maxDist * 0.3;
        const spineRadius = maxDist * 0.12;
        const lungSize = lungRadius * (0.8 + 0.4 * Math.sin(sliceRatio * Math.PI));
        
        const leftLungX = centerX - lungOffset;
        const leftDist = Math.sqrt((x - leftLungX) ** 2 + dy ** 2);
        
        const rightLungX = centerX + lungOffset;
        const rightDist = Math.sqrt((x - rightLungX) ** 2 + dy ** 2);
        
        const spineDist = Math.sqrt(dx ** 2 + (y - (centerY + maxDist * 0.4)) ** 2);
        
        if (dist > bodyRadius) {
          value = 0;
        } else if (leftDist < lungSize || rightDist < lungSize) {
          value = 200 + Math.random() * 100 + Math.sin(x * 0.1 + sliceIndex) * 30;
        } else if (spineDist < spineRadius) {
          value = 1800 + Math.random() * 200;
        } else {
          value = 1000 + Math.random() * 100 + Math.sin(sliceRatio * 10) * 30;
        }
      } else if (pattern === 'head') {
        const skullRadius = maxDist * 0.85;
        const brainRadius = maxDist * 0.75;
        const ventricleSize = maxDist * 0.15 * Math.sin(sliceRatio * Math.PI);
        
        if (dist > skullRadius) {
          value = 0;
        } else if (dist > brainRadius) {
          value = 2000 + Math.random() * 500;
        } else if (dist < ventricleSize && Math.abs(sliceRatio - 0.5) < 0.3) {
          value = 500 + Math.random() * 50;
        } else {
          const wmRatio = Math.sin(dist * 0.08 + sliceRatio * 3);
          value = 1000 + wmRatio * 100 + Math.random() * 50;
        }
      }
      
      pixels[idx] = Math.max(0, Math.min(4095, Math.round(value)));
    }
  }
  
  return pixels;
}

// Generate UID
function generateUID() {
  return `1.2.826.0.1.3680043.8.1055.1.${Date.now()}.${Math.floor(Math.random() * 1000000)}`;
}

// Create DICOM dataset
function createDicomDataset(options) {
  const {
    patientName = 'Demo^Patient',
    patientId = 'DEMO001',
    studyDescription = 'Demo Study',
    seriesDescription = 'Demo Series',
    modality = 'CT',
    rows = 256,
    columns = 256,
    sliceIndex = 1,
    totalSlices = 1,
    studyInstanceUID,
    seriesInstanceUID,
    sopInstanceUID,
    pattern = 'chest',
    windowCenter = 40,
    windowWidth = 400,
    rescaleIntercept = -1024,
    rescaleSlope = 1
  } = options;
  
  const pixelData = generatePixelData(columns, rows, sliceIndex, totalSlices, pattern);
  
  // Create the dataset
  const dataset = {
    // Patient Module
    PatientName: patientName,
    PatientID: patientId,
    PatientBirthDate: '',
    PatientSex: '',
    
    // Study Module
    StudyInstanceUID: studyInstanceUID,
    StudyDate: '20260203',
    StudyTime: '120000',
    StudyDescription: studyDescription,
    AccessionNumber: '',
    ReferringPhysicianName: '',
    StudyID: '1',
    
    // Series Module
    SeriesInstanceUID: seriesInstanceUID,
    SeriesNumber: 1,
    SeriesDescription: seriesDescription,
    Modality: modality,
    
    // SOP Common Module
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.2', // CT Image Storage
    SOPInstanceUID: sopInstanceUID,
    
    // Image Pixel Module
    SamplesPerPixel: 1,
    PhotometricInterpretation: 'MONOCHROME2',
    Rows: rows,
    Columns: columns,
    BitsAllocated: 16,
    BitsStored: 12,
    HighBit: 11,
    PixelRepresentation: 0,
    
    // CT Image Module
    ImageType: ['ORIGINAL', 'PRIMARY', 'AXIAL'],
    RescaleIntercept: rescaleIntercept,
    RescaleSlope: rescaleSlope,
    RescaleType: 'HU',
    WindowCenter: windowCenter,
    WindowWidth: windowWidth,
    
    // Frame of Reference Module
    FrameOfReferenceUID: studyInstanceUID,
    PositionReferenceIndicator: '',
    
    // Image Plane Module
    PixelSpacing: [1.0, 1.0],
    ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
    ImagePositionPatient: [0, 0, sliceIndex * 5],
    SliceThickness: 5.0,
    SliceLocation: sliceIndex * 5,
    
    // General Image Module
    InstanceNumber: sliceIndex,
    
    // Pixel Data
    PixelData: pixelData.buffer,
    
    _vrMap: {
      PixelData: 'OW'
    }
  };
  
  return dataset;
}

// Write DICOM file
function writeDicomFile(outputPath, dataset) {
  const meta = {
    FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
    MediaStorageSOPClassUID: dataset.SOPClassUID,
    MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
    TransferSyntaxUID: '1.2.840.10008.1.2.1', // Explicit VR Little Endian
    ImplementationClassUID: '1.2.826.0.1.3680043.8.1055.1',
    ImplementationVersionName: 'RadCase'
  };
  
  // Create DicomDict from dataset
  const dicomDict = new DicomDict(meta);
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  
  const buffer = dicomDict.write();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}

// Generate a series
function generateSeries(seriesName, numSlices, options = {}) {
  const seriesDir = path.join(DICOM_DIR, seriesName);
  
  if (fs.existsSync(seriesDir)) {
    fs.rmSync(seriesDir, { recursive: true });
  }
  fs.mkdirSync(seriesDir, { recursive: true });
  
  const studyInstanceUID = generateUID();
  const seriesInstanceUID = generateUID();
  
  console.log(`\n📁 Generating ${seriesName} (${numSlices} slices)...`);
  
  for (let i = 1; i <= numSlices; i++) {
    const filename = `slice_${String(i).padStart(2, '0')}.dcm`;
    const filepath = path.join(seriesDir, filename);
    
    const dataset = createDicomDataset({
      ...options,
      sliceIndex: i,
      totalSlices: numSlices,
      studyInstanceUID,
      seriesInstanceUID,
      sopInstanceUID: generateUID()
    });
    
    writeDicomFile(filepath, dataset);
    process.stdout.write(`\r  Generated: ${i}/${numSlices}`);
  }
  
  console.log(' ✅');
}

// Main
function main() {
  console.log('🏥 RadCase DICOM Demo Generator v2');
  console.log('===================================\n');
  
  fs.mkdirSync(DICOM_DIR, { recursive: true });
  
  generateSeries('demo-chest-ct-50', 50, {
    patientName: 'Demo^ChestCT',
    studyDescription: 'Demo Chest CT',
    seriesDescription: 'Axial Chest',
    pattern: 'chest',
    windowCenter: 40,
    windowWidth: 400,
    rescaleIntercept: -1024,
    rows: 256,
    columns: 256
  });
  
  generateSeries('demo-head-ct-30', 30, {
    patientName: 'Demo^HeadCT',
    studyDescription: 'Demo Head CT',
    seriesDescription: 'Axial Brain',
    pattern: 'head',
    windowCenter: 40,
    windowWidth: 80,
    rescaleIntercept: -1024,
    rows: 256,
    columns: 256
  });
  
  generateSeries('demo-test-10', 10, {
    patientName: 'Demo^Test',
    studyDescription: 'Quick Test',
    seriesDescription: 'Test Series',
    pattern: 'chest',
    windowCenter: 40,
    windowWidth: 400,
    rescaleIntercept: -1024,
    rows: 128,
    columns: 128
  });
  
  console.log('\n✅ Demo DICOM generation complete!');
}

main();
