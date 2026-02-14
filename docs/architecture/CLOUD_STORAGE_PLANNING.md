# Cloud Storage Migration Planning

**Priority:** P1 (Complete by Feb 15)  
**Author:** Architecture & Performance Lead  
**Focus:** Local filesystem → Cloud storage + CDN for scalability

---

## Current Storage Analysis

### Local Filesystem Limitations

**Current Structure:**
```
/radcase/
├── dicom/           # DICOM files (~1-10MB each)
├── uploads/         # User uploads
├── thumbnails/      # Generated thumbnails (~50KB each)
└── public/          # Static web assets
```

**Current Size:** ~2GB DICOM data + ~100MB other files

#### Critical Issues
🚨 **Single Point of Failure:** Local disk failure = total data loss  
🚨 **No Redundancy:** No backup strategy for critical teaching data  
🚨 **Bandwidth Bottleneck:** Server bandwidth limits DICOM download speed  
🚨 **No Global Distribution:** Users worldwide experience high latency  
🚨 **Scaling Limits:** Local disk space constrains growth  
🚨 **No Version Control:** File overwrites are permanent

#### Performance Impact
- **DICOM Load Time:** 2-5 seconds (server bandwidth limited)
- **Concurrent Downloads:** Limited by server connection pool
- **Global Latency:** 200-2000ms depending on user location
- **Backup Time:** Manual, time-intensive process

---

## Cloud Storage Strategy

### Multi-Tier Storage Architecture

#### Tier 1: Hot Storage (Frequently Accessed)
**Service:** Amazon S3 Standard or Google Cloud Storage Standard  
**Use Case:** Active teaching cases, recent uploads  
**Data:** ~80% of access patterns, ~20% of data volume

#### Tier 2: Warm Storage (Occasionally Accessed)
**Service:** S3 Standard-IA or GCS Nearline  
**Use Case:** Archived cases, older teaching materials  
**Data:** ~15% of access patterns, ~60% of data volume

#### Tier 3: Cold Storage (Rarely Accessed)
**Service:** S3 Glacier or GCS Coldline  
**Use Case:** Long-term archives, compliance backups  
**Data:** ~5% of access patterns, ~20% of data volume

### Storage Categories

#### A. DICOM Files (Primary Storage)
```
Bucket: radcase-dicom-{environment}
Structure: /{institution_id}/{case_id}/{series_id}/
Files: Original DICOM files (.dcm)
Size: 1-50MB per file
Access: Frequent during active learning
CDN: CloudFront/Cloud CDN required
```

#### B. Processed Images (Cache Storage)
```
Bucket: radcase-images-{environment}
Structure: /{case_id}/{type}/{resolution}/
Files: WebP/JPEG converted images
Size: 100KB-2MB per file
Access: Very frequent (web display)
CDN: Essential for performance
```

#### C. Thumbnails (Fast Access)
```
Bucket: radcase-thumbnails-{environment}
Structure: /{case_id}/{series_id}/
Files: Small preview images
Size: 20-100KB per file
Access: Extremely frequent
CDN: Global edge caching
```

#### D. User Uploads (Managed Storage)
```
Bucket: radcase-uploads-{environment}
Structure: /{user_id}/{upload_date}/
Files: User-submitted DICOM files
Size: Variable
Access: Moderate
Processing: Virus scan + validation pipeline
```

---

## Cloud Provider Analysis

### Option A: Amazon Web Services (Recommended)

#### Services Stack
- **Storage:** S3 Standard, S3 Standard-IA, S3 Glacier
- **CDN:** CloudFront with global edge locations
- **Processing:** Lambda for image processing + metadata extraction
- **Security:** IAM roles, S3 bucket policies, KMS encryption
- **Monitoring:** CloudWatch metrics + S3 analytics

#### Cost Analysis (Monthly - 1000 cases, 100GB)
```
S3 Standard (Hot): $2.30/month (100GB)
S3 Standard-IA (Warm): $1.25/month (50GB)
CloudFront: $8.50/month (1TB transfer)
Lambda processing: $5.00/month (compute)
Total: ~$17/month base cost
```

