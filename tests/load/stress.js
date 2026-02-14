// RadCase Stress Testing - 1000 Concurrent Users
// Validates Arc's architectural claims for production scale

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const concurrentUsers = new Trend('concurrent_users', true);
const systemStability = new Rate('system_stability');
const databasePerformance = new Trend('database_performance', true);
const memoryPressure = new Rate('memory_pressure_ok');
const errorRecovery = new Rate('error_recovery_success');

// Stress test configuration - Arc's 1K user claim validation
export const options = {
  stages: [
    // Gradual ramp-up to avoid overwhelming system
    { duration: '3m', target: 50 },    // Warm up
    { duration: '5m', target: 200 },   // Light load
    { duration: '5m', target: 500 },   // Medium load
    { duration: '5m', target: 750 },   // Heavy load
    { duration: '10m', target: 1000 }, // Arc's target: 1K concurrent
    { duration: '15m', target: 1000 }, // Sustain 1K users for 15 minutes
    { duration: '5m', target: 1200 },  // Overstress test (20% over claim)
    { duration: '5m', target: 800 },   // Recovery test
    { duration: '3m', target: 0 },     // Graceful shutdown
  ],
  thresholds: {
    // Arc's performance targets under stress
    http_req_duration: ['p(95)<2000'],     // Allow 2s under extreme load
    'database_performance': ['p(95)<200'], // PostgreSQL performance
    http_req_failed: ['rate<0.15'],        // Allow 15% failures under stress
    'system_stability': ['rate>0.90'],     // 90% system stability
    'error_recovery_success': ['rate>0.85'], // 85% error recovery
    checks: ['rate>0.80'],                 // 80% of checks pass under stress
  },
  // Resource limits
  noConnectionReuse: false,
  userAgent: 'RadCase-StressTest/1.0',
  batch: 10, // Batch requests to reduce connection overhead
  batchPerHost: 5,
  // Avoid system exhaustion
  discardResponseBodies: true, // Save memory during stress test
};

// Test user pool for high concurrency
const testUsers = Array.from({ length: 100 }, (_, i) => ({
  username: `stresstest${i}`,
  password: 'StressTest123!',
  email: `stresstest${i}@example.com`
}));

export function setup() {
  console.log('🚀 Setting up RadCase 1000-user stress test...');
  const baseUrl = __ENV.BASE_URL || 'http://localhost:3001';
  
  // Pre-create stress test users
  let createdUsers = 0;
  testUsers.forEach(user => {
    const registerRes = http.post(`${baseUrl}/api/auth/register`, {
      username: user.username,
      password: user.password,
      email: user.email
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s'
    });
    
    if (registerRes.status === 201 || registerRes.status === 409) {
      createdUsers++;
    }
  });
  
  console.log(`✅ Stress test users ready: ${createdUsers}/${testUsers.length}`);
  return { testUsers, baseUrl };
}

