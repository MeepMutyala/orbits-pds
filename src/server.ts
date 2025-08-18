import { PDS, envToCfg, envToSecrets, readEnv } from '@atproto/pds'
import { Lexicons } from '@atproto/lexicon'
import { createServer, Server as XrpcServer } from '@atproto/xrpc-server'
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
      
      // Initialize lexicon resolver for validation
      this.lexiconResolver = new Lexicons(Array.from(this.lexicons.values()))
    } catch (error) {
      console.error('Error loading lexicons:', error)
    }
  }

  async start() {
    const hostname = process.env.PDS_HOSTNAME || 'localhost'
    const port = parseInt(process.env.PORT || '3000')
    
    try {
      // Configure environment
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
    
    // Debug in development only
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔍 PDS structure:')
      console.log('- Available properties:', Object.keys(this.pds))
    }
    
    try {
      // Build XRPC server using raw lexicon array (createServer expects this format)
      const lexiconArray = Array.from(this.lexicons.values())
      this.xrpc = createServer(lexiconArray)
      
      // Register handlers
      this.registerOrbitHandlers(this.xrpc)
      
      // Try to integrate with PDS XRPC router
      if ((this.pds as any).xrpc?.merge && typeof (this.pds as any).xrpc.merge === 'function') {
        ;(this.pds as any).xrpc.merge(this.xrpc)
        console.log('✅ SUCCESS: Custom lexicon methods merged into PDS XRPC router')
        return
      }
      
      // Fallback: Mount as Express middleware
      if ((this.pds as any).app) {
        console.log('🔌 Mounting custom XRPC as Express middleware')
        ;(this.pds as any).app.use('/xrpc', (req: any, res: any, next: any) => {
          const urlPath = req.url || req.path || ''
          const methodName = urlPath.startsWith('/') ? urlPath.substring(1) : urlPath
          const nsid = methodName.split('?')[0]
          
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
        console.log('✅ SUCCESS: Custom XRPC handler mounted as middleware')
        return
      }
      
      console.warn('⚠️ Could not attach custom XRPC to PDS')
      
    } catch (error) {
      console.error('❌ Error registering custom lexicons:', error)
    }
  }

  private registerOrbitHandlers(xrpcServer: XrpcServer) {
    // LIST (public) - Read from actual PDS database or fail
    xrpcServer.method('org.chaoticharmonylabs.orbit.list', async (ctx: any) => {
      try {
        const limit = Number(
          ctx?.params?.limit || 
          ctx?.req?.query?.limit ||
          50
        )
        
        console.log(`📋 Listing orbits from PDS (limit: ${limit})`)
        
        // Get repository service - fail if not available
        const repoService = (this.pds as any)?.services?.repo
        if (!repoService) {
          console.error('❌ PDS repository service is not available')
          console.error('Available PDS services:', Object.keys((this.pds as any)?.services || {}))
          throw xrpcError('ServiceUnavailable', 'PDS repository service is not available')
        }

        // Get service DID
        const serviceDid = (this.pds as any).ctx?.cfg?.service?.did || `did:web:${process.env.PDS_HOSTNAME}`
        console.log(`🔍 Using service DID: ${serviceDid}`)

        // Try to read from PDS repository
        const result = await repoService.listRecords({
          repo: serviceDid,
          collection: 'org.chaoticharmonylabs.orbit.record',
          limit,
        })
        
        console.log(`✅ Successfully retrieved ${result.records?.length || 0} orbit records`)
        
        return {
          encoding: 'application/json',
          body: { orbits: result.records || [] }
        }
      } catch (error: any) {
        console.error('❌ Failed to list orbits:', error)
        if (error.error) throw error // Already an XRPC error
        throw xrpcError('InternalServerError', `Failed to list orbits: ${error.message}`)
      }
    })

    // GET (public) - Read specific record from PDS or fail
    xrpcServer.method('org.chaoticharmonylabs.orbit.get', async (ctx: any) => {
      try {
        const uri = ctx.params?.uri || ctx?.req?.query?.uri
        if (!uri) {
          throw xrpcError('InvalidRequest', 'URI parameter is required')
        }
        
        console.log(`📖 Getting orbit from PDS: ${uri}`)
        
        // Get repository service - fail if not available
        const repoService = (this.pds as any)?.services?.repo
        if (!repoService) {
          console.error('❌ PDS repository service is not available')
          throw xrpcError('ServiceUnavailable', 'PDS repository service is not available')
        }

        // Parse URI to get rkey
        let rkey: string
        try {
          rkey = new URL(uri).pathname.split('/').pop()!
          if (!rkey) {
            throw new Error('Invalid URI format - no rkey found')
          }
        } catch (uriError: any) {
          console.error('❌ Failed to parse URI:', uriError.message)
          throw xrpcError('InvalidRequest', `Invalid URI format: ${uriError.message}`)
        }

        // Get service DID
        const serviceDid = (this.pds as any).ctx?.cfg?.service?.did || `did:web:${process.env.PDS_HOSTNAME}`
        console.log(`🔍 Using service DID: ${serviceDid}, rkey: ${rkey}`)

        // Try to read from PDS repository
        const result = await repoService.getRecord({
          repo: serviceDid,
          collection: 'org.chaoticharmonylabs.orbit.record',
          rkey,
        })
        
        console.log(`✅ Successfully retrieved orbit record: ${uri}`)
        
        return {
          encoding: 'application/json',
          body: { uri, cid: result.cid, value: result.value }
        }
      } catch (error: any) {
        console.error('❌ Failed to get orbit:', error)
        if (error.error) throw error // Already an XRPC error
        throw xrpcError('InternalServerError', `Failed to get orbit: ${error.message}`)
      }
    })

    // CREATE (admin) - Store in actual PDS database or fail
    xrpcServer.method('org.chaoticharmonylabs.orbit.create', async (ctx: any) => {
      try {
        requireAdmin(ctx.req?.headers ?? {}, this.ADMIN_PASSWORD)
        
        const input = await this.parseInput(ctx)
        
        // Validate against lexicon schema using the resolver
        if (this.lexiconResolver) {
          try {
            // Use the lexicon resolver for validation
            const recordData = {
              $type: 'org.chaoticharmonylabs.orbit.record',
              ...input
            }
            this.lexiconResolver.assertValidRecord('org.chaoticharmonylabs.orbit.record', recordData)
          } catch (validationError: any) {
            console.error('❌ Schema validation failed:', validationError.message)
            throw xrpcError('InvalidRequest', `Invalid orbit data: ${validationError.message}`)
          }
        }
        
        if (!input.name) {
          throw xrpcError('InvalidRequest', 'Name is required')
        }
        
        // Create the record
        const record = {
          $type: 'org.chaoticharmonylabs.orbit.record',
          name: input.name,
          description: input.description || '',
          createdAt: new Date().toISOString(),
          feeds: input.feeds || {},
        }
        
        // Generate CID and URI
        const cid = await this.createCID(record)
        const rkey = Date.now().toString()
        const uri = AtUri.make(
          `did:web:${process.env.PDS_HOSTNAME || 'localhost'}`,
          'org.chaoticharmonylabs.orbit.record',
          rkey
        ).toString()
        
        // Get repository service - fail if not available
        const repoService = (this.pds as any)?.services?.repo
        if (!repoService) {
          console.error('❌ PDS repository service is not available for record creation')
          console.error('Available PDS services:', Object.keys((this.pds as any)?.services || {}))
          throw xrpcError('ServiceUnavailable', 'PDS repository service is not available for record creation')
        }

        // Get service DID
        const serviceDid = (this.pds as any).ctx?.cfg?.service?.did || `did:web:${process.env.PDS_HOSTNAME}`
        console.log(`🔍 Creating record with service DID: ${serviceDid}, rkey: ${rkey}`)

        // Store in PDS repository
        await repoService.createRecord({
          repo: serviceDid,
          collection: 'org.chaoticharmonylabs.orbit.record',
          rkey,
          record,
          swapCommit: false,
        })
        
        console.log(`✅ Successfully created orbit in PDS: ${input.name}`)
        
        return { 
          encoding: 'application/json', 
          body: { uri, cid: cid.toString() } 
        }
      } catch (error: any) {
        console.error('❌ Failed to create orbit:', error)
        if (error.error) throw error // Already an XRPC error
        throw xrpcError('InternalServerError', `Failed to create orbit: ${error.message}`)
      }
    })

    // UPDATE (admin) - Update in actual PDS database or fail
    xrpcServer.method('org.chaoticharmonylabs.orbit.update', async (ctx: any) => {
      try {
        requireAdmin(ctx.req?.headers ?? {}, this.ADMIN_PASSWORD)
        
        const input = await this.parseInput(ctx)
        
        if (!input.uri) {
          throw xrpcError('InvalidRequest', 'URI is required')
        }
        
        // Get repository service - fail if not available
        const repoService = (this.pds as any)?.services?.repo
        if (!repoService) {
          console.error('❌ PDS repository service is not available for record update')
          throw xrpcError('ServiceUnavailable', 'PDS repository service is not available for record update')
        }

        // Parse URI to get rkey
        let rkey: string
        try {
          rkey = new URL(input.uri).pathname.split('/').pop()!
          if (!rkey) {
            throw new Error('Invalid URI format - no rkey found')
          }
        } catch (uriError: any) {
          console.error('❌ Failed to parse URI for update:', uriError.message)
          throw xrpcError('InvalidRequest', `Invalid URI format: ${uriError.message}`)
        }

        // Get service DID
        const serviceDid = (this.pds as any).ctx?.cfg?.service?.did || `did:web:${process.env.PDS_HOSTNAME}`
        console.log(`🔍 Updating record with service DID: ${serviceDid}, rkey: ${rkey}`)

        // Get existing record
        const existing = await repoService.getRecord({
          repo: serviceDid,
          collection: 'org.chaoticharmonylabs.orbit.record',
          rkey,
        })
        
        // Update record
        const record = {
          ...existing.value,
          ...input,
          uri: undefined, // Remove URI from record data
          updatedAt: new Date().toISOString(),
        }
        
        const cid = await this.createCID(record)
        
        // Update in PDS repository
        await repoService.putRecord({
          repo: serviceDid,
          collection: 'org.chaoticharmonylabs.orbit.record',
          rkey,
          record,
          swapCommit: false,
        })
        
        console.log(`✅ Successfully updated orbit in PDS: ${input.uri}`)
        
        return { 
          encoding: 'application/json', 
          body: { uri: input.uri, cid: cid.toString() } 
        }
      } catch (error: any) {
        console.error('❌ Failed to update orbit:', error)
        if (error.error) throw error // Already an XRPC error
        throw xrpcError('InternalServerError', `Failed to update orbit: ${error.message}`)
      }
    })
  }

  private async parseInput(ctx: any): Promise<any> {
    let input = ctx.input ?? ctx.body ?? ctx.req?.body

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

  // Fixed CID generation using proper multiformats
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
