const http = require('http');

// Test health endpoint
const testHealthEndpoint = () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/health',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log('Health endpoint response:', JSON.parse(data));
        resolve(JSON.parse(data));
      });
    });

    req.on('error', (err) => {
      console.error('Health endpoint error:', err.message);
      reject(err);
    });

    req.end();
  });
};

// Test detailed health endpoint
const testDetailedHealthEndpoint = () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/health/detailed',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log('Detailed health endpoint response:', JSON.parse(data));
        resolve(JSON.parse(data));
      });
    });

    req.on('error', (err) => {
      console.error('Detailed health endpoint error:', err.message);
      reject(err);
    });

    req.end();
  });
};

// Run tests
async function runTests() {
  console.log('Testing API Gateway endpoints...\n');
  
  try {
    await testHealthEndpoint();
    console.log('✅ Health endpoint working\n');
    
    await testDetailedHealthEndpoint();
    console.log('✅ Detailed health endpoint working\n');
    
    console.log('🎉 All tests passed! API Gateway is working correctly.');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('Make sure the server is running with: npm run dev');
  }
}

// Wait a moment for server to start, then run tests
setTimeout(runTests, 3000);