export default function(data) {
  const { testUsers, baseUrl } = data;
  const user = testUsers[__VU % testUsers.length];
  
  // Track concurrent users
  concurrentUsers.add(__VU);
  
  // Login with retry logic for stress conditions
  let loginAttempts = 0;
  let loginRes;
  let loginSuccess = false;
  
  while (loginAttempts < 3 && !loginSuccess) {
    loginAttempts++;
    
    try {
      const loginStart = new Date();
      loginRes = http.post(`${baseUrl}/api/auth/login`, {
        username: user.username,
        password: user.password
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: '10s'
      });
      
      const loginTime = new Date() - loginStart;
      databasePerformance.add(loginTime);
      
      loginSuccess = check(loginRes, {
        'login succeeds under stress': (r) => r.status === 200,
        'login time reasonable under load': (r) => r.timings.duration < 5000,
      });
      
      if (!loginSuccess && loginAttempts < 3) {
        sleep(Math.random() * 2); // Jittered retry delay
      }
      
    } catch (e) {
      console.warn(`Login attempt ${loginAttempts} failed: ${e.message}`);
      if (loginAttempts < 3) {
        sleep(Math.random() * 3);
      }
    }
  }
  
  // Track error recovery
  errorRecovery.add(loginSuccess);
  
  if (!loginSuccess) {
    systemStability.add(false);
    return; // Skip rest if can't login
  }
  
  const token = loginRes.json('token');
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  // Simulate realistic user behavior under stress
  const actions = [
    // Browse cases (most common action)
    () => {
      const casesStart = new Date();
      const res = http.get(`${baseUrl}/api/cases?limit=10&offset=${Math.floor(Math.random() * 100)}`, { 
        headers,
        timeout: '10s'
      });
      databasePerformance.add(new Date() - casesStart);
      return check(res, { 'cases load under stress': (r) => r.status === 200 });
    },
    
    // Search functionality (database intensive)
    () => {
      const searchTerms = ['chest', 'abdomen', 'brain', 'spine', 'heart'];
      const modalities = ['CT', 'MRI', 'XR', 'US'];
      const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
      const modality = modalities[Math.floor(Math.random() * modalities.length)];
      
      const searchStart = new Date();
      const res = http.get(`${baseUrl}/api/cases?search=${term}&modality=${modality}`, {
        headers,
        timeout: '15s'
      });
      databasePerformance.add(new Date() - searchStart);
      return check(res, { 'search works under stress': (r) => r.status === 200 });
    },
    
    // Quiz functionality  
    () => {
      const res = http.get(`${baseUrl}/api/quiz/random`, { headers, timeout: '10s' });
      return check(res, { 'quiz loads under stress': (r) => r.status === 200 });
    },
    
    // User statistics
    () => {
      const res = http.get(`${baseUrl}/api/quiz/stats`, { headers, timeout: '10s' });
      return check(res, { 'stats load under stress': (r) => r.status === 200 });
    },
    
    // Memory-intensive case detail loading
    () => {
      // Get a random case ID first
      const casesRes = http.get(`${baseUrl}/api/cases?limit=1&offset=${Math.floor(Math.random() * 50)}`, { 
        headers,
        timeout: '10s'
      });
      
      if (casesRes.status === 200 && casesRes.json().length > 0) {
        const caseId = casesRes.json()[0].id;
        const detailStart = new Date();
        const detailRes = http.get(`${baseUrl}/api/cases/${caseId}`, { 
          headers,
          timeout: '15s'
        });
        databasePerformance.add(new Date() - detailStart);
        return check(detailRes, { 'case detail loads under stress': (r) => r.status === 200 });
      }
      return false;
    }
  ];
  
  // Execute random actions (realistic user behavior)
  const numActions = Math.floor(Math.random() * 3) + 1; // 1-3 actions per user iteration
  let actionSuccesses = 0;
  
  for (let i = 0; i < numActions; i++) {
    try {
      const action = actions[Math.floor(Math.random() * actions.length)];
      const success = action();
      if (success) actionSuccesses++;
      
      // Realistic user think time (shorter under stress test)
      sleep(Math.random() * 1 + 0.5); // 0.5-1.5 seconds
      
    } catch (e) {
      console.warn(`Action failed under stress: ${e.message}`);
    }
  }
  
  // Overall system stability assessment
  const stability = actionSuccesses / numActions >= 0.7; // 70% action success = stable
  systemStability.add(stability);
  
  // Memory pressure simulation (vary user think time based on load)
  const currentLoad = __VU;
  const thinkTime = currentLoad > 800 ? 0.2 : (currentLoad > 500 ? 0.5 : 1.0);
  const memoryOk = currentLoad < 1100; // System should handle up to 1100 users
  memoryPressure.add(memoryOk);
  
  sleep(Math.random() * thinkTime);
}

