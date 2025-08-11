import { PDS, createLexiconServer, envToCfg, envToSecrets, readEnv } from '@atproto/pds'
import { Lexicons } from '@atproto/lexicon'
import { createServer } from '@atproto/xrpc-server'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config()

class OrbitsPDS {
  private pds: PDS | null = null
  private lexicons: Map<string, any> = new Map()
  private lexiconResolver: Lexicons | null = null

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
      
      // Register custom lexicons after PDS creation
      await this.registerCustomLexicons()
      
      await this.pds.start()
      
      console.log(`🚀 Orbits PDS running on port ${port}`)
      console.log(`🌐 Service DID: ${process.env.SERVICE_DID || `did:web:${hostname}`}`)
      console.log(`🔗 XRPC endpoint: http://${hostname}:${port}/xrpc`)
      console.log(`📝 Registered ${this.lexicons.size} custom lexicons`)
      
      this.setupGracefulShutdown()
    } catch (error) {
      console.error('❌ Failed to start PDS:', error)
      throw error
    }
  }

  private async registerCustomLexicons() {
    if (!this.pds || !this.lexiconResolver) return
    
    // Create a custom XRPC server for our lexicons
    const xrpcServer = createServer(Array.from(this.lexicons.values()))
    
    // Register handlers for orbit operations
    this.registerOrbitHandlers(xrpcServer)
    
    // Mount the custom lexicon routes on the PDS
    // This is where we would integrate with the PDS XRPC server
    console.log(`✅ Custom lexicon server created with ${this.lexicons.size} lexicons`)
  }

  private registerOrbitHandlers(xrpcServer: any) {
    // Register CREATE orbit handler
    xrpcServer.method('org.chaoticharmonylabs.orbit.create', async (ctx: any) => {
      const { input } = ctx
      
      // Validate input against lexicon
      if (!input.name) {
        throw new Error('Name is required')
      }
      
      // Here you would typically save to database
      // For now, we'll just return a mock response
      const uri = `at://did:web:localhost/org.chaoticharmonylabs.orbit.record/${Date.now()}`
      const cid = 'bafyrei' + Math.random().toString(36).substring(7)
      
      console.log(`📝 Creating orbit: ${input.name}`)
      
      return {
        uri,
        cid,
      }
    })
    
    // Register GET orbit handler
    xrpcServer.method('org.chaoticharmonylabs.orbit.get', async (ctx: any) => {
      const { params } = ctx
      
      if (!params.uri) {
        throw new Error('URI is required')
      }
      
      console.log(`📖 Getting orbit: ${params.uri}`)
      
      // Mock response - in a real implementation, you'd fetch from database
      return {
        uri: params.uri,
        cid: 'bafyrei' + Math.random().toString(36).substring(7),
        value: {
          name: 'Example Orbit',
          description: 'A sample orbit for testing',
          createdAt: new Date().toISOString(),
          feeds: {}
        }
      }
    })
    
    // Register LIST orbits handler
    xrpcServer.method('org.chaoticharmonylabs.orbit.list', async (ctx: any) => {
      const { params } = ctx
      const limit = params.limit || 50
      
      console.log(`📋 Listing orbits (limit: ${limit})`)
      
      // Mock response - in a real implementation, you'd fetch from database
      return {
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
      }
    })
    
    // Register UPDATE orbit handler
    xrpcServer.method('org.chaoticharmonylabs.orbit.update', async (ctx: any) => {
      const { input } = ctx
      
      if (!input.uri) {
        throw new Error('URI is required')
      }
      
      console.log(`✏️ Updating orbit: ${input.uri}`)
      
      // Mock response - in a real implementation, you'd update in database
      return {
        uri: input.uri,
        cid: 'bafyrei' + Math.random().toString(36).substring(7),
      }
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
