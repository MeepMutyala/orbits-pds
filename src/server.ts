import { PDS, envToCfg, envToSecrets, readEnv } from '@atproto/pds'
import { Lexicons } from '@atproto/lexicon'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { requireAdmin } from './auth'

dotenv.config()

class OrbitsPDS {
  private pds: PDS | null = null
  private lexicons: Map<string, any> = new Map()
  private lexiconResolver: Lexicons | null = null
  private ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

  constructor() {
    this.loadCustomLexicons()
  }

  private loadCustomLexicons() {
    const baseDir = path.join(__dirname, '../lexicons/org/chaoticharmonylabs')
    
    try {
      const schemas = ['orbit', 'feed', 'user']
      
      for (const schema of schemas) {
        const lexiconDir = path.join(baseDir, schema)
        
        if (fs.existsSync(lexiconDir)) {
          const files = fs.readdirSync(lexiconDir)
          
          for (const file of files) {
            if (file.endsWith('.json')) {
              const filePath = path.join(lexiconDir, file)
              const lexiconData = JSON.parse(fs.readFileSync(filePath, 'utf8'))
              
              if (lexiconData.id) {
                this.lexicons.set(lexiconData.id, lexiconData)
                console.log(`📋 Loaded lexicon: ${lexiconData.id}`)
              }
            }
          }
        }
      }
      
      // Initialize lexicon resolver
      this.lexiconResolver = new Lexicons(Array.from(this.lexicons.values()))
    } catch (error) {
      console.error('Error loading lexicons:', error)
    }
  }

  async start() {
    const hostname = process.env.PDS_HOSTNAME || 'localhost'
    const port = parseInt(process.env.PORT || '3000')
    
    try {
      // Simple configuration for development - use environment variables
      process.env.NODE_ENV = process.env.NODE_ENV || 'development'
      process.env.PDS_HOSTNAME = hostname
      process.env.PORT = port.toString()
      process.env.PDS_DATA_DIRECTORY = process.env.PDS_DATA_DIRECTORY || './data'
      process.env.JWT_SECRET = process.env.JWT_SECRET || 'unsafe-dev-secret-change-in-production'
      process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
      
      // Create PDS with environment-based configuration
      const env = readEnv()
      const config = envToCfg(env)
      const secrets = envToSecrets(env)
      
      this.pds = await PDS.create(config, secrets)
      
      // Register custom lexicons and handlers after PDS creation but before start
      await this.registerCustomLexicons()
      
      await this.pds.start()
      
      console.log(`🚀 Orbits PDS running on port ${port}`)
      console.log(`🌐 Service DID: ${process.env.SERVICE_DID || `did:web:${hostname}`}`)
      console.log(`🔗 XRPC endpoint: http://${hostname}:${port}/xrpc`)
      console.log(`📝 Registered ${this.lexicons.size} custom lexicons`)
      console.log(`🔒 Admin endpoints protected with header authentication`)
      
      this.setupGracefulShutdown()
    } catch (error) {
      console.error('❌ Failed to start PDS:', error)
      throw error
    }
  }