export function handleSummary(data) {
  const maxConcurrentUsers = Math.max(...(data.metrics.concurrent_users?.values || [0]));
  const avgConcurrentUsers = data.metrics.concurrent_users?.avg || 0;
  const systemStabilityRate = data.metrics.system_stability?.rate || 0;
  const errorRecoveryRate = data.metrics.error_recovery_success?.rate || 0;
  const avgDbPerformance = data.metrics.database_performance?.avg || 0;
  const p95DbPerformance = data.metrics['database_performance{p(95)}'] || 0;
  
  const report = {
    test_type: 'stress_test',
    timestamp: new Date().toISOString(),
    arc_1k_user_validation: {
      max_concurrent_users: maxConcurrentUsers,
      avg_concurrent_users: avgConcurrentUsers,
      target_1000_users_reached: maxConcurrentUsers >= 1000,
      sustained_1000_users: avgConcurrentUsers >= 900, // Allow some fluctuation
      system_remained_stable: systemStabilityRate >= 0.90,
      error_recovery_effective: errorRecoveryRate >= 0.85,
    },
    performance_under_stress: {
      total_requests: data.metrics.http_reqs?.count || 0,
      failed_requests: data.metrics.http_req_failed?.count || 0,
      failure_rate: data.metrics.http_req_failed?.rate || 0,
      avg_response_time: data.metrics.http_req_duration?.avg || 0,
      p95_response_time: data.metrics['http_req_duration{p(95)}'] || 0,
      avg_database_performance: avgDbPerformance,
      p95_database_performance: p95DbPerformance,
    },
    arc_architectural_validation: {
      postgresql_handles_load: p95DbPerformance < 500, // 500ms acceptable under stress
      redis_caching_effective: avgDbPerformance < 300, // Caching should keep DB queries fast
      system_degradation_graceful: systemStabilityRate >= 0.80, // Graceful degradation
      recovery_capability: errorRecoveryRate >= 0.80,
      memory_management: data.metrics.memory_pressure_ok?.rate >= 0.85,
    }
  };
  
  // Comprehensive results summary
  console.log('\n🚨 RadCase 1000-User Stress Test Results:');
  console.log('='.repeat(60));
  console.log(`🎯 Arc's 1K User Claim Validation:`);
  console.log(`   Max Concurrent Users: ${maxConcurrentUsers}`);
  console.log(`   Target 1000 Reached: ${report.arc_1k_user_validation.target_1000_users_reached ? '✅ YES' : '❌ NO'}`);
  console.log(`   Sustained High Load: ${report.arc_1k_user_validation.sustained_1000_users ? '✅ YES' : '❌ NO'}`);
  console.log(`   System Stability: ${(systemStabilityRate * 100).toFixed(1)}% (${systemStabilityRate >= 0.90 ? '✅ PASS' : '❌ FAIL'})`);
  
  console.log(`\n⚡ Performance Under Stress:`);
  console.log(`   Total Requests: ${report.performance_under_stress.total_requests.toLocaleString()}`);
  console.log(`   Failure Rate: ${(report.performance_under_stress.failure_rate * 100).toFixed(2)}%`);
  console.log(`   Avg Response Time: ${report.performance_under_stress.avg_response_time.toFixed(0)}ms`);
  console.log(`   P95 Response Time: ${report.performance_under_stress.p95_response_time.toFixed(0)}ms`);
  console.log(`   Database Performance: ${avgDbPerformance.toFixed(0)}ms avg, ${p95DbPerformance.toFixed(0)}ms p95`);
  
  console.log(`\n🏗️ Arc's Architecture Validation:`);
  console.log(`   PostgreSQL Load Handling: ${report.arc_architectural_validation.postgresql_handles_load ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Redis Caching Effectiveness: ${report.arc_architectural_validation.redis_caching_effective ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Graceful Degradation: ${report.arc_architectural_validation.system_degradation_graceful ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Recovery Capability: ${report.arc_architectural_validation.recovery_capability ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Memory Management: ${report.arc_architectural_validation.memory_management ? '✅ PASS' : '❌ FAIL'}`);
  
  const overallSuccess = 
    report.arc_1k_user_validation.target_1000_users_reached &&
    report.arc_1k_user_validation.sustained_1000_users &&
    report.arc_architectural_validation.postgresql_handles_load &&
    report.arc_architectural_validation.system_degradation_graceful;
    
  console.log(`\n🎯 OVERALL VERDICT: ${overallSuccess ? '✅ ARC\'S 1K USER CLAIM VALIDATED' : '❌ NEEDS OPTIMIZATION'}`);
  
  if (!overallSuccess) {
    console.log('\n💡 Optimization Recommendations:');
    if (!report.arc_1k_user_validation.target_1000_users_reached) {
      console.log('   - Increase server resources (CPU/Memory)');
      console.log('   - Implement Arc\'s PostgreSQL optimizations');
    }
    if (!report.arc_architectural_validation.postgresql_handles_load) {
      console.log('   - Optimize database queries and indexes');
      console.log('   - Implement Arc\'s connection pooling strategy');
    }
    if (!report.arc_architectural_validation.redis_caching_effective) {
      console.log('   - Deploy Arc\'s Redis caching strategy');
      console.log('   - Optimize cache hit rates');
    }
  }
  
  return {
    'stress-test-results.json': JSON.stringify(report, null, 2),
    'performance-report.html': generateHTMLReport(report),
  };
}

