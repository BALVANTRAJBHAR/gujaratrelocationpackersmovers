// Run with: node scripts/generate-vapid-keys.js
// Requires: npm install web-push
// Or use: npx web-push generate-vapid-keys

const { execSync } = require('child_process');
try {
  const result = execSync('npx web-push generate-vapid-keys --json', { encoding: 'utf8' });
  const keys = JSON.parse(result.trim());
  console.log('\n=== VAPID Keys Generated ===\n');
  console.log('VAPID_PUBLIC_KEY:', keys.publicKey);
  console.log('VAPID_PRIVATE_KEY:', keys.privateKey);
  console.log('\nSet these as Supabase Edge Function secrets for send-web-push and public-config.\n');
} catch {
  console.log('Installing web-push...');
  execSync('npm install --save-dev web-push', { stdio: 'inherit' });
  const result = execSync('npx web-push generate-vapid-keys --json', { encoding: 'utf8' });
  const keys = JSON.parse(result.trim());
  console.log('\n=== VAPID Keys Generated ===\n');
  console.log('VAPID_PUBLIC_KEY:', keys.publicKey);
  console.log('VAPID_PRIVATE_KEY:', keys.privateKey);
  console.log('\nSet these as Supabase Edge Function secrets.\n');
}