  private async registerCustomLexicons() {
    if (!this.pds || !this.lexiconResolver) return
    
    // Debug what's available on the PDS instance
    console.log('🔍 PDS structure:')
    console.log('- Available properties:', Object.keys(this.pds))
    
    try {
      // Method 1: Try to access the PDS server/app to add middleware
      if (this.pds.app) {
        console.log('✅ Found Express app - adding custom routes')
        
        // Add custom XRPC method handlers directly to the Express app
        this.pds.app.post('/xrpc/org.chaoticharmonylabs.orbit.create', async (req, res) => {
          try {
            await this.handleCreateOrbit(req, res)
          } catch (error: any) {
            console.error('Error in orbit.create:', error)
            res.status(error.status || 500).json({ 
              error: error.message || 'Internal server error' 
            })
          }
        })
        
        this.pds.app.post('/xrpc/org.chaoticharmonylabs.orbit.update', async (req, res) => {
          try {
            await this.handleUpdateOrbit(req, res)
          } catch (error: any) {
            console.error('Error in orbit.update:', error)
            res.status(error.status || 500).json({ 
              error: error.message || 'Internal server error' 
            })
          }
        })
        
        this.pds.app.get('/xrpc/org.chaoticharmonylabs.orbit.get', async (req, res) => {
          try {
            await this.handleGetOrbit(req, res)
          } catch (error: any) {
            console.error('Error in orbit.get:', error)
            res.status(error.status || 500).json({ 
              error: error.message || 'Internal server error' 
            })
          }
        })
        
        this.pds.app.get('/xrpc/org.chaoticharmonylabs.orbit.list', async (req, res) => {
          try {
            await this.handleListOrbits(req, res)
          } catch (error: any) {
            console.error('Error in orbit.list:', error)
            res.status(error.status || 500).json({ 
              error: error.message || 'Internal server error' 
            })
          }
        })
        
        console.log('✅ Custom orbit handlers registered as Express routes')
        return
      }
      
      console.log('⚠️ No suitable integration method found')
      console.log('Custom lexicons loaded but handlers not registered')
      
    } catch (error) {
      console.error('❌ Error registering custom lexicons:', error)
    }
  }

  // Handler implementations using proper Express req/res pattern
  private async handleCreateOrbit(req: any, res: any) {
    // Require admin authentication
    requireAdmin(req.headers || {}, this.ADMIN_PASSWORD)
    
    const input = req.body
    
    // Validate input against lexicon
    if (!input || !input.name) {
      throw new Error('Name is required')
    }
    
    // Here you would typically save to database
    // For now, we'll just return a mock response
    const uri = `at://did:web:localhost/org.chaoticharmonylabs.orbit.record/${Date.now()}`
    const cid = 'bafyrei' + Math.random().toString(36).substring(7)
    
    console.log(`📝 Creating orbit: ${input.name}`)
    
    res.json({
      uri,
      cid,
    })
  }

  private async handleUpdateOrbit(req: any, res: any) {
    // Require admin authentication
    requireAdmin(req.headers || {}, this.ADMIN_PASSWORD)
    
    const input = req.body
    
    if (!input || !input.uri) {
      throw new Error('URI is required')
    }
    
    console.log(`✏️ Updating orbit: ${input.uri}`)
    
    res.json({
      uri: input.uri,
      cid: 'bafyrei' + Math.random().toString(36).substring(7),
    })
  }

  private async handleGetOrbit(req: any, res: any) {
    const { uri } = req.query
    
    if (!uri) {
      throw new Error('URI is required')
    }
    
    console.log(`📖 Getting orbit: ${uri}`)
    
    res.json({
      uri: uri,
      cid: 'bafyrei' + Math.random().toString(36).substring(7,),
      value: {
        name: 'Example Orbit',
        description: 'A sample orbit for testing',
        createdAt: new Date().toISOString(),
        feeds: {}
      }
    })
  }

  private async handleListOrbits(req: any, res: any) {
    const limit = parseInt(req.query.limit as string) || 50
    
    console.log(`📋 Listing orbits (limit: ${limit})`)
    
    res.json({
      orbits: [
        {
          uri: `at://did:web:localhost/org.chaoticharmonylabs.orbit.record/1`,
          cid: 'bafyrei' + Math.random().toString(36).substring(7),
          value: {
            name: 'Photography',
            description: 'Photos and visual content',
            createdAt: new Date().toISOString(),
            feeds: {}
          }
        },
        {
          uri: `at://did:web:localhost/org.chaoticharmonylabs.orbit.record/2`,
          cid: 'bafyrei' + Math.random().toString(36).substring(7),
          value: {
            name: 'Philosophy',
            description: 'Deep thoughts and discussions',
            createdAt: new Date().toISOString(),
            feeds: {}
          }
        }
      ]
    })
  }

  private setupGracefulShutdown() {
    const shutdown = async (signal: string) => {
      console.log(`${signal} signal received: closing server`)
      if (this.pds) {
        await this.pds.destroy()
      }
      process.exit(0)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }
}

async function main() {
  try {
    const orbits = new OrbitsPDS()
    await orbits.start()
  } catch (error) {
    console.error('Failed to start Orbits PDS:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

export { OrbitsPDS }
