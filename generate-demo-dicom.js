#!/usr/bin/env node
/**
 * Generate Synthetic DICOM Series for RadCase Demo
 * Creates proper multi-slice DICOM series with unique images per slice
 */

const fs = require('fs');
const path = require('path');

const DICOM_DIR = path.join(__dirname, 'dicom');

// DICOM file structure constants
const PREAMBLE = Buffer.alloc(128, 0);
const MAGIC = Buffer.from('DICM');

// Helper to create DICOM tag
function createTag(group, element) {
  const buf = Buffer.alloc(4);
  buf.writeUInt16LE(group, 0);
  buf.writeUInt16LE(element, 2);
  return buf;
}

// Helper to create explicit VR element
function createElement(group, element, vr, value) {
  const tag = createTag(group, element);
  const vrBuf = Buffer.from(vr);
  
  let valueBuf;
  if (Buffer.isBuffer(value)) {
    valueBuf = value;
  } else if (typeof value === 'string') {
    valueBuf = Buffer.from(value);
    // Pad to even length
    if (valueBuf.length % 2 !== 0) {
      valueBuf = Buffer.concat([valueBuf, Buffer.from(' ')]);
    }
  } else if (typeof value === 'number') {
    if (vr === 'US') {
      valueBuf = Buffer.alloc(2);
      valueBuf.writeUInt16LE(value, 0);
    } else if (vr === 'UL') {
      valueBuf = Buffer.alloc(4);
      valueBuf.writeUInt32LE(value, 0);
    } else if (vr === 'SS') {
      valueBuf = Buffer.alloc(2);
      valueBuf.writeInt16LE(value, 0);
    } else if (vr === 'DS' || vr === 'IS') {
      valueBuf = Buffer.from(String(value));
      if (valueBuf.length % 2 !== 0) {
        valueBuf = Buffer.concat([valueBuf, Buffer.from(' ')]);
      }
    }
  }
  
  // For OB, OW, UN, UC, UR, UT, SQ - use 4-byte length (after 2 reserved bytes)
  const longVRs = ['OB', 'OW', 'UN', 'UC', 'UR', 'UT', 'SQ'];
  
  if (longVRs.includes(vr)) {
    const reserved = Buffer.alloc(2, 0);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(valueBuf.length, 0);
    return Buffer.concat([tag, vrBuf, reserved, lenBuf, valueBuf]);
  } else {
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16LE(valueBuf.length, 0);
    return Buffer.concat([tag, vrBuf, lenBuf, valueBuf]);
  }
}

// Generate synthetic CT-like pixel data
function generatePixelData(width, height, sliceIndex, totalSlices, pattern = 'chest') {
  const pixels = Buffer.alloc(width * height * 2); // 16-bit pixels
  
  const centerX = width / 2;
  const centerY = height / 2;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 2;
      
      // Distance from center
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.min(width, height) / 2;
      
      let value = 0;
      
      if (pattern === 'chest') {
        // Simulate chest CT - body outline with lungs
        const bodyRadius = maxDist * 0.9;
        const lungRadius = maxDist * 0.35;
        const lungOffset = maxDist * 0.3;
        const spineRadius = maxDist * 0.12;
        
        // Slice-dependent variations
        const sliceRatio = sliceIndex / totalSlices;
        const lungSize = lungRadius * (0.8 + 0.4 * Math.sin(sliceRatio * Math.PI));
        
        // Left lung center
        const leftLungX = centerX - lungOffset;
        const leftDist = Math.sqrt((x - leftLungX) ** 2 + dy ** 2);
        
        // Right lung center  
        const rightLungX = centerX + lungOffset;
        const rightDist = Math.sqrt((x - rightLungX) ** 2 + dy ** 2);
        
        // Spine (posterior)
        const spineDist = Math.sqrt(dx ** 2 + (y - (centerY + maxDist * 0.4)) ** 2);
        
        if (dist > bodyRadius) {
          // Outside body - air
          value = -1000 + Math.random() * 50;
        } else if (leftDist < lungSize || rightDist < lungSize) {
          // Lungs - air with some texture
          value = -800 + Math.random() * 200 + Math.sin(x * 0.2) * 50 + Math.sin(y * 0.2) * 50;
          // Add some "vessels" based on slice
          if (Math.random() < 0.02) {
            value = 40 + Math.random() * 30;
          }
        } else if (spineDist < spineRadius) {
          // Spine - bone
          value = 300 + Math.random() * 200;
        } else {
          // Soft tissue
          value = 30 + Math.random() * 40 + Math.sin(sliceRatio * 10) * 10;
        }
      } else if (pattern === 'head') {
        // Simulate head CT
        const skullRadius = maxDist * 0.85;
        const brainRadius = maxDist * 0.75;
        
        // Slice-dependent - ventricles larger in middle slices
        const sliceRatio = sliceIndex / totalSlices;
        const ventricleSize = maxDist * 0.15 * Math.sin(sliceRatio * Math.PI);
        
        if (dist > skullRadius) {
          // Outside skull - air
          value = -1000 + Math.random() * 20;
        } else if (dist > brainRadius) {
          // Skull bone
          value = 800 + Math.random() * 400;
        } else if (dist < ventricleSize && Math.abs(sliceRatio - 0.5) < 0.3) {
          // Ventricles (CSF)
          value = 5 + Math.random() * 10;
        } else {
          // Brain tissue - gray/white matter variation
          const wmRatio = Math.sin(dist * 0.1 + sliceRatio * 5);
          value = 30 + wmRatio * 10 + Math.random() * 10;
        }
      }
      
      // Convert to unsigned 16-bit (add 1024 offset for CT numbers)
      const unsigned = Math.max(0, Math.min(65535, Math.round(value + 1024)));
      pixels.writeUInt16LE(unsigned, idx);
    }
  }
  
  return pixels;
}

