import { PDS, envToCfg, envToSecrets, readEnv } from '@atproto/pds'
import { Lexicons } from '@atproto/lexicon'
import express from 'express'
import dotenv from 'dotenv'
import { requireAdmin, xrpcError } from './auth'
import fs from 'fs'
import path from 'path'
import { AtUri } from '@atproto/syntax'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'

dotenv.config()

class OrbitsPDS {
  private pds: PDS | null = null
  private lexiconResolver: Lexicons | null = null
  private ADMIN_PASSWORD: string

  constructor() {
    this.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
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
    
    const port = parseInt(process.env.PORT || '3000')
    console.log(`🚀 PDS running on port ${port}`)

    // 2) Start custom orbit endpoints on port 3100 
    this.startCustomServer()

    this.setupGracefulShutdown()
  }

  private startCustomServer() {
    const app = express()
    app.use(express.json())
    
    // Health check
    app.get('/health', (_req, res) => res.send('Orbits PDS Custom Endpoints OK'))
    
    // LIST orbits - Read from PDS database
    app.post('/xrpc/org.chaoticharmonylabs.orbit.list', async (req, res) => {
      console.log('📋 orbit.list reached')
      try {
        const limit = Number(req.body?.limit) || 50
        
        // Access the PDS database directly
        const db = (this.pds!.ctx as any).db
        if (!db) {
          return res.status(500).json({ error: 'PDS database not available' })
        }

        // Query the records table for orbit records
        const records = await db.db
          .selectFrom('record')
          .where('collection', '=', 'org.chaoticharmonylabs.orbit.record')
          .selectAll()
          .limit(limit)
          .execute()

        interface OrbitRecord {
          $type: string;
          name: string;
          description: string;
          createdAt: string;
          feeds: Record<string, any>;
          updatedAt?: string;
        }

        interface DatabaseRecord {
          uri: string;
          cid: string;
          json: string;
          did: string;
          collection: string;
          rkey: string;
          indexedAt: string;
        }

        interface OrbitResponse {
          uri: string;
          cid: string;
          value: OrbitRecord;
        }

                const orbits: OrbitResponse[] = records.map((record: DatabaseRecord) => ({
                  uri: record.uri,
                  cid: record.cid,
                  value: JSON.parse(record.json) as OrbitRecord
                }))

        res.json({ orbits })
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

        const db = (this.pds!.ctx as any).db
        if (!db) {
          return res.status(500).json({ error: 'PDS database not available' })
        }

        const record = await db.db
          .selectFrom('record')
          .where('uri', '=', uri)
          .where('collection', '=', 'org.chaoticharmonylabs.orbit.record')
          .selectAll()
          .executeTakeFirst()

        if (!record) {
          return res.status(404).json({ error: 'Orbit not found' })
        }

        res.json({
          uri: record.uri,
          cid: record.cid,
          value: JSON.parse(record.json)
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
        requireAdmin(req.headers, this.ADMIN_PASSWORD)
        
        const input = req.body
        if (!input?.name) {
          return res.status(400).json({ error: 'Name is required' })
        }

        // Validate against lexicon if available
        const record = {
          $type: 'org.chaoticharmonylabs.orbit.record',
          name: input.name,
          description: input.description || '',
          createdAt: new Date().toISOString(),
          feeds: input.feeds || {}
        }

        if (this.lexiconResolver) {
          try {
            this.lexiconResolver.assertValidRecord('org.chaoticharmonylabs.orbit.record', record)
          } catch (validationError: any) {
            return res.status(400).json({ error: `Invalid orbit data: ${validationError.message}` })
          }
        }

        // Generate CID and URI
        const cid = await this.createCID(record)
        const rkey = Date.now().toString()
        const uri = AtUri.make(
          `did:web:${process.env.PDS_HOSTNAME || 'localhost'}`,
          'org.chaoticharmonylabs.orbit.record',
          rkey
        ).toString()

        // Store in PDS database
        const db = (this.pds!.ctx as any).db
        if (!db) {
          return res.status(500).json({ error: 'PDS database not available' })
        }

        await db.db
          .insertInto('record')
          .values({
            uri,
            cid: cid.toString(),
            did: `did:web:${process.env.PDS_HOSTNAME || 'localhost'}`,
            collection: 'org.chaoticharmonylabs.orbit.record',
            rkey,
            json: JSON.stringify(record),
            indexedAt: new Date().toISOString()
          })
          .execute()

        console.log(`📝 Created orbit: ${input.name}`)
        res.json({ uri, cid: cid.toString() })

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
        requireAdmin(req.headers, this.ADMIN_PASSWORD)
        
        const input = req.body
        if (!input?.uri) {
          return res.status(400).json({ error: 'URI is required' })
        }

        const db = (this.pds!.ctx as any).db
        if (!db) {
          return res.status(500).json({ error: 'PDS database not available' })
        }

        // Get existing record
        const existing = await db.db
          .selectFrom('record')
          .where('uri', '=', input.uri)
          .where('collection', '=', 'org.chaoticharmonylabs.orbit.record')
          .selectAll()
          .executeTakeFirst()

        if (!existing) {
          return res.status(404).json({ error: 'Orbit not found' })
        }

        // Update record
        const existingValue = JSON.parse(existing.json)
        const record = {
          ...existingValue,
          ...input,
          uri: undefined, // Remove URI from record data
          updatedAt: new Date().toISOString(),
        }

        const cid = await this.createCID(record)

        // Update in database
        await db.db
          .updateTable('record')
          .set({
            cid: cid.toString(),
            json: JSON.stringify(record),
            indexedAt: new Date().toISOString()
          })
          .where('uri', '=', input.uri)
          .execute()

        console.log(`✏️ Updated orbit: ${input.uri}`)
        res.json({ uri: input.uri, cid: cid.toString() })

      } catch (error: any) {
        console.error('Error in orbit.update:', error)
        const status = error.message?.includes('Authentication') ? 403 : 
                      error.message?.includes('required') ? 400 : 500
        res.status(status).json({ error: error.message })
      }
    })

    // Start server on port 3100
    app.listen(3100, () => {
      console.log('🔹 Custom Orbits endpoints available at http://localhost:3100/xrpc/')
    })
  }

  // Helper to create real CIDs
  private async createCID(data: any): Promise<CID> {
    const bytes = new TextEncoder().encode(JSON.stringify(data))
    const hash = await sha256.digest(bytes)
    return CID.create(1, raw.code, hash)
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
