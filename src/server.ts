import { PDS, envToCfg, envToSecrets, readEnv } from '@atproto/pds'
import { Lexicons } from '@atproto/lexicon'
import { createServer, Server as XrpcServer } from '@atproto/xrpc-server'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { requireAdmin, xrpcError } from './auth'

dotenv.config()

class OrbitsPDS {
  private pds: PDS | null = null
  private lexicons: Map<string, any> = new Map()
  private lexiconResolver: Lexicons | null = null
  private xrpc: XrpcServer | null = null
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
      
      // Initialize lexicon resolver first
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
      
      // Create and mount custom XRPC before starting the PDS
      await this.registerCustomLexicons()
      
      await this.pds.start()
      
      console.log(`🚀 Orbits PDS running on port ${port}`)
      console.log(`🌐 Service DID: ${process.env.SERVICE_DID || `did:web:${hostname}`}`)
      
      // Determine the public endpoint URL
      const isProduction = process.env.NODE_ENV === 'production'
      const publicHostname = process.env.HOSTNAME || hostname
      const protocol = isProduction ? 'https' : 'http'
      const portSuffix = (isProduction || port === 80 || port === 443) ? '' : `:${port}`
      
      console.log(`🔗 XRPC endpoint: ${protocol}://${publicHostname}${portSuffix}/xrpc`)
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
    