// Create a DICOM file
function createDicomFile(outputPath, options) {
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
    sliceThickness = 5.0,
    pixelSpacing = '1.0\\1.0',
    studyInstanceUid,
    seriesInstanceUid,
    sopInstanceUid,
    pattern = 'chest',
    windowCenter = 40,
    windowWidth = 400
  } = options;
  
  // Generate UIDs if not provided
  const uid = () => `1.2.826.0.1.3680043.8.1055.1.${Date.now()}.${Math.floor(Math.random() * 1000000)}`;
  const studyUid = studyInstanceUid || uid();
  const seriesUid = seriesInstanceUid || uid();
  const sopUid = sopInstanceUid || uid();
  
  // Generate pixel data
  const pixelData = generatePixelData(columns, rows, sliceIndex, totalSlices, pattern);
  
  // Build DICOM elements
  const elements = [
    // File Meta Information
    createElement(0x0002, 0x0001, 'OB', Buffer.from([0x00, 0x01])), // File Meta Info Version
    createElement(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.2'), // Media Storage SOP Class (CT)
    createElement(0x0002, 0x0003, 'UI', sopUid), // Media Storage SOP Instance UID
    createElement(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1'), // Transfer Syntax (Explicit VR Little Endian)
    
    // Patient Module
    createElement(0x0010, 0x0010, 'PN', patientName),
    createElement(0x0010, 0x0020, 'LO', patientId),
    
    // Study Module  
    createElement(0x0008, 0x0020, 'DA', '20260203'), // Study Date
    createElement(0x0008, 0x0030, 'TM', '120000'), // Study Time
    createElement(0x0008, 0x1030, 'LO', studyDescription),
    createElement(0x0020, 0x000D, 'UI', studyUid), // Study Instance UID
    
    // Series Module
    createElement(0x0008, 0x0060, 'CS', modality),
    createElement(0x0008, 0x103E, 'LO', seriesDescription),
    createElement(0x0020, 0x000E, 'UI', seriesUid), // Series Instance UID
    createElement(0x0020, 0x0011, 'IS', 1), // Series Number
    
    // Image Module
    createElement(0x0008, 0x0018, 'UI', sopUid), // SOP Instance UID
    createElement(0x0020, 0x0013, 'IS', sliceIndex), // Instance Number
    createElement(0x0020, 0x1041, 'DS', sliceIndex * sliceThickness), // Slice Location
    
    // Image Pixel Module
    createElement(0x0028, 0x0002, 'US', 1), // Samples per Pixel
    createElement(0x0028, 0x0004, 'CS', 'MONOCHROME2'), // Photometric Interpretation
    createElement(0x0028, 0x0010, 'US', rows), // Rows
    createElement(0x0028, 0x0011, 'US', columns), // Columns
    createElement(0x0028, 0x0030, 'DS', pixelSpacing), // Pixel Spacing
    createElement(0x0028, 0x0100, 'US', 16), // Bits Allocated
    createElement(0x0028, 0x0101, 'US', 12), // Bits Stored
    createElement(0x0028, 0x0102, 'US', 11), // High Bit
    createElement(0x0028, 0x0103, 'US', 0), // Pixel Representation (unsigned)
    createElement(0x0028, 0x1050, 'DS', windowCenter), // Window Center
    createElement(0x0028, 0x1051, 'DS', windowWidth), // Window Width
    createElement(0x0028, 0x1052, 'DS', -1024), // Rescale Intercept
    createElement(0x0028, 0x1053, 'DS', 1), // Rescale Slope
    createElement(0x0018, 0x0050, 'DS', sliceThickness), // Slice Thickness
    
    // Pixel Data
    createElement(0x7FE0, 0x0010, 'OW', pixelData),
  ];
  
  // Calculate File Meta Information Group Length
  const metaElements = elements.filter(e => e.readUInt16LE(0) === 0x0002);
  const metaLength = metaElements.slice(1).reduce((sum, e) => sum + e.length, 0);
  const groupLengthElement = createElement(0x0002, 0x0000, 'UL', metaLength);
  
  // Insert group length at the beginning of meta elements
  elements.unshift(groupLengthElement);
  
  // Combine all parts
  const dicomData = Buffer.concat([PREAMBLE, MAGIC, ...elements]);
  
  fs.writeFileSync(outputPath, dicomData);
}

// Generate a series of DICOM files
function generateSeries(seriesName, numSlices, options = {}) {
  const seriesDir = path.join(DICOM_DIR, seriesName);
  
  // Clean up existing
  if (fs.existsSync(seriesDir)) {
    fs.rmSync(seriesDir, { recursive: true });
  }
  fs.mkdirSync(seriesDir, { recursive: true });
  
  const studyUid = `1.2.826.0.1.3680043.8.1055.1.${Date.now()}`;
  const seriesUid = `1.2.826.0.1.3680043.8.1055.1.${Date.now() + 1}`;
  
  console.log(`\n📁 Generating ${seriesName} (${numSlices} slices)...`);
  
  for (let i = 1; i <= numSlices; i++) {
    const filename = `slice_${String(i).padStart(2, '0')}.dcm`;
    const filepath = path.join(seriesDir, filename);
    
    createDicomFile(filepath, {
      ...options,
      sliceIndex: i,
      totalSlices: numSlices,
      studyInstanceUid: studyUid,
      seriesInstanceUid: seriesUid,
    });
    
    process.stdout.write(`\r  Generated: ${i}/${numSlices}`);
  }
  
  console.log(' ✅');
}

// Main function
function main() {
  console.log('🏥 RadCase DICOM Demo Generator');
  console.log('================================\n');
  
  fs.mkdirSync(DICOM_DIR, { recursive: true });
  
  // Generate chest CT series
  generateSeries('demo-chest-ct-50', 50, {
    patientName: 'Demo^ChestCT',
    studyDescription: 'Demo Chest CT',
    seriesDescription: 'Axial Chest',
    pattern: 'chest',
    windowCenter: -600,
    windowWidth: 1500,
    rows: 256,
    columns: 256
  });
  
  // Generate head CT series
  generateSeries('demo-head-ct-30', 30, {
    patientName: 'Demo^HeadCT', 
    studyDescription: 'Demo Head CT',
    seriesDescription: 'Axial Brain',
    pattern: 'head',
    windowCenter: 40,
    windowWidth: 80,
    rows: 256,
    columns: 256
  });
  
  // Generate a smaller test series
  generateSeries('demo-test-10', 10, {
    patientName: 'Demo^Test',
    studyDescription: 'Quick Test',
    seriesDescription: 'Test Series',
    pattern: 'chest',
    windowCenter: 40,
    windowWidth: 400,
    rows: 128,
    columns: 128
  });
  
  console.log('\n✅ Demo DICOM generation complete!');
  console.log('\n📊 Generated series:');
  console.log('   - demo-chest-ct-50: 50 slices (Chest CT pattern)');
  console.log('   - demo-head-ct-30: 30 slices (Head CT pattern)');
  console.log('   - demo-test-10: 10 slices (Quick test)');
}

main();
