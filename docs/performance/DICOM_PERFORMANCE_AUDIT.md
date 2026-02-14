# DICOM Performance Audit

**Priority:** P1 (Complete by Feb 15)  
**Author:** Architecture & Performance Lead  
**Focus:** Cornerstone.js optimization & loading time bottlenecks

---

## Performance Baseline Analysis

### Current DICOM Loading Workflow

**From codebase analysis (`dicom-viewer.js`):**

1. **Series Loading:** `/api/dicom/:caseId` → JSON metadata
2. **Image Loading:** `/api/dicom/:caseId/files/:filename` → Raw DICOM file
3. **Cornerstone Parsing:** Client-side DICOM to viewport rendering
4. **Display:** Image stack navigation + windowing controls

**Current Load Time Estimate:** 2-5 seconds per series (unoptimized)

### Performance Bottlenecks Identified

#### 🚨 Critical Issues

**1. Sequential File Loading**
```javascript
// Current implementation (dicom-viewer.js line ~200)
for (let i = 0; i < imageFiles.length; i++) {
    const imageId = `wadouri:/api/dicom/${caseId}/files/${imageFiles[i]}`;
    this.imageIds.push(imageId);
}
```
**Problem:** Each DICOM file loaded sequentially, blocking subsequent loads  
**Impact:** N × (network latency + parse time) for N-image series

**2. Full DICOM File Transfer**
```javascript
// Server endpoint transfers entire DICOM file
app.get('/api/dicom/:caseId/files/:filename', (req, res) => {
    const filePath = path.join(DICOM_DIR, req.params.caseId, req.params.filename);
    res.sendFile(filePath); // Entire file, ~1-10MB each
});
```
**Problem:** No compression, no progressive loading  
**Impact:** High bandwidth usage, slow initial display

**3. Client-Side Parsing Bottleneck**
```javascript
// Cornerstone loads and parses each file individually
cornerstone.loadAndCacheImage(imageId).then((image) => {
    // Blocking operation on main thread
});
```
**Problem:** Main thread blocking during DICOM parsing  
**Impact:** UI freezes during load

**4. No Caching Strategy**
```javascript
// No cache headers, repeated downloads
res.sendFile(filePath); // No cache-control headers
```
**Problem:** Same DICOM files re-downloaded on revisit  
**Impact:** Unnecessary bandwidth + loading time

#### ⚠️ Secondary Issues

**5. Window/Level Calculation**
- Server calculates window/level for each request
- Could be pre-computed and cached
- Repeated calculations for identical series

**6. Thumbnail Generation**
- Sharp.js thumbnail generation on-demand
- No thumbnail caching across sessions
- Memory-intensive server operations

---

## Optimization Strategy

### 🎯 Phase 1: Quick Wins (Sprint 1)

#### A. Parallel DICOM Loading
**Current:** Sequential loading  
**Target:** Parallel loading with concurrency limits

```javascript
// Optimized parallel loading
class OptimizedDicomLoader {
  constructor(maxConcurrency = 6) {
    this.maxConcurrency = maxConcurrency;
    this.loadQueue = [];
    this.activeLoads = 0;
  }
  
  async loadSeries(imageIds) {
    const loadPromises = imageIds.map(imageId => 
      this.loadImageWithLimit(imageId)
    );
    
    // Load first few images immediately for progressive display
    const priorityImages = loadPromises.slice(0, 3);
    const remainingImages = loadPromises.slice(3);
    
    const firstImages = await Promise.all(priorityImages);
    
    // Load remaining in background
    Promise.all(remainingImages).then(() => {
      this.notifyLoadComplete();
    });
    
    return firstImages;
  }
  
  async loadImageWithLimit(imageId) {
    if (this.activeLoads >= this.maxConcurrency) {
      await this.waitForSlot();
    }
    
    this.activeLoads++;
    try {
      return await cornerstone.loadAndCacheImage(imageId);
    } finally {
      this.activeLoads--;
    }
  }
}
```

**Expected Impact:** 40-60% reduction in initial display time

#### B. DICOM File Compression
**Server-side compression:** Enable gzip compression for DICOM files

