// RadCase Baseline Load Testing
// Validates Arc's performance improvements and baseline metrics

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const loginRate = new Rate('login_success_rate');
const caseLoadTime = new Trend('case_load_time', true);
const dicomLoadTime = new Trend('dicom_load_time', true);
const apiResponseTime = new Trend('api_response_time', true);

// Test configuration
export const options = {
  stages: [
    // Ramp up
    { duration: '2m', target: 10 },   // Start with 10 users
    { duration: '5m', target: 50 },   // Ramp to 50 users
    { duration: '5m', target: 100 },  // Ramp to 100 users
    { duration: '5m', target: 200 },  // Ramp to 200 users
    { duration: '10m', target: 200 }, // Sustain 200 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    // Arc's Sprint 1 targets
    http_req_duration: ['p(95)<1000'], // 95% under 1s
    'api_response_time': ['p(95)<100'], // API under 100ms
    'case_load_time': ['p(95)<2000'],   // Cases under 2s
    'dicom_load_time': ['p(95)<1000'],  // DICOM under 1s (Arc's target)
    'login_success_rate': ['rate>0.95'], // 95% login success
    http_req_failed: ['rate<0.1'],      // Less than 10% failures
  },
};

// Test data
const testUsers = [
  { username: 'loadtest1', password: 'LoadTest123!' },
  { username: 'loadtest2', password: 'LoadTest123!' },
  { username: 'loadtest3', password: 'LoadTest123!' },
  // Add more test users as needed
];

let authToken = '';

export function setup() {
  // Create test users if they don't exist
  console.log('Setting up load test environment...');
  
  // Register test users
  testUsers.forEach(user => {
    const registerRes = http.post(`${__ENV.BASE_URL || 'http://localhost:3001'}/api/auth/register`, {
      username: user.username,
      password: user.password,
      email: `${user.username}@example.com`
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (registerRes.status === 201 || registerRes.status === 409) { // Created or already exists
      console.log(`Test user ${user.username} ready`);
    }
  });
  
  return { testUsers };
}

export default function(data) {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:3001';
  const user = data.testUsers[__VU % data.testUsers.length];
  
  // Login flow
  const loginStart = new Date();
  const loginRes = http.post(`${baseUrl}/api/auth/login`, {
    username: user.username,
    password: user.password
  }, {
    headers: { 'Content-Type': 'application/json' }
  });
  
  const loginSuccess = check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login response time < 500ms': (r) => r.timings.duration < 500,
    'has auth token': (r) => r.json('token') !== undefined,
  });
  
  loginRate.add(loginSuccess);
  
  if (!loginSuccess) {
    console.error(`Login failed for user ${user.username}: ${loginRes.status}`);
    return;
  }
  
  const token = loginRes.json('token');
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  sleep(1);
  
  // Load cases API - Arc's caching optimization test
  const casesStart = new Date();
  const casesRes = http.get(`${baseUrl}/api/cases`, { headers });
  const casesLoadTime = new Date() - casesStart;
  
  check(casesRes, {
    'cases API status is 200': (r) => r.status === 200,
    'cases response time < 100ms': (r) => r.timings.duration < 100, // Arc's Redis target
    'cases has data': (r) => r.json().length > 0,
  });
  
  apiResponseTime.add(casesRes.timings.duration);
  caseLoadTime.add(casesLoadTime);
  
  if (casesRes.status === 200 && casesRes.json().length > 0) {
    const cases = casesRes.json();
    const randomCase = cases[Math.floor(Math.random() * cases.length)];
    
    sleep(1);
    
    // Load individual case - full case load performance
    const caseDetailStart = new Date();
    const caseRes = http.get(`${baseUrl}/api/cases/${randomCase.id}`, { headers });
    const caseDetailTime = new Date() - caseDetailStart;
    
    check(caseRes, {
      'case detail status is 200': (r) => r.status === 200,
      'case detail response time < 200ms': (r) => r.timings.duration < 200,
      'case has images': (r) => r.json('images') && r.json('images').length > 0,
    });
    
    caseLoadTime.add(caseDetailTime);
    
    if (caseRes.status === 200) {
      const caseData = caseRes.json();
      
      if (caseData.images && caseData.images.length > 0) {
        sleep(1);
        
        // Test image loading - Arc's optimization focus
        const image = caseData.images[0];
        const imageStart = new Date();
        const imageRes = http.get(`${baseUrl}/uploads/${image.filename}`, { headers });
        const imageLoadTime = new Date() - imageStart;
        
        check(imageRes, {
          'image loads successfully': (r) => r.status === 200,
          'image load time < 500ms': (r) => r.timings.duration < 500,
          'image has content': (r) => r.body.length > 0,
        });
        
        // Test thumbnail loading (Arc's Sharp optimization)
        const thumbnailRes = http.get(`${baseUrl}/thumbnails/${image.filename}`, { headers });
        check(thumbnailRes, {
          'thumbnail loads': (r) => r.status === 200,
          'thumbnail faster than original': (r) => r.timings.duration < imageLoadTime,
        });
      }
      
      // Test DICOM loading if available (Arc's focus area)
      if (caseData.dicom_series && caseData.dicom_series.length > 0) {
        const series = caseData.dicom_series[0];
        const dicomStart = new Date();
        const dicomRes = http.get(`${baseUrl}/api/dicom/${series.id}/metadata`, { headers });
        const dicomTime = new Date() - dicomStart;
        
        check(dicomRes, {
          'DICOM metadata loads': (r) => r.status === 200,
          'DICOM load time < 1000ms': (r) => r.timings.duration < 1000, // Arc's Sprint 1 target
        });
        
        dicomLoadTime.add(dicomTime);
      }
    }
  }
  
  sleep(1);
  
  // Quiz functionality load test
  const quizRes = http.get(`${baseUrl}/api/quiz/random`, { headers });
  check(quizRes, {
    'quiz API responds': (r) => r.status === 200,
    'quiz response time < 100ms': (r) => r.timings.duration < 100,
  });
  
  // Search functionality (database performance test)
  const searchRes = http.get(`${baseUrl}/api/cases?search=chest&modality=CT`, { headers });
  check(searchRes, {
    'search responds': (r) => r.status === 200,
    'search response time < 200ms': (r) => r.timings.duration < 200, // PostgreSQL performance
  });
  
  apiResponseTime.add(searchRes.timings.duration);
  
  sleep(2); // User think time
}

