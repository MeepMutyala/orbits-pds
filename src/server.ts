import { PDS, envToCfg, envToSecrets, readEnv } from '@atproto/pds'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  const env = readEnv()
  
  // Force port to be 3100 or use environment variable
  const port = process.env.PORT || '3100'
  env.port = parseInt(port, 10)
  
  console.log(`⚙️ Starting PDS with configuration:`)
  console.log(`  - Port: ${port}`)
  console.log(`  - Hostname: ${process.env.PDS_HOSTNAME || 'localhost'}`)
  console.log(`  - Environment: ${process.env.NODE_ENV || 'development'}`)
  
  const config = envToCfg(env)
  const secrets = envToSecrets(env)
  
  const pds = await PDS.create(config, secrets)
  await pds.start()
  
  console.log(`🚀 PDS running on port ${port}`)
  console.log(`🌐 Service DID: ${config.service?.did || 'auto-generated'}`)
  console.log(`📋 Lexicons: Custom orbit schemas available`)
  console.log(`🔗 Standard AT Protocol endpoints at /xrpc/`)
  
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down')
    await pds.destroy()
    process.exit(0)
  })
  
  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down') 
    await pds.destroy()
    process.exit(0)
  })
}

main().catch(err => {
  console.error('Failed to start PDS:', err)
  process.exit(1)
})
