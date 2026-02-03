#!/usr/bin/env node
/**
 * Download Sample DICOM Series for RadCase
 * 
 * Uses publicly available DICOM datasets from various sources.
 * These are anonymized, educational DICOM files.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const DICOM_DIR = path.join(__dirname, 'dicom');

// Sample DICOM sources (publicly available, educational datasets)
const SAMPLE_SERIES = [
  {
    name: 'chest-ct',
    description: 'Chest CT - Lung window',
    modality: 'CT',
    // Using a GitHub repo with sample DICOMs
    urls: [
      'https://raw.githubusercontent.com/cornerstonejs/cornerstoneWADOImageLoader/master/testImages/CTImage.dcm'
    ],
    windowCenter: -600,
    windowWidth: 1500
  },
  {
    name: 'brain-ct',
    description: 'Head CT - Brain window',
    modality: 'CT',
    urls: [
      'https://raw.githubusercontent.com/cornerstonejs/cornerstoneWADOImageLoader/master/testImages/CTImage.dcm'
    ],
    windowCenter: 40,
    windowWidth: 80
  },
  {
    name: 'mr-brain',
    description: 'MRI Brain - T1',
    modality: 'MR',
    urls: [
      'https://raw.githubusercontent.com/cornerstonejs/cornerstoneWADOImageLoader/master/testImages/MRImage.dcm'
    ],
    windowCenter: 500,
    windowWidth: 1000
  }
];

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
    
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function generateSyntheticDicom(seriesDir, numSlices, metadata) {
  // For now, we'll create placeholder structure
  // In a real scenario, you'd use a DICOM generation library
  console.log(`  Creating ${numSlices} synthetic DICOM slices...`);
  
  // Create info file with metadata
  fs.writeFileSync(path.join(seriesDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
}

async function downloadSeries(series) {
  const seriesDir = path.join(DICOM_DIR, series.name);
  fs.mkdirSync(seriesDir, { recursive: true });
  
  console.log(`\n📥 Downloading: ${series.description}`);
  
  let downloaded = 0;
  for (let i = 0; i < series.urls.length; i++) {
    const url = series.urls[i];
    const filename = `image_${String(i + 1).padStart(4, '0')}.dcm`;
    const destPath = path.join(seriesDir, filename);
    
    try {
      await downloadFile(url, destPath);
      downloaded++;
      process.stdout.write(`\r  Downloaded: ${downloaded}/${series.urls.length}`);
    } catch (err) {
      console.error(`\n  ⚠️  Failed to download ${url}: ${err.message}`);
    }
  }
  
  console.log(`\n  ✅ ${series.name}: ${downloaded} files`);
  
  // Save metadata
  const metadataPath = path.join(seriesDir, 'series-info.json');
  fs.writeFileSync(metadataPath, JSON.stringify({
    name: series.name,
    description: series.description,
    modality: series.modality,
    windowCenter: series.windowCenter,
    windowWidth: series.windowWidth,
    numImages: downloaded
  }, null, 2));
  
  return downloaded;
}

async function main() {
  console.log('🏥 RadCase DICOM Sample Downloader');
  console.log('===================================\n');
  
  // Ensure DICOM directory exists
  fs.mkdirSync(DICOM_DIR, { recursive: true });
  
  // Try to download real samples first
  let totalDownloaded = 0;
  
  for (const series of SAMPLE_SERIES) {
    try {
      const count = await downloadSeries(series);
      totalDownloaded += count;
    } catch (err) {
      console.error(`Failed to download ${series.name}: ${err.message}`);
    }
  }
  
  console.log(`\n✅ Downloaded ${totalDownloaded} DICOM files`);
  console.log('\n📝 To add more DICOM series:');
  console.log('   1. Place DICOM files in radcase/dicom/<series-name>/');
  console.log('   2. Or upload via the web interface');
  console.log('\n💡 For real teaching cases, consider:');
  console.log('   - TCIA (The Cancer Imaging Archive): https://www.cancerimagingarchive.net');
  console.log('   - OsiriX sample data: https://www.osirix-viewer.com/resources/dicom-image-library/');
  console.log('   - Radiopaedia: https://radiopaedia.org (case exports)');
}

main().catch(console.error);