#### Implementation Architecture
```javascript
// AWS S3 Configuration
const AWS = require('aws-sdk');

const s3Config = {
  region: process.env.AWS_REGION || 'us-west-2',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  
  // Performance optimizations
  httpOptions: {
    timeout: 120000,
    agent: new AWS.NodeHttpClient({
      keepAlive: true,
      maxSockets: 25
    })
  }
};

const s3 = new AWS.S3(s3Config);

class S3StorageManager {
  constructor() {
    this.buckets = {
      dicom: `radcase-dicom-${process.env.NODE_ENV}`,
      images: `radcase-images-${process.env.NODE_ENV}`,
      thumbnails: `radcase-thumbnails-${process.env.NODE_ENV}`,
      uploads: `radcase-uploads-${process.env.NODE_ENV}`
    };
  }
  
  async uploadDicomFile(caseId, seriesId, filename, buffer) {
    const key = `${caseId}/${seriesId}/${filename}`;
    
    const params = {
      Bucket: this.buckets.dicom,
      Key: key,
      Body: buffer,
      ContentType: 'application/dicom',
      
      // Performance optimizations
      StorageClass: 'STANDARD',
      ServerSideEncryption: 'AES256',
      
      // Metadata for indexing
      Metadata: {
        'case-id': caseId,
        'series-id': seriesId,
        'uploaded-at': new Date().toISOString()
      },
      
      // Cache control for CDN
      CacheControl: 'public, max-age=2592000, immutable' // 30 days
    };
    
    return await s3.upload(params).promise();
  }
  
  async getDicomFileUrl(caseId, seriesId, filename, expiresIn = 3600) {
    const key = `${caseId}/${seriesId}/${filename}`;
    
    // Generate presigned URL for direct download
    return s3.getSignedUrl('getObject', {
      Bucket: this.buckets.dicom,
      Key: key,
      Expires: expiresIn
    });
  }
  
  // Multipart upload for large DICOM series
  async uploadLargeDicomSeries(caseId, seriesId, files) {
    const uploadPromises = files.map(async (file) => {
      if (file.size > 100 * 1024 * 1024) { // >100MB
        return this.multipartUpload(caseId, seriesId, file);
      } else {
        return this.uploadDicomFile(caseId, seriesId, file.name, file.buffer);
      }
    });
    
    return Promise.all(uploadPromises);
  }
}
```

### Option B: Google Cloud Platform

#### Services Stack
- **Storage:** Cloud Storage Standard, Nearline, Coldline
- **CDN:** Cloud CDN + Global Load Balancer
- **Processing:** Cloud Functions for serverless processing
- **Security:** IAM, bucket policies, encryption at rest
- **Monitoring:** Cloud Monitoring + Storage analytics

#### Cost Analysis (Monthly - same workload)
```
Cloud Storage Standard: $2.00/month (100GB)
Cloud Storage Nearline: $1.00/month (50GB)
Cloud CDN: $8.00/month (1TB transfer)
Cloud Functions: $4.00/month (compute)
Total: ~$15/month base cost
```

### Option C: Multi-Cloud Strategy (Advanced)

#### Hybrid Architecture
- **Primary:** AWS S3 for DICOM storage
- **CDN:** Cloudflare (better global performance + cost)
- **Backup:** Google Cloud for disaster recovery
- **Processing:** Mix of AWS Lambda + local processing

---

## Migration Implementation Plan

### Phase 1: Infrastructure Setup

#### A. S3 Bucket Configuration
```bash
# AWS CLI commands for bucket setup
aws s3api create-bucket \
  --bucket radcase-dicom-prod \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket radcase-dicom-prod \
  --versioning-configuration Status=Enabled

# Configure lifecycle policies
aws s3api put-bucket-lifecycle-configuration \
  --bucket radcase-dicom-prod \
  --lifecycle-configuration file://lifecycle-policy.json
```

#### B. Lifecycle Policy Configuration
```json
{
  "Rules": [
    {
      "ID": "DicomLifecycle",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 365,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

### Phase 2: Dual-Write Migration Strategy

#### A. Parallel Storage Implementation
```javascript
// Dual-write to local + cloud during migration
class DualStorageManager {
  constructor(localStorage, cloudStorage) {
    this.local = localStorage;
    this.cloud = cloudStorage;
    this.useCloud = process.env.USE_CLOUD_STORAGE === 'true';
  }
  
