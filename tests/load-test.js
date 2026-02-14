#!/usr/bin/env node
/**
 * RadCase Load Testing Suite
 * Uses autocannon for HTTP benchmarking
 * 
 * Usage: node tests/load-test.js [--url http://localhost:3001] [--duration 30]
 */

const autocannon = require('autocannon');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3001';
const DURATION = parseInt(process.env.TEST_DURATION) || 30;

const scenarios = [
  {
    name: '1. Health Check (baseline)',
    url: `${BASE_URL}/api/health`,
    connections: 100,
    duration: DURATION,
    target: { rps: 1000, p99: 100 },
  },
  {
    name: '2. Case Listing (main page)',
    url: `${BASE_URL}/api/cases`,
    connections: 100,
    duration: DURATION,
    target: { rps: 500, p99: 200 },
  },
  {
    name: '3. Case Listing - 50 concurrent users',
    url: `${BASE_URL}/api/cases`,
    connections: 50,
    duration: DURATION,
    target: { rps: 200, p99: 500 },
  },
  {
    name: '4. Case Listing - 200 concurrent users',
    url: `${BASE_URL}/api/cases`,
    connections: 200,
    duration: DURATION,
    target: { rps: 300, p99: 1000 },
  },
  {
    name: '5. Case Listing - 500 concurrent users',
    url: `${BASE_URL}/api/cases`,
    connections: 500,
    duration: DURATION,
    target: { rps: 200, p99: 2000 },
  },
  {
    name: '6. Case Listing - 1000 concurrent users',
    url: `${BASE_URL}/api/cases`,
    connections: 1000,
    duration: DURATION,
    target: { rps: 100, p99: 5000 },
  },
];

async function runScenario(scenario) {
  return new Promise((resolve) => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🔥 ${scenario.name}`);
    console.log(`   URL: ${scenario.url}`);
    console.log(`   Connections: ${scenario.connections}, Duration: ${scenario.duration}s`);
    console.log(`${'─'.repeat(60)}`);

    const instance = autocannon({
      url: scenario.url,
      connections: scenario.connections,
      duration: scenario.duration,
      pipelining: 1,
      timeout: 10,
    }, (err, result) => {
      if (err) {
        console.error('   ❌ Error:', err.message);
        resolve({ ...scenario, error: err.message });
        return;
      }

      const rps = Math.round(result.requests.average);
      const p50 = result.latency.p50 || 0;
      const p99 = result.latency.p99 || 0;
      const errors = result.errors || 0;
      const timeouts = result.timeouts || 0;

      const rpsPass = rps >= scenario.target.rps;
      const p99Pass = p99 <= scenario.target.p99;

      console.log(`\n   📊 Results:`);
      console.log(`   ${rpsPass ? '✅' : '❌'} Requests/sec: ${rps} (target: ${scenario.target.rps})`);
      console.log(`   📈 Latency p50: ${p50}ms | p99: ${p99}ms`);
      console.log(`   ${p99Pass ? '✅' : '❌'} p99 latency: ${p99}ms (target: <${scenario.target.p99}ms)`);
      console.log(`   📦 Total requests: ${result.requests.total}`);
      console.log(`   ⚠️  Errors: ${errors} | Timeouts: ${timeouts}`);
      console.log(`   ${rpsPass && p99Pass ? '✅ PASS' : '❌ FAIL'}`);

      resolve({
        name: scenario.name,
        connections: scenario.connections,
        rps,
        p50,
        p99,
        totalRequests: result.requests.total,
        errors,
        timeouts,
        pass: rpsPass && p99Pass,
        throughputMB: Math.round(result.throughput.average / 1024 / 1024 * 100) / 100,
      });
    });

    autocannon.track(instance, { renderProgressBar: true });
  });
}

async function main() {
  console.log('🏥 RadCase Load Testing Suite');
  console.log(`📍 Target: ${BASE_URL}`);
  console.log(`⏱️  Duration per test: ${DURATION}s`);
  console.log(`📅 ${new Date().toISOString()}`);

  // Check server is up
  try {
    const resp = await fetch(`${BASE_URL}/api/health`);
    if (!resp.ok) throw new Error(`Status ${resp.status}`);
    console.log('✅ Server is responding');
  } catch (e) {
    console.error(`❌ Server not reachable at ${BASE_URL}: ${e.message}`);
    console.error('   Start the server first: npm start');
    process.exit(1);
  }

  const results = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario);
    results.push(result);
    // Brief pause between tests
    await new Promise(r => setTimeout(r, 2000));
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 LOAD TEST SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass && !r.error).length;
  
  for (const r of results) {
    if (r.error) {
      console.log(`  ❌ ${r.name}: ERROR - ${r.error}`);
    } else {
      console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}: ${r.rps} rps, p99=${r.p99}ms, ${r.connections} conn`);
    }
  }

  console.log(`\n  Result: ${passed} passed, ${failed} failed out of ${results.length} scenarios`);
  
  // Write results to file
  const fs = require('fs');
  const reportPath = require('path').join(__dirname, '..', 'docs', 'performance', `load-test-${Date.now()}.json`);
  fs.mkdirSync(require('path').dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\n  📄 Report saved: ${reportPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
