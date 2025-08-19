import { AtpAgent } from '@atproto/api'

export class OrbitClient {
  constructor(private agent: AtpAgent) {}

  // Create a new orbit record
  async createOrbit(orbitData: {
    name: string
    description?: string  
    feeds?: Record<string, any>
  }) {
    const record = {
      $type: 'org.chaoticharmonylabs.orbit.record',
      name: orbitData.name,
      description: orbitData.description || '',
      createdAt: new Date().toISOString(),
      feeds: orbitData.feeds || {}
    }
    
    const response = await this.agent.com.atproto.repo.createRecord({
      repo: this.agent.session?.did!,
      collection: 'org.chaoticharmonylabs.orbit.record', 
      record
    })
    
    return response.data
  }

  // List all orbit records for a user
  async listOrbits(userDid?: string, limit = 50) {
    const repo = userDid || this.agent.session?.did!
    
    const response = await this.agent.com.atproto.repo.listRecords({
      repo,
      collection: 'org.chaoticharmonylabs.orbit.record',
      limit
    })
    
    return response.data.records
  }

  // Get a specific orbit record
  async getOrbit(uri: string) {
    const parts = uri.split('/')
    const repo = parts[2]
    const rkey = parts[4]
    
    const response = await this.agent.com.atproto.repo.getRecord({
      repo,
      collection: 'org.chaoticharmonylabs.orbit.record',
      rkey
    })
    
    return response.data
  }

  // Update an orbit record
  async updateOrbit(
    uri: string, 
    updates: Partial<{name: string; description: string; feeds: Record<string, any>}>
  ) {
    // Get existing record
    const existing = await this.getOrbit(uri)
    
    // Merge updates
    const updatedRecord = {
      ...existing.value,
      ...updates,
      updatedAt: new Date().toISOString()
    }
    
    const parts = uri.split('/')
    const repo = parts[2]
    const rkey = parts[4]
    
    const response = await this.agent.com.atproto.repo.putRecord({
      repo,
      collection: 'org.chaoticharmonylabs.orbit.record',
      rkey,
      record: updatedRecord
    })
    
    return response.data
  }

  // Delete an orbit record
  async deleteOrbit(uri: string) {
    const parts = uri.split('/')
    const repo = parts[2]
    const rkey = parts[4]
    
    const response = await this.agent.com.atproto.repo.deleteRecord({
      repo,
      collection: 'org.chaoticharmonylabs.orbit.record',
      rkey
    })
    
    return response.data
  }
}

// Usage example
async function example() {
  const agent = new AtpAgent({ service: 'https://your-pds.com' })
  
  // Login first
  await agent.login({
    identifier: 'your-handle',
    password: 'your-password'
  })
  
  const orbitClient = new OrbitClient(agent)
  
  // Create an orbit
  const newOrbit = await orbitClient.createOrbit({
    name: 'Photography',
    description: 'Visual content and photography',
    feeds: {
      photo: 'at://did:web:example.com/app.bsky.feed.generator/photos'
    }
  })
  
  console.log('Created orbit:', newOrbit)
  
  // List orbits
  const orbits = await orbitClient.listOrbits()
  console.log('All orbits:', orbits)
}