export function handleSummary(data) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total_requests: data.metrics.http_reqs.count,
      failed_requests: data.metrics.http_req_failed.count,
      avg_response_time: data.metrics.http_req_duration.avg,
      p95_response_time: data.metrics['http_req_duration{p(95)}'],
      login_success_rate: data.metrics.login_success_rate.rate,
      avg_case_load_time: data.metrics.case_load_time?.avg || 0,
      avg_dicom_load_time: data.metrics.dicom_load_time?.avg || 0,
      avg_api_response_time: data.metrics.api_response_time?.avg || 0,
    },
    arc_targets_met: {
      api_under_100ms: (data.metrics.api_response_time?.avg || Infinity) < 100,
      dicom_under_1000ms: (data.metrics.dicom_load_time?.avg || Infinity) < 1000,
      p95_under_1000ms: data.metrics['http_req_duration{p(95)}'] < 1000,
      error_rate_under_10: (data.metrics.http_req_failed.rate || 0) < 0.1,
    }
  };
  
  console.log('\n🎯 RadCase Baseline Load Test Results:');
  console.log('='.repeat(50));
  console.log(`Total Requests: ${report.summary.total_requests}`);
  console.log(`Failed Requests: ${report.summary.failed_requests}`);
  console.log(`Average Response Time: ${report.summary.avg_response_time.toFixed(2)}ms`);
  console.log(`95th Percentile: ${report.summary.p95_response_time.toFixed(2)}ms`);
  console.log(`Login Success Rate: ${(report.summary.login_success_rate * 100).toFixed(1)}%`);
  console.log(`Average Case Load Time: ${report.summary.avg_case_load_time.toFixed(2)}ms`);
  console.log(`Average DICOM Load Time: ${report.summary.avg_dicom_load_time.toFixed(2)}ms`);
  console.log(`Average API Response Time: ${report.summary.avg_api_response_time.toFixed(2)}ms`);
  
  console.log('\n🏆 Arc\'s Sprint 1 Targets:');
  console.log(`✅ API under 100ms: ${report.arc_targets_met.api_under_100ms ? 'PASS' : 'FAIL'}`);
  console.log(`✅ DICOM under 1000ms: ${report.arc_targets_met.dicom_under_1000ms ? 'PASS' : 'FAIL'}`);
  console.log(`✅ P95 under 1000ms: ${report.arc_targets_met.p95_under_1000ms ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Error rate under 10%: ${report.arc_targets_met.error_rate_under_10 ? 'PASS' : 'FAIL'}`);
  
  return {
    'load-test-results.json': JSON.stringify(report, null, 2),
    stdout: JSON.stringify(data, null, 2),
  };
}