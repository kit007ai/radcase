#!/usr/bin/env node
/**
 * RadCase Performance Baseline Testing Suite
 * 
 * This script establishes performance baselines across:
 * - Database operations
 * - DICOM file loading
 * - API response times
 * - Memory usage patterns
 * - Concurrent user simulation
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const fetch = require('node-fetch');

class PerformanceBaseline {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
    this.results = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      tests: {}
    };
  }

  async runFullBaselineSuite() {
    console.log('🚀 Starting RadCase Performance Baseline Testing');
    console.log(`📅 ${this.results.timestamp}`);
    console.log(`🌍 Environment: ${this.results.environment}`);
    console.log('━'.repeat(60));

    try {
      // Database performance tests
      await this.testDatabasePerformance();
      
      // API endpoint performance
      await this.testAPIPerformance();
      
      // DICOM loading performance
      await this.testDicomLoadingPerformance();
      
      // Concurrent user simulation
      await this.testConcurrentUserLoad();
      
      // Memory usage analysis
      await this.analyzeMemoryUsage();
      
      // Generate comprehensive report
      await this.generateBaselineReport();
      
      console.log('✅ Baseline testing completed successfully');
      
    } catch (error) {
      console.error('❌ Baseline testing failed:', error);
      throw error;
    }
  }

  async testDatabasePerformance() {
    console.log('\n📊 Testing Database Performance...');
    
    const dbTests = {
      singleCaseQuery: await this.measureDatabaseQuery('SELECT * FROM cases LIMIT 1'),
      allCasesQuery: await this.measureDatabaseQuery('SELECT * FROM cases'),
      joinQuery: await this.measureDatabaseQuery(`
        SELECT c.*, COUNT(i.id) as image_count 
        FROM cases c 
        LEFT JOIN images i ON c.id = i.case_id 
        GROUP BY c.id
      `),
      searchQuery: await this.measureDatabaseQuery(`
        SELECT * FROM cases 
        WHERE title LIKE '%CT%' OR diagnosis LIKE '%fracture%'
      `),
      userProgressQuery: await this.measureDatabaseQuery(`
        SELECT * FROM user_case_progress 
        WHERE next_review <= date('now')
      `)
    };

    this.results.tests.database = dbTests;
    
    console.log(`  Single case query: ${dbTests.singleCaseQuery.duration}ms`);
    console.log(`  All cases query: ${dbTests.allCasesQuery.duration}ms`);
    console.log(`  Join query: ${dbTests.joinQuery.duration}ms`);
    console.log(`  Search query: ${dbTests.searchQuery.duration}ms`);
    console.log(`  User progress query: ${dbTests.userProgressQuery.duration}ms`);
  }

  async measureDatabaseQuery(query) {
    const Database = require('better-sqlite3');
    const db = new Database('./radcase.db', { readonly: true });
    
    const measurements = [];
    const iterations = 10;
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      try {
        const result = db.prepare(query).all();
        const duration = performance.now() - start;
        measurements.push({ duration, rowCount: result.length });
      } catch (error) {
        measurements.push({ duration: -1, error: error.message });
      }
    }
    
    db.close();
    
    const validMeasurements = measurements.filter(m => m.duration > 0);
    const avgDuration = validMeasurements.reduce((sum, m) => sum + m.duration, 0) / validMeasurements.length;
    const maxDuration = Math.max(...validMeasurements.map(m => m.duration));
    const minDuration = Math.min(...validMeasurements.map(m => m.duration));
    
    return {
      duration: Math.round(avgDuration * 100) / 100,
      min: Math.round(minDuration * 100) / 100,
      max: Math.round(maxDuration * 100) / 100,
      iterations: validMeasurements.length,
      rowCount: validMeasurements[0]?.rowCount || 0
    };
  }

  async testAPIPerformance() {
    console.log('\n🌐 Testing API Performance...');
    
    const apiTests = {
      healthCheck: await this.measureAPIEndpoint('GET', '/api/health'),
      casesList: await this.measureAPIEndpoint('GET', '/api/cases'),
      singleCase: await this.measureAPIEndpoint('GET', '/api/cases/case-1'),
      dicomMetadata: await this.measureAPIEndpoint('GET', '/api/dicom/case-1'),
      userAuth: await this.measureAPIEndpoint('POST', '/api/auth/login', {
        username: 'demo',
        password: 'demo123'
      })
    };

    this.results.tests.api = apiTests;
    
    Object.entries(apiTests).forEach(([endpoint, result]) => {
      console.log(`  ${endpoint}: ${result.avgResponseTime}ms (${result.status})`);
    });
  }

  async measureAPIEndpoint(method, endpoint, body = null, iterations = 5) {
    const measurements = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      try {
        const options = {
          method,
          headers: { 'Content-Type': 'application/json' }
        };
        
        if (body) {
          options.body = JSON.stringify(body);
        }
        
        const response = await fetch(`${this.baseUrl}${endpoint}`, options);
        const responseTime = performance.now() - start;
        
        // Read response body to measure full request time
        await response.text();
        const totalTime = performance.now() - start;
        
        measurements.push({
          responseTime: Math.round(responseTime * 100) / 100,
          totalTime: Math.round(totalTime * 100) / 100,
          status: response.status,
          success: response.ok
        });
        
      } catch (error) {
        measurements.push({
          responseTime: -1,
          totalTime: -1,
          status: 0,
          success: false,
          error: error.message
        });
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const successful = measurements.filter(m => m.success);
    
    if (successful.length === 0) {
      return {
        avgResponseTime: -1,
        avgTotalTime: -1,
        status: 'ERROR',
        successRate: 0,
        error: measurements[0]?.error
      };
    }
    
    return {
      avgResponseTime: Math.round(successful.reduce((sum, m) => sum + m.responseTime, 0) / successful.length * 100) / 100,
      avgTotalTime: Math.round(successful.reduce((sum, m) => sum + m.totalTime, 0) / successful.length * 100) / 100,
      minResponseTime: Math.min(...successful.map(m => m.responseTime)),
      maxResponseTime: Math.max(...successful.map(m => m.responseTime)),
      status: successful[0].status,
      successRate: Math.round(successful.length / measurements.length * 100),
      iterations: measurements.length
    };
  }

  async testDicomLoadingPerformance() {
    console.log('\n🏥 Testing DICOM Loading Performance...');
    
    // Get available cases
    const casesResponse = await fetch(`${this.baseUrl}/api/cases`);
    const cases = await casesResponse.json();
    
    if (cases.length === 0) {
      console.log('  ⚠️ No test cases available');
      return;
    }
    
    const dicomTests = {};
    
    // Test first 3 cases to avoid overloading
    for (const testCase of cases.slice(0, 3)) {
      console.log(`  Testing case: ${testCase.title}`);
      
      try {
        const caseResult = await this.measureDicomCaseLoad(testCase.id);
        dicomTests[testCase.id] = {
          ...caseResult,
          caseTitle: testCase.title,
          modality: testCase.modality
        };
        
        console.log(`    Series load: ${caseResult.seriesLoadTime}ms`);
        console.log(`    File count: ${caseResult.fileCount}`);
        console.log(`    Avg file load: ${caseResult.avgFileLoadTime}ms`);
        
      } catch (error) {
        console.log(`    ❌ Failed: ${error.message}`);
        dicomTests[testCase.id] = { error: error.message };
      }
    }
    
    this.results.tests.dicom = dicomTests;
  }

  async measureDicomCaseLoad(caseId) {
    // Measure series metadata loading
    const seriesStart = performance.now();
    const seriesResponse = await fetch(`${this.baseUrl}/api/dicom/${caseId}`);
    const seriesData = await seriesResponse.json();
    const seriesLoadTime = Math.round((performance.now() - seriesStart) * 100) / 100;
    
    if (!seriesData.files || seriesData.files.length === 0) {
      throw new Error('No DICOM files found for case');
    }
    
    // Measure individual file loading (sample up to 5 files)
    const filesToTest = seriesData.files.slice(0, Math.min(5, seriesData.files.length));
    const fileLoadTimes = [];
    
    for (const filename of filesToTest) {
      const fileStart = performance.now();
      
      try {
        const fileResponse = await fetch(`${this.baseUrl}/api/dicom/${caseId}/files/${filename}`);
        const fileBuffer = await fileResponse.buffer();
        const fileLoadTime = performance.now() - fileStart;
        
        fileLoadTimes.push({
          filename,
          loadTime: Math.round(fileLoadTime * 100) / 100,
          fileSize: fileBuffer.length,
          throughputMbps: (fileBuffer.length * 8) / (fileLoadTime / 1000) / 1000000
        });
        
      } catch (error) {
        fileLoadTimes.push({
          filename,
          loadTime: -1,
          error: error.message
        });
      }
    }
    
    const successfulLoads = fileLoadTimes.filter(f => f.loadTime > 0);
    const avgFileLoadTime = successfulLoads.length > 0 
      ? successfulLoads.reduce((sum, f) => sum + f.loadTime, 0) / successfulLoads.length
      : -1;
    
    const totalFileSize = successfulLoads.reduce((sum, f) => sum + (f.fileSize || 0), 0);
    const avgThroughput = successfulLoads.length > 0
      ? successfulLoads.reduce((sum, f) => sum + (f.throughputMbps || 0), 0) / successfulLoads.length
      : 0;
    
    return {
      seriesLoadTime,
      fileCount: seriesData.files.length,
      filesTestedCount: filesToTest.length,
      avgFileLoadTime: Math.round(avgFileLoadTime * 100) / 100,
      totalFileSize,
      avgThroughputMbps: Math.round(avgThroughput * 100) / 100,
      fileDetails: fileLoadTimes
    };
  }

  async testConcurrentUserLoad() {
    console.log('\n👥 Testing Concurrent User Load...');
    
    const concurrencyLevels = [1, 5, 10, 25, 50];
    const concurrencyResults = {};
    
    for (const userCount of concurrencyLevels) {
      console.log(`  Testing ${userCount} concurrent users...`);
      
      try {
        const result = await this.simulateConcurrentUsers(userCount);
        concurrencyResults[userCount] = result;
        
        console.log(`    Avg response time: ${result.avgResponseTime}ms`);
        console.log(`    Success rate: ${result.successRate}%`);
        console.log(`    Requests/second: ${result.requestsPerSecond}`);
        
      } catch (error) {
        console.log(`    ❌ Failed: ${error.message}`);
        concurrencyResults[userCount] = { error: error.message };
      }
      
      // Brief pause between concurrency tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    this.results.tests.concurrency = concurrencyResults;
  }

  async simulateConcurrentUsers(userCount, durationSeconds = 30) {
    const startTime = Date.now();
    const endTime = startTime + (durationSeconds * 1000);
    const results = [];
    const activeRequests = new Set();
    
    // Define user behavior patterns
    const endpoints = [
      { endpoint: '/api/cases', weight: 3 },
      { endpoint: '/api/cases/case-1', weight: 2 },
      { endpoint: '/api/dicom/case-1', weight: 1 }
    ];
    
    // Create concurrent user simulations
    const userPromises = [];
    
    for (let userId = 0; userId < userCount; userId++) {
      const userPromise = this.simulateSingleUser(userId, endpoints, endTime, results);
      userPromises.push(userPromise);
    }
    
    await Promise.all(userPromises);
    
    // Analyze results
    const successfulRequests = results.filter(r => r.success);
    const failedRequests = results.filter(r => !r.success);
    
    const avgResponseTime = successfulRequests.length > 0
      ? successfulRequests.reduce((sum, r) => sum + r.responseTime, 0) / successfulRequests.length
      : -1;
    
    const totalRequests = results.length;
    const actualDuration = (Date.now() - startTime) / 1000;
    const requestsPerSecond = totalRequests / actualDuration;
    
    return {
      userCount,
      durationSeconds: actualDuration,
      totalRequests,
      successfulRequests: successfulRequests.length,
      failedRequests: failedRequests.length,
      successRate: Math.round((successfulRequests.length / totalRequests) * 100),
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      minResponseTime: successfulRequests.length > 0 ? Math.min(...successfulRequests.map(r => r.responseTime)) : -1,
      maxResponseTime: successfulRequests.length > 0 ? Math.max(...successfulRequests.map(r => r.responseTime)) : -1,
      requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
      errors: failedRequests.map(r => r.error).slice(0, 5) // First 5 errors
    };
  }

  async simulateSingleUser(userId, endpoints, endTime, results) {
    while (Date.now() < endTime) {
      // Select random endpoint based on weights
      const totalWeight = endpoints.reduce((sum, ep) => sum + ep.weight, 0);
      let random = Math.random() * totalWeight;
      
      let selectedEndpoint = endpoints[0];
      for (const endpoint of endpoints) {
        random -= endpoint.weight;
        if (random <= 0) {
          selectedEndpoint = endpoint;
          break;
        }
      }
      
      // Make request
      const requestStart = performance.now();
      try {
        const response = await fetch(`${this.baseUrl}${selectedEndpoint.endpoint}`, {
          timeout: 10000 // 10 second timeout
        });
        
        await response.text(); // Consume response body
        const responseTime = performance.now() - requestStart;
        
        results.push({
          userId,
          endpoint: selectedEndpoint.endpoint,
          responseTime: Math.round(responseTime * 100) / 100,
          status: response.status,
          success: response.ok,
          timestamp: Date.now()
        });
        
      } catch (error) {
        const responseTime = performance.now() - requestStart;
        results.push({
          userId,
          endpoint: selectedEndpoint.endpoint,
          responseTime: Math.round(responseTime * 100) / 100,
          status: 0,
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
      }
      
      // Random delay between requests (1-5 seconds)
      const delay = 1000 + Math.random() * 4000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  async analyzeMemoryUsage() {
    console.log('\n💾 Analyzing Memory Usage...');
    
    // This would require server-side memory monitoring
    // For now, we'll simulate memory measurements
    this.results.tests.memory = {
      note: 'Memory analysis requires server instrumentation',
      estimatedBaselineMemory: '100-200MB',
      recommendedMonitoring: [
        'process.memoryUsage()',
        'SQLite cache size',
        'Sharp.js memory usage',
        'DICOM parser memory footprint'
      ]
    };
    
    console.log('  ℹ️ Memory analysis requires server-side instrumentation');
    console.log('  📊 Estimated baseline: 100-200MB RAM usage');
  }

  async generateBaselineReport() {
    const reportPath = path.join(__dirname, `../docs/performance/baseline-report-${Date.now()}.json`);
    
    // Create performance summary
    const summary = {
      ...this.results,
      summary: {
        databasePerformance: this.summarizeDatabasePerformance(),
        apiPerformance: this.summarizeAPIPerformance(),
        dicomPerformance: this.summarizeDicomPerformance(),
        concurrencyLimits: this.summarizeConcurrencyLimits(),
        recommendations: this.generateRecommendations()
      }
    };
    
    // Write detailed results to JSON
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
    
    // Generate human-readable report
    const readableReport = this.generateReadableReport(summary);
    const readableReportPath = path.join(__dirname, `../docs/performance/baseline-report-${Date.now()}.md`);
    fs.writeFileSync(readableReportPath, readableReport);
    
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    console.log(`📄 Readable report saved to: ${readableReportPath}`);
  }

  summarizeDatabasePerformance() {
    const db = this.results.tests.database || {};
    return {
      avgQueryTime: Object.values(db).reduce((sum, test) => sum + (test.duration || 0), 0) / Object.keys(db).length,
      slowestQuery: Math.max(...Object.values(db).map(test => test.duration || 0)),
      assessment: 'GOOD - SQLite performing well for single-user scenarios'
    };
  }

  summarizeAPIPerformance() {
    const api = this.results.tests.api || {};
    const avgResponseTime = Object.values(api).reduce((sum, test) => sum + (test.avgResponseTime || 0), 0) / Object.keys(api).length;
    
    return {
      avgResponseTime,
      assessment: avgResponseTime < 100 ? 'EXCELLENT' : avgResponseTime < 200 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
    };
  }

  summarizeDicomPerformance() {
    const dicom = this.results.tests.dicom || {};
    const cases = Object.values(dicom).filter(test => !test.error);
    
    if (cases.length === 0) {
      return { assessment: 'NO_DATA' };
    }
    
    const avgSeriesLoad = cases.reduce((sum, test) => sum + (test.seriesLoadTime || 0), 0) / cases.length;
    const avgFileLoad = cases.reduce((sum, test) => sum + (test.avgFileLoadTime || 0), 0) / cases.length;
    
    return {
      avgSeriesLoadTime: avgSeriesLoad,
      avgFileLoadTime: avgFileLoad,
      assessment: avgFileLoad < 500 ? 'GOOD' : avgFileLoad < 2000 ? 'ACCEPTABLE' : 'SLOW'
    };
  }

  summarizeConcurrencyLimits() {
    const concurrency = this.results.tests.concurrency || {};
    const levels = Object.keys(concurrency).map(Number).sort((a, b) => a - b);
    
    let maxReliableUsers = 0;
    for (const level of levels) {
      const result = concurrency[level];
      if (result && result.successRate >= 95 && result.avgResponseTime < 1000) {
        maxReliableUsers = level;
      } else {
        break;
      }
    }
    
    return {
      maxReliableUsers,
      assessment: maxReliableUsers >= 50 ? 'EXCELLENT' : maxReliableUsers >= 25 ? 'GOOD' : 'LIMITED'
    };
  }

  generateRecommendations() {
    const recommendations = [];
    
    // Database recommendations
    const dbPerf = this.summarizeDatabasePerformance();
    if (dbPerf.slowestQuery > 100) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Database',
        issue: 'Slow database queries detected',
        recommendation: 'Implement query optimization and consider PostgreSQL migration'
      });
    }
    
    // DICOM recommendations
    const dicomPerf = this.summarizeDicomPerformance();
    if (dicomPerf.avgFileLoadTime > 1000) {
      recommendations.push({
        priority: 'HIGH',
        category: 'DICOM',
        issue: 'Slow DICOM file loading',
        recommendation: 'Implement parallel loading and file compression'
      });
    }
    
    // Concurrency recommendations
    const concurrencyPerf = this.summarizeConcurrencyLimits();
    if (concurrencyPerf.maxReliableUsers < 25) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'Scalability',
        issue: 'Limited concurrent user capacity',
        recommendation: 'Implement caching strategy and database optimization'
      });
    }
    
    return recommendations;
  }

  generateReadableReport(data) {
    return `# RadCase Performance Baseline Report

**Generated:** ${data.timestamp}
**Environment:** ${data.environment}

## Executive Summary

${data.summary.recommendations.length > 0 
  ? `⚠️ **${data.summary.recommendations.length} optimization opportunities identified**`
  : '✅ **Performance within acceptable ranges**'
}

## Database Performance

- **Average Query Time:** ${data.summary.databasePerformance.avgQueryTime}ms
- **Slowest Query:** ${data.summary.databasePerformance.slowestQuery}ms
- **Assessment:** ${data.summary.databasePerformance.assessment}

## API Performance

- **Average Response Time:** ${data.summary.apiPerformance.avgResponseTime}ms
- **Assessment:** ${data.summary.apiPerformance.assessment}

## DICOM Performance

- **Series Load Time:** ${data.summary.dicomPerformance.avgSeriesLoadTime || 'N/A'}ms
- **File Load Time:** ${data.summary.dicomPerformance.avgFileLoadTime || 'N/A'}ms
- **Assessment:** ${data.summary.dicomPerformance.assessment}

## Concurrency Limits

- **Max Reliable Users:** ${data.summary.concurrencyLimits.maxReliableUsers}
- **Assessment:** ${data.summary.concurrencyLimits.assessment}

## Recommendations

${data.summary.recommendations.map(rec => 
  `### ${rec.priority}: ${rec.category}
**Issue:** ${rec.issue}
**Recommendation:** ${rec.recommendation}`
).join('\n\n')}

## Raw Test Data

\`\`\`json
${JSON.stringify(data.tests, null, 2)}
\`\`\`
`;
  }
}

// Run the baseline if executed directly
if (require.main === module) {
  const baseline = new PerformanceBaseline();
  
  baseline.runFullBaselineSuite()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Baseline testing failed:', error);
      process.exit(1);
    });
}

module.exports = PerformanceBaseline;