```javascript
// server.js enhancement
const compression = require('compression');

// Custom compression for DICOM files
app.use('/api/dicom', compression({
  filter: (req, res) => {
    // Compress DICOM files (they compress well ~50-70%)
    return req.path.includes('/files/');
  },
  level: 6, // Balanced compression speed/ratio
}));
```

**Expected Impact:** 50-70% bandwidth reduction

#### C. Browser Caching Headers
```javascript
// Enhanced DICOM file serving
app.get('/api/dicom/:caseId/files/:filename', (req, res) => {
  const filePath = path.join(DICOM_DIR, req.params.caseId, req.params.filename);
  
  // Aggressive caching for DICOM files (immutable)
  res.set({
    'Cache-Control': 'public, max-age=2592000, immutable', // 30 days
    'ETag': generateFileETag(filePath),
    'Content-Type': 'application/dicom'
  });
  
  res.sendFile(filePath);
});
```

**Expected Impact:** Instant load for revisited cases

### 🚀 Phase 2: Advanced Optimizations (Sprint 2-3)

#### D. DICOM Streaming Protocol
**Progressive JPEG 2000 or WebP conversion for web delivery**

```javascript
// Convert DICOM to web-optimized format
class DicomWebOptimizer {
  async convertToWebFormat(dicomPath, outputPath) {
    // Use Sharp.js or specialized DICOM library
    const dicomData = await this.parseDicom(dicomPath);
    
    // Convert to progressive WebP with medical metadata preserved
    const webpBuffer = await sharp(dicomData.pixelData)
      .webp({ 
        quality: 90,
        progressive: true,
        metadata: dicomData.metadata 
      })
      .toBuffer();
      
    return webpBuffer;
  }
}
```

#### E. Web Workers for DICOM Parsing
```javascript
// Offload DICOM parsing to web workers
class DicomWorkerManager {
  constructor() {
    this.workers = [];
    this.initializeWorkers();
  }
  
  initializeWorkers() {
    const numWorkers = Math.min(4, navigator.hardwareConcurrency);
    for (let i = 0; i < numWorkers; i++) {
      this.workers.push(new Worker('dicom-parser-worker.js'));
    }
  }
  
  async parseInWorker(dicomBuffer) {
    const worker = this.getAvailableWorker();
    return new Promise((resolve, reject) => {
      worker.postMessage({ type: 'PARSE_DICOM', data: dicomBuffer });
      worker.onmessage = (e) => {
        if (e.data.type === 'PARSE_COMPLETE') {
          resolve(e.data.image);
        }
      };
    });
  }
}
```

#### F. DICOM Tile Server (Advanced)
**For very large images (pathology, high-res CT/MR):**

```javascript
// Implement DICOM Deep Zoom / Tile server
app.get('/api/dicom/:caseId/tiles/:level/:x/:y', (req, res) => {
  const { level, x, y } = req.params;
  const tileSize = 256;
  
  // Generate tile from DICOM data
  const tile = await generateDicomTile(caseId, level, x, y, tileSize);
  
  res.set('Content-Type', 'image/jpeg');
  res.send(tile);
});
```

---

## Performance Testing Strategy

### Automated Performance Tests

#### A. Load Time Benchmarking
**File:** `tests/dicom-performance.js`

```javascript
const { performance } = require('perf_hooks');

class DicomPerformanceTester {
  async benchmarkLoadTime(caseId) {
    const startTime = performance.now();
    
    // Test series loading
    const seriesResponse = await fetch(`/api/dicom/${caseId}`);
    const seriesData = await seriesResponse.json();
    
    const imageLoadPromises = seriesData.files.map(async (filename) => {
      const imageStart = performance.now();
      const response = await fetch(`/api/dicom/${caseId}/files/${filename}`);
      await response.blob(); // Simulate full download
      return performance.now() - imageStart;
    });
    
    const imageTimes = await Promise.all(imageLoadPromises);
    const totalTime = performance.now() - startTime;
    
    return {
      totalLoadTime: totalTime,
      averageImageTime: imageTimes.reduce((a, b) => a + b) / imageTimes.length,
      imageCount: imageTimes.length,
      throughput: imageTimes.length / (totalTime / 1000) // images/second
    };
  }
  
  async runBenchmarkSuite() {
    const testCases = ['case-1', 'case-2', 'case-3']; // Different sizes
    const results = [];
    
    for (const caseId of testCases) {
      console.log(`Testing case: ${caseId}`);
      const result = await this.benchmarkLoadTime(caseId);
      results.push({ caseId, ...result });
    }
    
    return results;
  }
}
```

