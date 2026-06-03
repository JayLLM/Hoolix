const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJsonPath = path.join(root, 'package.json');
const versionTsPath = path.join(root, 'src', 'core', 'version.ts');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

if (!version || typeof version !== 'string') {
  throw new Error('package.json version must be a non-empty string');
}

const content = `// Single source of truth for version. Updated on release; baked into binaries at \`bun build --compile\`.
export const VERSION = ${JSON.stringify(version)};
`;

fs.writeFileSync(versionTsPath, content);
console.log(`Synced src/core/version.ts to ${version}`);
