import { PDS, envToCfg, envToSecrets, readEnv } from '@atproto/pds'
import { Lexicons } from '@atproto/lexicon'
import express from 'express'
import dotenv from 'dotenv'
import { requireAdmin, xrpcError } from './auth'
import fs from 'fs'
import path from 'path'

dotenv.config()

class OrbitsPDS {
  private pds!: PDS
  private lexiconResolver: Lexicons | null = null
  private ADMIN_PASSWORD: string

  constructor() {
    this.ADMIN_PASSWORD = process.env.PDS_ADMIN_PASSWORD || 'admin123'
    this.loadLexicons()
  }

  private loadLexicons() {
    const base = path.join(__dirname, '../lexicons/org/chaoticharmonylabs')
    const lexicons: any[] = []
    
    const schemas = ['orbit', 'feed', 'user']
    for (const schema of schemas) {
      const dir = path.join(base, schema)
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
        for (const file of files) {
          try {
            const lexiconPath = path.join(dir, file)
            const lexiconData = JSON.parse(fs.readFileSync(lexiconPath, 'utf8'))
            lexicons.push(lexiconData)
            console.log(`📋 Loaded lexicon: ${lexiconData.id}`)
          } catch (error) {
            console.error(`Error loading lexicon ${file}:`, error)
          }
        }
      }
    }
    
    if (lexicons.length > 0) {
      this.lexiconResolver = new Lexicons(lexicons)
    }
  }

  async start() {
    // 1) Start the main PDS
    const env = readEnv()
    const config = envToCfg(env)
    const secrets = envToSecrets(env)
    this.pds = await PDS.create(config, secrets)
    await this.pds.start()
    
    console.log(`🚀 PDS running on port ${process.env.PORT || 3000}`)

    // 2) Start custom XRPC endpoints on port 3100
    const customApp = express()
    customApp.use(express.json())
    
    // Health check
    customApp.get('/health', (_req, res) => res.send('OK'))
    
    // Custom orbit endpoints
    this.setupOrbitRoutes(customApp)
    
    customApp.listen(3100, () => {
      console.log('🔹 Custom XRPC endpoints available at http://localhost:3100/xrpc/')
    })

    // Graceful shutdown
    this.setupGracefulShutdown()
  }

  private setupOrbitRoutes(app: express.Application) {
    // LIST orbits
    app.post('/xrpc/org.chaoticharmonylabs.orbit.list', async (req, res) => {
      console.log('📋 orbit.list reached')
      try {
        const limit = Number(req.body?.limit) || 50
        
        const orbits = [
          {
            uri: `at://did:web:${process.env.PDS_HOSTNAME || 'localhost'}/org.chaoticharmonylabs.orbit.record/1`,
            cid: 'bafyrei' + Math.random().toString(36).substring(7),
            value: {
              name: 'Photography',
              description: 'Photos and visual content',
              createdAt: new Date().toISOString(),
              feeds: {}
            }
          },
          {
            uri: `at://did:web:${process.env.PDS_HOSTNAME || 'localhost'}/org.chaoticharmonylabs.orbit.record/2`,
            cid: 'bafyrei' + Math.random().toString(36).substring(7),
            value: {
              name: 'Philosophy',
              description: 'Deep thoughts and discussions',
              createdAt: new Date().toISOString(),
              feeds: {}
            }
          }
        ]

        res.json({ orbits: orbits.slice(0, limit) })
      } catch (error: any) {
        console.error('Error in orbit.list:', error)
        res.status(500).json({ error: error.message })
      }
    })

    // GET single orbit
    app.post('/xrpc/org.chaoticharmonylabs.orbit.get', async (req, res) => {
      console.log('📖 orbit.get reached')
      try {
        const uri = req.body?.uri
        if (!uri) {
          return res.status(400).json({ error: 'URI is required' })
        }

        res.json({
          uri,
          cid: 'bafyrei' + Math.random().toString(36).substring(7),
          value: {
            name: 'Example Orbit',
            description: 'A sample orbit for testing',
            createdAt: new Date().toISOString(),
            feeds: {}
          }
        })
      } catch (error: any) {
        console.error('Error in orbit.get:', error)
        res.status(500).json({ error: error.message })
      }
    })

    // CREATE orbit (admin only)
    app.post('/xrpc/org.chaoticharmonylabs.orbit.create', async (req, res) => {
      console.log('📝 orbit.create reached')
      try {
        // Check admin authentication
        requireAdmin(req.headers, this.ADMIN_PASSWORD)
        
        const input = req.body
        if (!input?.name) {
          return res.status(400).json({ error: 'Name is required' })
        }

        // Validate against lexicon if available
        if (this.lexiconResolver) {
          try {
            this.lexiconResolver.assertValidRecord('org.chaoticharmonylabs.orbit.record', input)
          } catch (validationError: any) {
            return res.status(400).json({ error: `Invalid orbit data: ${validationError.message}` })
          }
        }

        const uri = `at://did:web:${process.env.PDS_HOSTNAME || 'localhost'}/org.chaoticharmonylabs.orbit.record/${Date.now()}`
        const cid = 'bafyrei' + Math.random().toString(36).substring(7)

        console.log(`📝 Creating orbit: ${input.name}`)
        res.json({ uri, cid })
      } catch (error: any) {
        console.error('Error in orbit.create:', error)
        const status = error.message?.includes('Authentication') ? 403 : 
                      error.message?.includes('required') ? 400 : 500
        res.status(status).json({ error: error.message })
      }
    })

    // UPDATE orbit (admin only)
    app.post('/xrpc/org.chaoticharmonylabs.orbit.update', async (req, res) => {
      console.log('✏️ orbit.update reached')
      try {
        // Check admin authentication
        requireAdmin(req.headers, this.ADMIN_PASSWORD)
        
        const input = req.body
        if (!input?.uri) {
          return res.status(400).json({ error: 'URI is required' })
        }

        const cid = 'bafyrei' + Math.random().toString(36).substring(7)
        console.log(`✏️ Updating orbit: ${input.uri}`)
        
        res.json({ uri: input.uri, cid })
      } catch (error: any) {
        console.error('Error in orbit.update:', error)
        const status = error.message?.includes('Authentication') ? 403 : 
                      error.message?.includes('required') ? 400 : 500
        res.status(status).json({ error: error.message })
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
    const server = new OrbitsPDS()
    await server.start()
  } catch (error) {
    console.error('Failed to start Orbits PDS:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

export { OrbitsPDS }
