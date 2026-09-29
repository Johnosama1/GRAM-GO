const { execSync } = require('child_process');

try {
  execSync('pnpm --filter @workspace/db exec tsx ../../scripts/clear_false_bans.ts', { stdio: 'inherit' });
} catch (e) {
  console.error("Failed to run script");
}