#### B. Cornerstone.js Performance Profiling
```javascript
// Client-side performance monitoring
class CornerstoneProfiler {
  constructor() {
    this.metrics = {
      loadTimes: [],
      renderTimes: [],
      memoryUsage: []
    };
  }
  
  profileImageLoad(imageId) {
    const startTime = performance.now();
    const startMemory = performance.memory?.usedJSHeapSize || 0;
    
    return cornerstone.loadAndCacheImage(imageId).then((image) => {
      const loadTime = performance.now() - startTime;
      const endMemory = performance.memory?.usedJSHeapSize || 0;
      
      this.metrics.loadTimes.push(loadTime);
      this.metrics.memoryUsage.push(endMemory - startMemory);
      
      // Profile rendering time
      const renderStart = performance.now();
      cornerstone.displayImage(element, image);
      const renderTime = performance.now() - renderStart;
      
      this.metrics.renderTimes.push(renderTime);
      
      return image;
    });
  }
  
  generateReport() {
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    
    return {
      averageLoadTime: avg(this.metrics.loadTimes),
      averageRenderTime: avg(this.metrics.renderTimes),
      averageMemoryUsage: avg(this.metrics.memoryUsage),
      totalMemoryUsage: this.metrics.memoryUsage.reduce((a, b) => a + b, 0)
    };
  }
}
```

### Real-User Monitoring (RUM)

#### C. Client Performance Tracking
```javascript
// Track real user performance metrics
class DicomRUM {
  trackSeriesLoad(caseId, startTime, endTime, imageCount) {
    const metrics = {
      caseId,
      loadTime: endTime - startTime,
      imageCount,
      userAgent: navigator.userAgent,
      connectionType: navigator.connection?.effectiveType,
      timestamp: Date.now()
    };
    
    // Send to analytics endpoint
    fetch('/api/analytics/dicom-performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics)
    });
  }
}
```

---

## Performance Targets & KPIs

### Current State (Baseline)
| Metric | Current Value | Target Value | Priority |
|--------|---------------|--------------|----------|
| First Image Display | 2-3 seconds | <500ms | P0 |
| Full Series Load | 10-15 seconds | <3 seconds | P1 |
| Bandwidth Usage | 10-50MB/series | 3-15MB/series | P1 |
| Memory Usage | 100-500MB | <200MB | P2 |
| Cache Hit Rate | 0% | >80% | P1 |

### Success Criteria
- [ ] **Sub-second first image display** for typical cases
- [ ] **3x bandwidth reduction** through compression + optimization
- [ ] **5x improvement** in series loading time
- [ ] **80%+ cache hit rate** for revisited cases
- [ ] **Zero UI blocking** during DICOM loads

### Monitoring Dashboard
```javascript
// Real-time performance monitoring
const metrics = {
  'dicom.load_time.p95': '< 2000ms',
  'dicom.bandwidth.daily': '< 10GB',
  'dicom.cache_hit_rate': '> 80%',
  'dicom.error_rate': '< 1%',
  'cornerstone.memory_usage': '< 200MB'
};
```

---

## Implementation Plan

### Sprint 1 (Feb 10-15)
- [ ] **Day 1:** Performance baseline establishment
- [ ] **Day 2:** Parallel loading implementation
- [ ] **Day 3:** Compression + caching headers
- [ ] **Day 4:** Performance testing suite
- [ ] **Day 5:** Optimization validation + documentation

### Sprint 2 (Future)
- [ ] Web worker DICOM parsing
- [ ] Progressive image loading
- [ ] DICOM tile server evaluation

### Recommended Tools
- **Claude Code:** For implementing performance optimizations
- **Performance monitoring:** Client-side profiling tools
- **Load testing:** Artillery.js or similar for stress testing

---

**Status:** 📊 Performance audit documented  
**Next:** Caching strategy design  
**Dependencies:** Performance testing environment setup