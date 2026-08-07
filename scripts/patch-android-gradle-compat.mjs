import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const candidateBuildFiles = [
  path.join(root, 'node_modules', '@capacitor-firebase', 'authentication', 'android', 'build.gradle'),
  path.join(root, 'node_modules', '@capacitor', 'filesystem', 'android', 'build.gradle'),
  path.join(root, 'node_modules', 'capacitor-plugin-purchase', 'android', 'build.gradle'),
];

function patchProguardDefault(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const current = fs.readFileSync(filePath, 'utf8');
  const next = current.replaceAll(
    "getDefaultProguardFile('proguard-android.txt')",
    "getDefaultProguardFile('proguard-android-optimize.txt')"
  );

  if (next !== current) {
    fs.writeFileSync(filePath, next);
    return true;
  }

  return false;
}

const patchedCount = candidateBuildFiles.filter(patchProguardDefault).length;
console.log(`Patched Android Gradle compatibility for ${patchedCount} plugin file(s).`);
