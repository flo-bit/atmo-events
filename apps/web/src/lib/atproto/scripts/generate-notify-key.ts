import { P256PrivateKeyExportable } from '@atcute/crypto';

// Generates the P-256 signing key used for atmo.pub notifications. The private
// multikey is the server secret (ATMO_NOTIFY_PRIVATE_KEY); the public key is
// derived from it automatically when serving /.well-known/did.json.

const keypair = await P256PrivateKeyExportable.createKeypair();
const privateMultikey = await keypair.exportPrivateKey('multikey');
const publicMultikey = await keypair.exportPublicKey('multikey');
const didKey = await keypair.exportPublicKey('did');

console.log('\natmo.pub notification signing key (P-256)\n');
console.log('Private key — set as a secret, keep it server-side only:');
console.log(`  ATMO_NOTIFY_PRIVATE_KEY=${privateMultikey}\n`);
console.log('Public key multibase (reference — the DID doc derives this automatically):');
console.log(`  ${publicMultikey}`);
console.log(`did:key (reference): ${didKey}\n`);
console.log('Next steps:');
console.log('  • prod:  wrangler secret put ATMO_NOTIFY_PRIVATE_KEY');
console.log('  • dev:   add ATMO_NOTIFY_PRIVATE_KEY=… to apps/web/.env');
console.log('  • verify https://<your-domain>/.well-known/did.json resolves with your key\n');
