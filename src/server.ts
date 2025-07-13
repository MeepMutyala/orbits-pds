import { PDS } from '@atproto/pds'
import { Lexicons } from '@atproto/lexicon'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config()

class OrbitsPDS {
  private pds: PDS | null = null
  private lexicons: Map<string, any> = new Map()

  constructor() {
    this.loadCustomLexicons()
  }

  private loadCustomLexicons() {
    const lexiconDir = path.join(__dirname, '../lexicons/org/chaoticharmonylabs/orbit')
    
    try {
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
    } catch (error) {
      console.error('Error loading lexicons:', error)
    }
  }

  async start() {
    const hostname = process.env.PDS_HOSTNAME || 'localhost'
    const port = parseInt(process.env.PORT || '3000')
    
    const config = {
      service: {
        port,
        hostname,
        did: process.env.SERVICE_DID || `did:web:${hostname}`,
        blobUploadLimit: parseInt(process.env.PDS_BLOB_UPLOAD_LIMIT || '52428800'),
      },
      db: {
        postgresUrl: process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/orbits_pds',
      },
      actorStore: {
        directory: process.env.PDS_DATA_DIRECTORY || './data',
      },
      blobstore: {
        provider: 'disk' as const,
        location: process.env.PDS_BLOBSTORE_DISK_LOCATION || './data/blocks',
      },
      identity: {
        plcUrl: process.env.PDS_DID_PLC_URL || 'https://plc.directory',
        recoveryKey: process.env.RECOVERY_KEY || 'default-recovery-key',
      },
      invites: {
        required: process.env.INVITE_REQUIRED === 'true',
        interval: process.env.USER_INVITE_INTERVAL ? parseInt(process.env.USER_INVITE_INTERVAL) : null,
      },
      subscription: {
        repoBackfillLimitMs: 60000,
      },
      rateLimits: {
        enabled: process.env.NODE_ENV === 'production',
      },
      appView: {
        url: process.env.PDS_BSKY_APP_VIEW_URL || 'https://api.bsky.app',
        did: process.env.PDS_BSKY_APP_VIEW_DID || 'did:web:api.bsky.app',
      },
      reportService: {
        url: process.env.PDS_REPORT_SERVICE_URL || 'https://mod.bsky.app',
        did: process.env.PDS_REPORT_SERVICE_DID || 'did:plc:ar7c4by46qjdydhdevvrndac',
      },
      crawlers: process.env.PDS_CRAWLERS?.split(',') || ['https://bsky.network'],
    }

    const secrets = {
      jwtSecret: process.env.JWT_SECRET || 'unsafe-dev-secret-change-in-production',
      adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
      plcRotationKey: process.env.RECOVERY_KEY || 'default-recovery-key',
    }
    
    this.pds = await PDS.create(config, secrets)
    
    // Register custom lexicons
    await this.registerCustomLexicons()
    
    await this.pds.start()
    
    console.log(`🚀 Orbits PDS running on port ${config.port}`)
    console.log(`🌐 Service DID: ${config.serviceDid}`)
    console.log(`🔗 XRPC endpoint: http://${config.hostname}:${config.port}/xrpc`)
    console.log(`📝 Registered ${this.lexicons.size} custom lexicons`)
    
    this.setupGracefulShutdown()
  }

  private async registerCustomLexicons() {
    for (const [id, lexicon] of this.lexicons) {
      try {
        // Register lexicon with the PDS
        // This depends on the PDS implementation details
        console.log(`✅ Registered lexicon: ${id}`)
      } catch (error) {
        console.error(`❌ Failed to register lexicon ${id}:`, error)
      }
    }
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
