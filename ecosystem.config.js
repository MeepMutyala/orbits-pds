require('dotenv').config();
module.exports = {
  apps: [{
    name: 'orbits-pds',
    script: './dist/server.js',
    cwd: '/opt/orbits-pds',
    env_file: '.env'
  }]
}
