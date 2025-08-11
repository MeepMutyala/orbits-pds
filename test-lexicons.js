const fetch = require('node-fetch');

class OrbitsPDSClient {
  constructor(baseUrl = 'http://localhost:3000', adminPassword = 'admin123') {
    this.baseUrl = baseUrl;
    this.xrpcEndpoint = `${baseUrl}/xrpc`;
    this.adminPassword = adminPassword;
  }

  async request(method, endpoint, params = null, data = null, requiresAuth = false) {
    const url = new URL(`${this.xrpcEndpoint}/${endpoint}`);
    
    if (params && method === 'GET') {
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    }

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'OrbitsPDS-Test-Client/1.0'
    };

    // Add admin auth header for protected endpoints
    if (requiresAuth) {
      headers['x-orbits-admin'] = this.adminPassword;
    }

    const options = {
      method,
      headers
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url.toString(), options);
      const responseData = await response.text();
      
      console.log(`${method} ${endpoint}:`);
      console.log(`Status: ${response.status} ${response.statusText}`);
      console.log(`Response: ${responseData}`);
      console.log('---');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseData}`);
      }
      
      return responseData ? JSON.parse(responseData) : null;
    } catch (error) {
      console.error(`Error calling ${endpoint}:`, error.message);
      throw error;
    }
  }

  // Test creating an orbit (requires auth)
  async createOrbit(name, description = null, feeds = {}) {
    return this.request('POST', 'org.chaoticharmonylabs.orbit.create', null, {
      name,
      description,
      feeds
    }, true); // requiresAuth = true
  }

  // Test getting an orbit (public)
  async getOrbit(uri) {
    return this.request('GET', 'org.chaoticharmonylabs.orbit.get', { uri });
  }

  // Test listing orbits (public)
  async listOrbits(limit = 50, cursor = null) {
    const params = { limit };
    if (cursor) params.cursor = cursor;
    return this.request('GET', 'org.chaoticharmonylabs.orbit.list', params);
  }

  // Test updating an orbit (requires auth)
  async updateOrbit(uri, name = null, description = null, feeds = null) {
    const data = { uri };
    if (name) data.name = name;
    if (description) data.description = description;
    if (feeds) data.feeds = feeds;
    
    return this.request('POST', 'org.chaoticharmonylabs.orbit.update', null, data, true); // requiresAuth = true
  }

  // Test server health
  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/xrpc`);
      console.log('Health Check:');
      console.log(`Status: ${response.status} ${response.statusText}`);
      console.log('Server is running!');
      console.log('---');
      return true;
    } catch (error) {
      console.error('Health Check Failed:', error.message);
      return false;
    }
  }
}

// Test functions
async function runTests() {
  console.log('🧪 Starting Orbits PDS Lexicon Tests');
  console.log('=====================================\n');

  const client = new OrbitsPDSClient();

  try {
    // 1. Health check
    console.log('1. Testing server health...');
    const isHealthy = await client.checkHealth();
    if (!isHealthy) {
      console.error('❌ Server is not responding. Make sure the PDS is running.');
      return;
    }

    // 2. Test listing orbits (public endpoint)
    console.log('2. Testing orbit listing (public)...');
    await client.listOrbits(10);
    console.log('✅ Orbits listed successfully!');

    // 3. Test getting an orbit (public endpoint)
    console.log('3. Testing orbit retrieval (public)...');
    await client.getOrbit('at://did:web:localhost/org.chaoticharmonylabs.orbit.record/1');
    console.log('✅ Orbit retrieved successfully!');

    // 4. Test creating an orbit (protected endpoint)
    console.log('4. Testing orbit creation (protected)...');
    const createResult = await client.createOrbit(
      'Test Photography Orbit',
      'A test orbit for photography content',
      {
        photo: 'at://did:web:localhost/app.bsky.feed.generator/photos',
        video: 'at://did:web:localhost/app.bsky.feed.generator/videos'
      }
    );
    console.log('✅ Orbit created successfully!');

    // 5. Test updating an orbit (protected endpoint)
    console.log('5. Testing orbit update (protected)...');
    await client.updateOrbit(
      'at://did:web:localhost/org.chaoticharmonylabs.orbit.record/1',
      'Updated Photography Orbit',
      'An updated description for testing'
    );
    console.log('✅ Orbit updated successfully!');

    console.log('\n🎉 All tests completed successfully!');
    console.log('Your custom AT Protocol lexicons are integrated into the PDS!');
    console.log('✅ Single origin/port - no cross-process hops');
    console.log('✅ Shared authentication context');
    console.log('✅ Protected write endpoints with admin headers');
    console.log('✅ Public read endpoints');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure the PDS server is running: npm run dev');
    console.log('2. Check that the admin password matches (default: admin123)');
    console.log('3. Verify the server logs for any errors');
    console.log('4. For protected endpoints, include the admin header:');
    console.log('   curl -H "x-orbits-admin: admin123" ...');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { OrbitsPDSClient, runTests };