    // Only debug in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔍 PDS structure:')
      console.log('- Available properties:', Object.keys(this.pds))
    }
    
    try {
      // Build a custom XRPC server using the Lexicons resolver for validation
      this.xrpc = createServer(Array.from(this.lexicons.values()))
      
      // Register your handlers (with admin guard on writes)
      this.registerOrbitHandlers(this.xrpc)
      
      // IMPORTANT: merge your custom server into the PDS xrpc router
      // Try multiple integration approaches with deterministic success reporting
      
      // Method 1: Direct XRPC merge (preferred)
      if ((this.pds as any).xrpc?.merge && typeof (this.pds as any).xrpc.merge === 'function') {
        ;(this.pds as any).xrpc.merge(this.xrpc)
        console.log('✅ SUCCESS: Custom lexicon methods merged into PDS XRPC router (Method 1)')
        return
      }
      
      // Method 2: Add lexicons to existing XRPC server
      if ((this.pds as any).xrpc?.addLexicons && typeof (this.pds as any).xrpc.addLexicons === 'function') {
        ;(this.pds as any).xrpc.addLexicons(Array.from(this.lexicons.values()))
        // Re-register handlers on the main PDS XRPC server
        this.registerOrbitHandlers((this.pds as any).xrpc)
        console.log('✅ SUCCESS: Custom lexicons added to PDS XRPC server (Method 2)')
        return
      }
      
      // Method 3: Mount as Express middleware with router
      if ((this.pds as any).app?.use && (this.xrpc as any).router) {
        ;(this.pds as any).app.use('/xrpc', (this.xrpc as any).router)
        console.log('✅ SUCCESS: Custom lexicon router mounted on /xrpc (Method 3)')
        return
      }
      
      // Method 4: Direct Express route mounting with handler
      if ((this.pds as any).app && (this.xrpc as any).handler) {
        console.log('🔌 Attempting Express middleware integration (Method 4)...')
        ;(this.pds as any).app.use('/xrpc', (req: any, res: any, next: any) => {
          const urlPath = req.url || req.path || ''
          const methodName = urlPath.startsWith('/') ? urlPath.substring(1) : urlPath
          const nsid = methodName.split('?')[0] // Remove query parameters
          
          if (nsid.startsWith('org.chaoticharmonylabs.orbit.')) {
            console.log(`🎯 Intercepting custom method: ${nsid}`)
            try {
              return (this.xrpc as any).handler(req, res)
            } catch (error) {
              console.error('Error in custom XRPC handler:', error)
              res.status(500).json({ error: 'Internal server error' })
              return
            }
          }
          
          next()
        })
        console.log('✅ SUCCESS: Custom XRPC handler mounted as middleware (Method 4)')
        return
      }
      
      console.warn('⚠️ FAILED: Could not attach custom XRPC to PDS. Check PDS API version.')
      console.warn('Available PDS properties:', Object.keys(this.pds || {}))
      if (this.xrpc) {
        console.warn('Available XRPC properties:', Object.keys(this.xrpc))
      }
      
    } catch (error) {
      console.error('❌ Error registering custom lexicons:', error)
    }
  }

  private registerOrbitHandlers(xrpcServer: XrpcServer) {
    // LIST (public)
    xrpcServer.method('org.chaoticharmonylabs.orbit.list', async (ctx: any) => {
      try {
        // Parse parameters from various sources
        const limit = Number(
          ctx?.params?.limit || 
          ctx?.req?.query?.limit ||
          ctx?.req?.url?.match(/limit=(\d+)/)?.[1] ||
          50
        )
        
        console.log(`📋 Listing orbits (limit: ${limit})`)
        
        return {
          encoding: 'application/json',
          body: {
            orbits: [
              {
                uri: `at://did:web:${process.env.PDS_HOSTNAME || 'localhost'}/org.chaoticharmonylabs.orbit.record/1`,
                cid: 'bafyrei' + Math.random().toString(36).substring(7),
                value: {
                  name: 'Photography',
                  description: 'Photos and visual content',
                  createdAt: new Date().toISOString(),
                  feeds: {},
                },
              },
              {
                uri: `at://did:web:${process.env.PDS_HOSTNAME || 'localhost'}/org.chaoticharmonylabs.orbit.record/2`,
                cid: 'bafyrei' + Math.random().toString(36).substring(7),
                value: {
                  name: 'Philosophy',
                  description: 'Deep thoughts and discussions',
                  createdAt: new Date().toISOString(),
                  feeds: {},
                },
              },
            ],
          },
        }
      } catch (error: any) {
        throw xrpcError('InternalServerError', `Failed to list orbits: ${error.message}`)
      }
    })

    // GET (public)
    xrpcServer.method('org.chaoticharmonylabs.orbit.get', async (ctx: any) => {
      try {
        const uri = ctx.params?.uri || ctx?.req?.query?.uri
        if (!uri) {
          throw xrpcError('InvalidRequest', 'URI parameter is required')
        }
        
        console.log(`📖 Getting orbit: ${uri}`)
        
        return {
          encoding: 'application/json',
          body: {
            uri,
            cid: 'bafyrei' + Math.random().toString(36).substring(7),
            value: {
              name: 'Example Orbit',
              description: 'A sample orbit for testing',
              createdAt: new Date().toISOString(),
              feeds: {},
            },
          },
        }
      } catch (error: any) {
        if (error.error) throw error // Already an XRPC error
        throw xrpcError('InternalServerError', `Failed to get orbit: ${error.message}`)
      }
    })

    // CREATE (admin)
    xrpcServer.method('org.chaoticharmonylabs.orbit.create', async (ctx: any) => {
      try {
        requireAdmin(ctx.req?.headers ?? {}, this.ADMIN_PASSWORD)
        
        // Parse input from various sources with proper JSON handling
        const input = await this.parseInput(ctx)
        
        // Validate against lexicon schema using the resolver
        if (this.lexiconResolver) {
          try {
            this.lexiconResolver.assertValidRecord('org.chaoticharmonylabs.orbit.record', input)
          } catch (validationError: any) {
            throw xrpcError('InvalidRequest', `Invalid orbit data: ${validationError.message}`)
          }
        }
        
        if (!input.name) {
          throw xrpcError('InvalidRequest', 'Name is required')
        }
        
        const uri = `at://did:web:${process.env.PDS_HOSTNAME || 'localhost'}/org.chaoticharmonylabs.orbit.record/${Date.now()}`
        const cid = 'bafyrei' + Math.random().toString(36).substring(7)
        
        console.log(`📝 Creating orbit: ${input.name}`)
        
        return { 
          encoding: 'application/json', 
          body: { uri, cid } 
        }
      } catch (error: any) {
        if (error.error) throw error // Already an XRPC error
        throw xrpcError('InternalServerError', `Failed to create orbit: ${error.message}`)
      }
    })

    // UPDATE (admin)
    xrpcServer.method('org.chaoticharmonylabs.orbit.update', async (ctx: any) => {
      try {
        requireAdmin(ctx.req?.headers ?? {}, this.ADMIN_PASSWORD)
        
        const input = await this.parseInput(ctx)
        
        if (!input.uri) {
          throw xrpcError('InvalidRequest', 'URI is required')
        }
        
        const cid = 'bafyrei' + Math.random().toString(36).substring(7)
        
        console.log(`✏️ Updating orbit: ${input.uri}`)
        
        return { 
          encoding: 'application/json', 
          body: { uri: input.uri, cid } 
        }
      } catch (error: any) {
        if (error.error) throw error // Already an XRPC error
        throw xrpcError('InternalServerError', `Failed to update orbit: ${error.message}`)
      }
    })
  }

  private async parseInput(ctx: any): Promise<any> {
    // Try various input sources
    let input = ctx.input ?? ctx.body ?? ctx.req?.body

    // If no input found, try parsing raw request data
    if (!input && ctx.req) {
      try {
        const rawData = await new Promise<string>((resolve) => {
          let data = ''
          ctx.req.on('data', (chunk: any) => data += chunk)
          ctx.req.on('end', () => resolve(data))
          ctx.req.on('error', () => resolve(''))
        })
        
        input = rawData ? JSON.parse(rawData) : {}
      } catch {
        input = {}
      }
    }

    return input || {}
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