  async storeDicomFile(caseId, seriesId, filename, buffer) {
    const results = await Promise.allSettled([
      this.local.store(caseId, seriesId, filename, buffer),
      this.cloud.uploadDicomFile(caseId, seriesId, filename, buffer)
    ]);
    
    // Log any failures but don't fail the request
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Storage ${index === 0 ? 'local' : 'cloud'} failed:`, result.reason);
      }
    });
    
    return results;
  }
  
  async getDicomFile(caseId, seriesId, filename) {
    if (this.useCloud) {
      try {
        return await this.cloud.getDicomFileUrl(caseId, seriesId, filename);
      } catch (error) {
        console.warn('Cloud storage failed, falling back to local:', error);
        return this.local.getFileUrl(caseId, seriesId, filename);
      }
    } else {
      return this.local.getFileUrl(caseId, seriesId, filename);
    }
  }
}
```

#### B. Background Migration Script
```javascript
// Migrate existing files to cloud storage
class BackgroundMigrator {
  constructor(localPath, cloudStorage) {
    this.localPath = localPath;
    this.cloud = cloudStorage;
    this.batchSize = 10; // Process 10 files at a time
  }
  
  async migrateAllFiles() {
    console.log('Starting background migration to cloud storage...');
    
    const fileList = await this.scanLocalFiles();
    console.log(`Found ${fileList.length} files to migrate`);
    
    let migrated = 0;
    let failed = 0;
    
    for (let i = 0; i < fileList.length; i += this.batchSize) {
      const batch = fileList.slice(i, i + this.batchSize);
      
      const results = await Promise.allSettled(
        batch.map(file => this.migrateFile(file))
      );
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          migrated++;
        } else {
          failed++;
          console.error('Migration failed:', result.reason);
        }
      });
      
      // Progress logging
      console.log(`Migration progress: ${migrated}/${fileList.length} (${failed} failed)`);
      
      // Rate limiting - don't overwhelm cloud API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('Migration completed!', { migrated, failed });
  }
  
  async migrateFile(filePath) {
    const buffer = await fs.readFile(filePath);
    const pathParts = filePath.split('/');
    const filename = pathParts.pop();
    const seriesId = pathParts.pop();
    const caseId = pathParts.pop();
    
    return await this.cloud.uploadDicomFile(caseId, seriesId, filename, buffer);
  }
}
```

### Phase 3: CDN Configuration

#### A. CloudFront Distribution Setup
```javascript
// CloudFront configuration for DICOM files
const cloudfrontConfig = {
  DistributionConfig: {
    CallerReference: `radcase-dicom-${Date.now()}`,
    Comment: 'RadCase DICOM CDN Distribution',
    
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: 'S3-radcase-dicom-prod',
          DomainName: 'radcase-dicom-prod.s3.us-west-2.amazonaws.com',
          S3OriginConfig: {
            OriginAccessIdentity: 'origin-access-identity/cloudfront/ABCDEFG1234567'
          }
        }
      ]
    },
    
    DefaultCacheBehavior: {
      TargetOriginId: 'S3-radcase-dicom-prod',
      ViewerProtocolPolicy: 'redirect-to-https',
      
      // Cache settings optimized for DICOM
      CachePolicyId: 'customDicomCachePolicy',
      Compress: true,
      
      // TTL settings
      MinTTL: 86400,      // 1 day
      DefaultTTL: 2592000, // 30 days
      MaxTTL: 31536000    // 1 year
    },
    
    // Global distribution for low latency
    PriceClass: 'PriceClass_All',
    Enabled: true
  }
};
```

#### B. Cache Optimization
```javascript
// Custom cache headers for different content types
function setCacheHeaders(filename, res) {
  const extension = path.extname(filename).toLowerCase();
  
  switch (extension) {
    case '.dcm':
      // DICOM files - immutable, long cache
      res.set('Cache-Control', 'public, max-age=2592000, immutable');
      break;
    case '.webp':
    case '.jpg':
      // Processed images - moderate cache
      res.set('Cache-Control', 'public, max-age=86400');
      break;
    case '.json':
      // Metadata - short cache
      res.set('Cache-Control', 'public, max-age=300');
      break;
    default:
      res.set('Cache-Control', 'public, max-age=3600');
  }
  
  // Add ETag for validation
  res.set('ETag', generateETag(filename));
}
```

---

## Performance Optimization

### Intelligent Image Processing

#### A. On-Demand Processing Pipeline
```javascript
// Serverless image processing with AWS Lambda
class DicomProcessor {
  async processOnUpload(event) {
    const { bucket, key } = event.Records[0].s3;
    
    try {
      // Download DICOM from S3
      const dicomBuffer = await s3.getObject({ Bucket: bucket, Key: key }).promise();
      
      // Extract metadata
      const metadata = await this.extractDicomMetadata(dicomBuffer.Body);
      
      // Generate multiple formats
      const formats = await Promise.all([
        this.generateWebPVersion(dicomBuffer.Body, { quality: 90 }),
        this.generateThumbnail(dicomBuffer.Body, { size: 256 }),
        this.generateThumbnail(dicomBuffer.Body, { size: 64 })
      ]);
      
      // Upload processed versions
      const uploadPromises = formats.map(format => 
        this.uploadProcessedImage(key, format)
      );
      
      await Promise.all(uploadPromises);
      
      // Update database with cloud URLs
      await this.updateDatabase(key, metadata, formats);
      
    } catch (error) {
      console.error('DICOM processing failed:', error);
      // Send to dead letter queue for retry
      throw error;
    }
  }
  
  async generateWebPVersion(dicomBuffer, options) {
    // Convert DICOM pixel data to WebP for web display
    const dicomData = dicomParser.parseDicom(dicomBuffer);
    const pixelData = dicomData.elements.x7fe00010.getValue();
    
    return sharp(pixelData, {
      raw: {
        width: dicomData.elements.x00280011.getValue(),
        height: dicomData.elements.x00280010.getValue(),
        channels: 1
      }
    })
    .webp(options)
    .toBuffer();
  }
}
```

### Global Performance Monitoring

#### A. CloudWatch Metrics
```javascript
// Monitor storage performance metrics
class StorageMetrics {
  constructor() {
    this.cloudWatch = new AWS.CloudWatch();
  }
  
  async trackDownloadPerformance(downloadTime, fileSize, region) {
    await this.cloudWatch.putMetricData({
      Namespace: 'RadCase/Storage',
      MetricData: [
        {
          MetricName: 'DownloadLatency',
          Value: downloadTime,
          Unit: 'Milliseconds',
          Dimensions: [
            { Name: 'Region', Value: region },
            { Name: 'FileSize', Value: this.getFileSizeCategory(fileSize) }
          ]
        },
        {
          MetricName: 'ThroughputMbps',
          Value: (fileSize * 8) / (downloadTime / 1000) / 1000000,
          Unit: 'Count/Second'
        }
      ]
    }).promise();
  }
  
  getFileSizeCategory(bytes) {
    if (bytes < 1024 * 1024) return 'Small'; // <1MB
    if (bytes < 10 * 1024 * 1024) return 'Medium'; // 1-10MB
    return 'Large'; // >10MB
  }
}
```

---

## Security & Compliance

### Data Protection Strategy

#### A. Encryption Configuration
```javascript
// End-to-end encryption for sensitive DICOM data
const crypto = require('crypto');

class SecureStorageManager {
  constructor() {
    this.encryptionKey = process.env.DICOM_ENCRYPTION_KEY;
    this.algorithm = 'aes-256-gcm';
  }
  
  encryptDicomData(buffer) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.encryptionKey, iv);
    
    let encrypted = cipher.update(buffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }
  
  decryptDicomData(encryptedData, iv, authTag) {
    const decipher = crypto.createDecipher(
      this.algorithm, 
      this.encryptionKey, 
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
  }
}
```

#### B. Access Control & Audit Logging
```javascript
// IAM policies for restricted access
const bucketPolicy = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'DenyDirectAccess',
      Effect: 'Deny',
      Principal: '*',
      Action: 's3:GetObject',
      Resource: 'arn:aws:s3:::radcase-dicom-prod/*',
      Condition: {
        StringNotEquals: {
          'aws:userid': ['AIDACKCEVSQ6C2EXAMPLE', 'AIDA55CHZZMHH42WUEB2X']
        }
      }
    }
  ]
};

// Audit logging for compliance
class AuditLogger {
  async logFileAccess(userId, fileKey, action, result) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId,
      fileKey,
      action, // 'download', 'upload', 'delete'
      result, // 'success', 'denied', 'error'
      ipAddress: this.getCurrentIP(),
      userAgent: this.getCurrentUserAgent()
    };
    
    // Log to CloudWatch Logs
    await this.sendToCloudWatch(logEntry);
    
    // Also log to audit trail database
    await this.storeAuditRecord(logEntry);
  }
}
```

---

## Cost Optimization

### Storage Cost Management

#### A. Intelligent Tiering
```javascript
// Automatic cost optimization based on access patterns
class StorageCostOptimizer {
  async analyzeAndOptimize() {
    // Get access patterns from CloudWatch
    const accessMetrics = await this.getAccessMetrics();
    
    for (const file of accessMetrics) {
      if (file.lastAccessed > 90 && file.currentClass === 'STANDARD') {
        // Move to Standard-IA
        await this.transitionToIA(file.key);
      } else if (file.lastAccessed > 365 && file.currentClass === 'STANDARD_IA') {
        // Move to Glacier
        await this.transitionToGlacier(file.key);
      }
    }
  }
  
  async calculateMonthlyCosts() {
    const usage = await this.getCurrentUsage();
    
    return {
      storage: {
        standard: usage.standard * 0.023, // $0.023/GB
        standardIA: usage.standardIA * 0.0125, // $0.0125/GB
        glacier: usage.glacier * 0.004 // $0.004/GB
      },
      transfer: {
        cloudfront: usage.cdnTransfer * 0.085, // $0.085/GB
        s3Transfer: usage.s3Transfer * 0.09 // $0.09/GB
      },
      requests: {
        gets: usage.gets * 0.0004 / 1000, // $0.0004/1K requests
        puts: usage.puts * 0.005 / 1000 // $0.005/1K requests
      }
    };
  }
}
```

### Performance vs Cost Balance

| Optimization | Cost Impact | Performance Impact | Recommendation |
|--------------|-------------|-------------------|----------------|
| Standard → Standard-IA (30 days) | -45% storage cost | +$0.01/GB retrieval | ✅ Implement |
| Standard-IA → Glacier (1 year) | -75% storage cost | Minutes to retrieve | ✅ For archives |
| CloudFront caching | +15% transfer cost | -70% load time | ✅ Essential |
| Multi-part uploads | +5% request cost | -50% upload time | ✅ For large files |

---

## Migration Timeline

### Sprint 1 (Feb 10-15): Planning & Setup
- [ ] **Day 1:** Cloud provider selection + account setup
- [ ] **Day 2:** S3 buckets + IAM policies configuration
- [ ] **Day 3:** Dual-write implementation
- [ ] **Day 4:** Background migration script development
- [ ] **Day 5:** Testing + validation

### Sprint 2 (Future): Migration Execution
- [ ] **Week 1:** Background migration of existing files
- [ ] **Week 2:** CDN configuration + testing
- [ ] **Week 3:** Performance optimization
- [ ] **Week 4:** Local storage deprecation

### Success Metrics
| Metric | Current | Target | Timeline |
|--------|---------|---------|----------|
| Global Load Time | 2-5 seconds | <1 second | Sprint 2 |
| Storage Redundancy | 0% | 99.999999999% | Sprint 1 |
| Bandwidth Cost | Server limited | $0.08/GB | Sprint 2 |
| Disaster Recovery | None | <1 hour RPO | Sprint 1 |

---

**Status:** ✅ Cloud storage strategy planned  
**Next:** Performance baseline establishment  
**Dependencies:** AWS account setup, budget approval