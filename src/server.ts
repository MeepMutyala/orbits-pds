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

// Typed interfaces for strong safety
interface OrbitRecord {
  $type: 'org.chaoticharmonylabs.orbit.record'
  name: string
  description: string
  createdAt: string
  feeds: Record<string, any>
  updatedAt?: string
}
interface DatabaseRecord {
  uri: string
  cid: string
  json: string
  did: string
  collection: string
  rkey: string
  indexedAt: string
}
interface OrbitResponse {
  uri: string
  cid: string
  value: OrbitRecord
}

class OrbitsPDS {
  private pds: PDS | null = null
  private lexiconResolver: Lexicons | null = null
  private ADMIN_PASSWORD: string

  constructor() {
    this.ADMIN_PASSWORD = process.env.PDS_ADMIN_PASSWORD || 'admin123'
    this.loadLexicons()
  }

  // Load custom lexicons from disk
  private loadLexicons() {
    const base = path.join(__dirname, '../lexicons/org/chaoticharmonylabs')
    const lexicons: any[] = []
    for (const schema of ['orbit','feed','user']) {
      const dir = path.join(base, schema)
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
            lexicons.push(data)
            console.log(`📋 Loaded lexicon: ${data.id}`)
          } catch(e) {
            console.error(`Lexicon load error (${file}):`, e)
          }
        }
      }
    }
    if (lexicons.length) {
      this.lexiconResolver = new Lexicons(lexicons)
    }
  }

  async start() {
    // 1) Start the PDS
    const env = readEnv()
    const config = envToCfg(env)
    const secrets = envToSecrets(env)
    this.pds = await PDS.create(config, secrets)
    await this.pds.start()
    console.log(`🚀 PDS running on port ${process.env.PORT || 3000}`)

    // 2) Launch custom Express server on 3100
    this.launchCustomServer()

    // 3) Handle shutdown
    this.setupGracefulShutdown()
  }

  private launchCustomServer() {
    const app = express()
    app.use(express.json())

    // Health check
    app.get('/health', (_req, res) => res.send('OK'))

    //  LIST orbits
    app.post('/xrpc/org.chaoticharmonylabs.orbit.list', async (req, res) => {
      try {
        const limit = Number(req.body.limit) || 50
        const db = (this.pds!.ctx as any).db as import('kysely').Kysely<any>
        const records = await db
          .selectFrom('record')
          .where('collection','=', 'org.chaoticharmonylabs.orbit.record')
          .selectAll()
          .limit(limit)
          .execute()
        const orbits: OrbitResponse[] = (records as DatabaseRecord[]).map(r => ({
          uri: r.uri, cid: r.cid, value: JSON.parse(r.json) as OrbitRecord
        }))
        res.json({ orbits })
      } catch(e: any) {
        console.error(e)
        res.status(500).json({ error: e.message })
      }
    })

    //  GET single orbit
    app.post('/xrpc/org.chaoticharmonylabs.orbit.get', async (req, res) => {
      try {
        const uri = req.body.uri
        if (!uri) throw xrpcError('InvalidRequest','uri required')
        const db = (this.pds!.ctx as any).db
        const rec = await db
          .selectFrom('record')
          .where('uri','=', uri)
          .where('collection','=', 'org.chaoticharmonylabs.orbit.record')
          .selectAll()
          .executeTakeFirst()
        if (!rec) return res.status(404).json({ error:'not found' })
        res.json({ uri: rec.uri, cid: rec.cid, value: JSON.parse(rec.json) as OrbitRecord })
      } catch(e: any) {
        console.error(e)
        res.status(e.error==='InvalidRequest'?400:500).json({ error: e.message })
      }
    })

    //  CREATE orbit
    app.post('/xrpc/org.chaoticharmonylabs.orbit.create', async (req, res) => {
      try {
        requireAdmin(req.headers, this.ADMIN_PASSWORD)
        const input = req.body
        if (!input.name) throw xrpcError('InvalidRequest','name required')

        const record: OrbitRecord = {
          $type: 'org.chaoticharmonylabs.orbit.record',
          name: input.name,
          description: input.description||'',
          createdAt: new Date().toISOString(),
          feeds: input.feeds||{}
        }
        if (this.lexiconResolver) {
          this.lexiconResolver.assertValidRecord(record.$type, record)
        }

        const cid = await this.createCid(record)
        const rkey = Date.now().toString()
        const uri = AtUri.make(`did:web:${process.env.PDS_HOSTNAME||'localhost'}`,
                               record.$type, rkey).toString()

        const db = (this.pds!.ctx as any).db
        await db
          .insertInto('record')
          .values({
            uri, cid: cid.toString(),
            did: `did:web:${process.env.PDS_HOSTNAME||'localhost'}`,
            collection: record.$type, rkey,
            json: JSON.stringify(record),
            indexedAt: new Date().toISOString()
          })
          .execute()

        res.json({ uri, cid: cid.toString() })
      } catch(e: any) {
        console.error(e)
        const code = e.error==='InvalidRequest'?400: e.message.includes('Authentication')?403:500
        res.status(code).json({ error: e.message })
      }
    })

    //  UPDATE orbit
    app.post('/xrpc/org.chaoticharmonylabs.orbit.update', async (req, res) => {
      try {
        requireAdmin(req.headers, this.ADMIN_PASSWORD)
        const { uri, ...updates } = req.body
        if (!uri) throw xrpcError('InvalidRequest','uri required')

        const db = (this.pds!.ctx as any).db
        const existing = await db
          .selectFrom('record')
          .where('uri','=',uri)
          .selectAll()
          .executeTakeFirst()
        if (!existing) return res.status(404).json({ error:'not found' })

        const base = JSON.parse(existing.json)
        const record = { ...base, ...updates, updatedAt: new Date().toISOString() }
        const cid = await this.createCid(record)

        await db
          .updateTable('record')
          .set({ cid: cid.toString(), json: JSON.stringify(record), indexedAt: new Date().toISOString() })
          .where('uri','=',uri)
          .execute()

        res.json({ uri, cid: cid.toString() })
      } catch(e: any) {
        console.error(e)
        const code = e.error==='InvalidRequest'?400: e.message.includes('Authentication')?403:500
        res.status(code).json({ error: e.message })
      }
    })

    app.listen(3100, () => console.log('🔹 Custom Orbits on :3100'))
  }

  // CID helper
  private async createCid(obj: unknown): Promise<CID> {
    const bytes = new TextEncoder().encode(JSON.stringify(obj))
    const hash = await sha256.digest(bytes)
    return CID.create(1, raw.code, hash)
  }

  // Graceful shutdown
  private setupGracefulShutdown() {
    const shutdown = async (sig:string) => {
      console.log(`${sig} received, shutting down`)
      if (this.pds) await this.pds.destroy()
      process.exit(0)
    }
    process.on('SIGINT',() => shutdown('SIGINT'))
    process.on('SIGTERM',() => shutdown('SIGTERM'))
  }
}

if (require.main===module) {
  const server = new OrbitsPDS()
  server.start().catch(err=>{ console.error(err); process.exit(1) })
}

export { OrbitsPDS }
