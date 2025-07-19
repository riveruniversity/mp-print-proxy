import https from 'https';
import fs from 'fs';
import path from 'path';

import { config } from '.';


// Try to load SSL certificates - with PFX support
export let sslOptions: https.ServerOptions | null = null;

// Define possible certificate locations with proper typing
interface PfxLocation {
  type: 'PFX';
  pfx: string;
  passphrase: string;
}

interface PemLocation {
  type: 'PEM';
  cert: string;
  key: string;
}

type CertLocation = PfxLocation | PemLocation;

const certLocations: CertLocation[] = [
  {
    type: 'PFX',
    pfx: path.join(process.cwd(), 'certs', 'server.pfx'),
    passphrase: config.security.certPass || 'printserver'
  },
  {
    type: 'PEM',
    cert: path.join(process.cwd(), 'certs', 'server.crt'),
    key: path.join(process.cwd(), 'certs', 'server.key')
  },
  {
    type: 'PEM',
    cert: path.join(process.cwd(), 'server.crt'),
    key: path.join(process.cwd(), 'server.key')
  },
  {
    type: 'PEM',
    cert: path.join(__dirname, '..', 'certs', 'server.crt'),
    key: path.join(__dirname, '..', 'certs', 'server.key')
  }
];

for (const location of certLocations) {
  try {
    if (location.type === 'PFX') {
      // Try PFX file first (preferred method)
      if (fs.existsSync(location.pfx)) {
        const pfxData = fs.readFileSync(location.pfx);
        sslOptions = {
          pfx: pfxData,
          passphrase: location.passphrase
        };
        console.log(`🔒 SSL certificate loaded from PFX: ${location.pfx}`);
        break;
      }
    } else if (location.type === 'PEM') {
      // Try PEM files as fallback
      if (fs.existsSync(location.cert) && fs.existsSync(location.key)) {
        // Validate that the key file actually contains a private key
        const keyContent = fs.readFileSync(location.key, 'utf8');
        if (keyContent.includes('-----BEGIN PRIVATE KEY-----') || 
            keyContent.includes('-----BEGIN RSA PRIVATE KEY-----')) {
          sslOptions = {
            cert: fs.readFileSync(location.cert),
            key: fs.readFileSync(location.key)
          };
          console.log(`🔒 SSL certificates loaded from PEM: ${path.dirname(location.cert)}`);
          break;
        } else {
          console.log(`⚠️  Invalid private key format in: ${location.key}`);
        }
      }
    }
  } catch (error) {
    console.log(`⚠️  Failed to load certificates from ${location.type}: ${error}`);
  }
}

if (!sslOptions) {
  console.log('⚠️  SSL certificates not found or invalid. HTTPS server will not start.');
  console.log('   Checked locations:');
  certLocations.forEach(loc => {
    if (loc.type === 'PFX' && 'pfx' in loc) {
      console.log(`   - PFX: ${loc.pfx}`);
    } else if (loc.type === 'PEM' && 'cert' in loc && 'key' in loc) {
      console.log(`   - PEM: ${loc.cert} + ${loc.key}`);
    }
  });
  console.log('   Solutions:');
  console.log('   1. Run: .\\minimal-cert.ps1 (creates PFX file)');
  console.log('   2. Or run: .\\generate-cert-fixed.ps1 (creates PEM files)');
}