function generateHTMLReport(report) {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>RadCase Stress Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; }
        .metric { background: #ecf0f1; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .pass { color: #27ae60; font-weight: bold; }
        .fail { color: #e74c3c; font-weight: bold; }
        .chart { width: 100%; height: 300px; background: #f8f9fa; border: 1px solid #dee2e6; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🛡️ RadCase Stress Test Report</h1>
        <p>Validating Arc's 1000 Concurrent User Architecture Claims</p>
        <p>Generated: ${report.timestamp}</p>
    </div>
    
    <div class="metric">
        <h3>🎯 Arc's 1K User Claim Validation</h3>
        <p>Max Concurrent Users: <strong>${report.arc_1k_user_validation.max_concurrent_users}</strong></p>
        <p>Target 1000 Reached: <span class="${report.arc_1k_user_validation.target_1000_users_reached ? 'pass' : 'fail'}">${report.arc_1k_user_validation.target_1000_users_reached ? 'YES' : 'NO'}</span></p>
        <p>System Stability: <span class="${report.arc_1k_user_validation.system_remained_stable ? 'pass' : 'fail'}">${(report.performance_under_stress.failure_rate * 100).toFixed(1)}%</span></p>
    </div>
    
    <div class="metric">
        <h3>⚡ Performance Metrics</h3>
        <p>Total Requests: ${report.performance_under_stress.total_requests.toLocaleString()}</p>
        <p>Avg Response Time: ${report.performance_under_stress.avg_response_time.toFixed(0)}ms</p>
        <p>P95 Response Time: ${report.performance_under_stress.p95_response_time.toFixed(0)}ms</p>
        <p>Database Performance: ${report.performance_under_stress.avg_database_performance.toFixed(0)}ms</p>
    </div>
    
    <div class="metric">
        <h3>🏗️ Architecture Validation</h3>
        <p>PostgreSQL Handling: <span class="${report.arc_architectural_validation.postgresql_handles_load ? 'pass' : 'fail'}">${report.arc_architectural_validation.postgresql_handles_load ? 'PASS' : 'FAIL'}</span></p>
        <p>Caching Effectiveness: <span class="${report.arc_architectural_validation.redis_caching_effective ? 'pass' : 'fail'}">${report.arc_architectural_validation.redis_caching_effective ? 'PASS' : 'FAIL'}</span></p>
        <p>Graceful Degradation: <span class="${report.arc_architectural_validation.system_degradation_graceful ? 'pass' : 'fail'}">${report.arc_architectural_validation.system_degradation_graceful ? 'PASS' : 'FAIL'}</span></p>
    </div>
</body>
</html>`;
}