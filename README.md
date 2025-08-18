# Orbits PDS - Custom AT Protocol Lexicon Server

A Personal Data Server (PDS) implementation for the Orbits webapp with custom AT Protocol lexicons for semantic feed organization.

## Features

- ✅ Custom AT Protocol lexicons for "Orbits" (semantic feed collections)
- ✅ Complete XRPC endpoint implementations
- ✅ Mock data handlers for testing
- ✅ Automated testing scripts
- ✅ Development environment ready

## Custom Lexicons

This PDS implements custom lexicons under the `org.chaoticharmonylabs.orbit` namespace:

- **create**: Create a new orbit
- **get**: Retrieve an orbit by URI  
- **list**: List all orbits for a user
- **update**: Update an existing orbit
- **defs**: Core orbit data definitions

### Orbit Schema

An orbit represents a semantic collection of feeds organized by content type:

```json
{
  "name": "Photography",
  "description": "Visual content and photography discussions",
  "feeds": {
    "photo": "at://did:web:example/app.bsky.feed.generator/photos",
    "video": "at://did:web:example/app.bsky.feed.generator/videos", 
    "text": "at://did:web:example/app.bsky.feed.generator/text"
  },
  "createdAt": "2025-01-17T...",
  "updatedAt": "2025-01-17T..."
}
```

## Quick Start

### 1. Setup Environment

```bash
# Copy environment template
cp .env.development .env

# Edit .env with your configuration
# The defaults should work for local development
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build Project

```bash
npm run build
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3100` with XRPC endpoints at `http://localhost:3100/xrpc`.

## Testing Your Custom Lexicons

### Automated Testing

Run the comprehensive test suite:

```bash
# Node.js test script
npm run test

# Or run directly
node test-lexicons.js
```

For PowerShell (Windows):
```powershell
.\test-lexicons.ps1
```

For Bash (Linux/Mac):
```bash
chmod +x test-lexicons.sh
./test-lexicons.sh
```

### Manual Testing with curl

#### 1. Create an Orbit
```bash
curl -X POST http://localhost:3100/xrpc/org.chaoticharmonylabs.orbit.create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Photography",
    "description": "Visual content and photos",
    "feeds": {
      "photo": "at://did:web:localhost/app.bsky.feed.generator/photos"
    }
  }'
```

#### 2. Get an Orbit
```bash
curl "http://localhost:3100/xrpc/org.chaoticharmonylabs.orbit.get?uri=at://did:web:localhost/org.chaoticharmonylabs.orbit.record/1"
```

#### 3. List Orbits
```bash
curl "http://localhost:3100/xrpc/org.chaoticharmonylabs.orbit.list?limit=10"
```

#### 4. Update an Orbit
```bash
curl -X POST http://localhost:3100/xrpc/org.chaoticharmonylabs.orbit.update \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "at://did:web:localhost/org.chaoticharmonylabs.orbit.record/1",
    "name": "Updated Photography",
    "description": "Updated description"
  }'
```

### Manual Testing with PowerShell

#### Create an Orbit
```powershell
Invoke-WebRequest -Uri "http://localhost:3100/xrpc/org.chaoticharmonylabs.orbit.create" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"name":"Photography","description":"Visual content and photos"}'
```

#### Get an Orbit
```powershell
Invoke-WebRequest -Uri "http://localhost:3100/xrpc/org.chaoticharmonylabs.orbit.get?uri=at://did:web:localhost/org.chaoticharmonylabs.orbit.record/1"
```

2. **Configure environment**:
Copy `.env.example` to `.env` and update:
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/orbits_pds
PDS_HOSTNAME=your-domain.com
JWT_SECRET=your-secure-jwt-secret
ADMIN_PASSWORD=your-admin-password
```

3. **Set up PostgreSQL database**:
```bash
createdb orbits_pds
```

4. **Start the server**:
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## What This Provides

- **Full AT Protocol PDS** - Complete Bluesky/AT Protocol functionality
- **User accounts** - Registration, authentication, profiles
- **Posts & interactions** - Standard social features
- **Custom lexicons** - Your orbit/feed schemas (in lexicons/ directory)

## Custom Lexicons

Your Orbits-specific schemas are defined in `lexicons/org/chaoticharmonylabs/`:
- **orbit/** - User-defined semantic orbits (feed collections)
- **feed/** - Content feed definitions  
- **user/** - User preferences and profile extensions
- **analytics/** - Usage analytics tracking

The PDS will automatically load and serve these lexicons.

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `PDS_HOSTNAME` - Your domain name  
- `JWT_SECRET` - Secret for JWT signing
- `ADMIN_PASSWORD` - Admin account password

Optional:
- `PORT` - Server port (default: 3100)
- `NODE_ENV` - Environment (development/production)
- `RECOVERY_KEY` - Recovery key for the service

## API Endpoints

Once running, your PDS will have:
- **Standard AT Protocol endpoints** at `/xrpc/*`
- **Your custom lexicons** automatically available
- **Health check** at root URL

## Deployment

### DigitalOcean

1. Create a droplet with Node.js and PostgreSQL
2. Clone this repo and install dependencies
3. Set up your environment variables
4. Run `./deploy.sh`

### Docker

```bash
docker-compose up -d
```

## Adding Custom Features

To extend the PDS with your custom logic:
1. Add lexicon files to define your schemas
2. Use the PDS's plugin/extension system
3. The PDS will automatically serve your custom methods

## License

MIT License