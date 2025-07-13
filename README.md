# Orbits PDS

A minimal AT Protocol Personal Data Server for the Orbits webapp by Chaotic Harmony Labs.

## Quick Start

1. **Install dependencies**:
```bash
npm install
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
- `PORT` - Server port (default: 3000)
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