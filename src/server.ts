import { PDS, envToCfg, envToSecrets, readEnv } from '@atproto/pds'
import { Lexicons } from '@atproto/lexicon'
import { createServer, Server as XrpcServer } from '@atproto/xrpc-server'
import express from 'express'
import dotenv from 'dotenv'
import { requireAdmin, xrpcError } from './auth'
import fs from 'fs'
import path from 'path'

dotenv.config()

class OrbitsPDS {
  private pds!: PDS
  private xrpc!: XrpcServer
  private ADMIN_PASSWORD = process.env.PDS_ADMIN_PASSWORD!

  constructor() {
    if (!this.ADMIN_PASSWORD) {
      throw new Error('Missing PDS_ADMIN_PASSWORD in .env')
    }
  }

  async start() {
    // 1) Load PDS
    const env = readEnv()
    const config = envToCfg(env)
    const secrets = envToSecrets(env)
    this.pds = await PDS.create(config, secrets)

    // 2) Build your custom XRPC server
    const lexicons = this.loadLexicons()
    this.xrpc = createServer(lexicons)
    this.registerOrbitHandlers(this.xrpc)

    // 3) Merge into the PDS router (the supported extension API)
    this.pds.xrpc!.merge(this.xrpc)
    console.log('✅ SUCCESS: Custom lexicon methods merged into PDS XRPC router')

    // 4) Start PDS
    await this.pds.start()
    console.log(`🚀 PDS running on port ${process.env.PORT}`)

    // 5) (Optional) Expose direct Express health check on 3100
    const app = express()
    app.get('/health', (_req, res) => res.send('OK'))
    app.listen(3100, () => console.log('🔹 Health on :3100/health'))
  }

  private loadLexicons() {
    const base = path.join(__dirname, '../lexicons/org/chaoticharmonylabs')
    const ids: object[] = []
    for (const sub of ['orbit', 'feed', 'user']) {
      const dir = path.join(base, sub)
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
          ids.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))
        }
      }
    }
    return ids
  }

  private registerOrbitHandlers(xrpc: XrpcServer) {
    // LIST
    xrpc.method('org.chaoticharmonylabs.orbit.list', async (ctx) => {
      console.log('📋 orbit.list reached')
      const limit = Number(ctx.params.limit) || 50
      return {
        encoding: 'application/json',
        body: {
          orbits: [
            {
              uri: `at://did:web:${process.env.PDS_HOSTNAME}/org.chaoticharmonylabs.orbit.record/1`,
              cid: 'bafyrei123',
              value: { name: 'Photography', description: '', createdAt: new Date().toISOString(), feeds: {} },
            },
          ].slice(0, limit),
        },
      }
    })

    // GET
    xrpc.method('org.chaoticharmonylabs.orbit.get', async (ctx) => {
      console.log('📖 orbit.get reached')
      const uri = ctx.params.uri
      if (!uri) throw xrpcError('InvalidRequest', 'uri required')
      return {
        encoding: 'application/json',
        body: { uri, cid: 'bafyrei123', value: { name: 'Photography', description: '', createdAt: new Date().toISOString(), feeds: {} } },
      }
    })

    // CREATE
    xrpc.method('org.chaoticharmonylabs.orbit.create', async (ctx) => {
      console.log('📝 orbit.create reached')
      requireAdmin(ctx.req.headers, this.ADMIN_PASSWORD)
      const input = ctx.body
      if (!input?.name) throw xrpcError('InvalidRequest', 'name required')
      return {
        encoding: 'application/json',
        body: {
          uri: `at://did:web:${process.env.PDS_HOSTNAME}/org.chaoticharmonylabs.orbit.record/${Date.now()}`,
          cid: 'bafyrei123',
        },
      }
    })

    // UPDATE
    xrpc.method('org.chaoticharmonylabs.orbit.update', async (ctx) => {
      console.log('✏️ orbit.update reached')
      requireAdmin(ctx.req.headers, this.ADMIN_PASSWORD)
      const input = ctx.body
      if (!input?.uri) throw xrpcError('InvalidRequest', 'uri required')
      return {
        encoding: 'application/json',
        body: { uri: input.uri, cid: 'bafyrei456' },
      }
    })
  }
}

async function main() {
  const server = new OrbitsPDS()
  await server.start()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
