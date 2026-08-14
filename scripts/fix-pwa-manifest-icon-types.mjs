import fs from 'node:fs';
import path from 'node:path';

const manifestPaths = [
  path.join(process.cwd(), 'public', 'manifest.json'),
  path.join(process.cwd(), 'dist', 'manifest.json'),
];

let fixedCount = 0;

for (const manifestPath of manifestPaths) {
  if (!fs.existsSync(manifestPath)) continue;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (Array.isArray(manifest.icons)) {
    manifest.icons = manifest.icons.map(icon => {
      if (typeof icon?.src === 'string' && icon.src.toLowerCase().endsWith('.webp')) {
        return {...icon, type: 'image/webp'};
      }
      return icon;
    });
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fixedCount += 1;
}

if (fixedCount === 0) {
  throw new Error('No PWA manifest files found to verify.');
}

console.log(`Verified PWA manifest icon MIME types in ${fixedCount} file(s).`);
