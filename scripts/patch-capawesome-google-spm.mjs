import fs from 'node:fs';
import path from 'node:path';

const packagePath = path.join(
  process.cwd(),
  'node_modules',
  '@capacitor-firebase',
  'authentication',
  'Package.swift'
);

if (!fs.existsSync(packagePath)) {
  throw new Error(`Package.swift not found: ${packagePath}`);
}

let content = fs.readFileSync(packagePath, 'utf8');

if (!content.includes('GoogleSignIn-iOS')) {
  content = content.replace(
    '.package(url: "https://github.com/firebase/firebase-ios-sdk.git", .upToNextMajor(from: "11.7.0"))',
    '.package(url: "https://github.com/firebase/firebase-ios-sdk.git", .upToNextMajor(from: "11.7.0")),\n        .package(url: "https://github.com/google/GoogleSignIn-iOS.git", exact: "7.1.0")'
  );
}

if (!content.includes('.product(name: "GoogleSignIn", package: "GoogleSignIn-iOS")')) {
  content = content.replace(
    '.product(name: "FirebaseCore", package: "firebase-ios-sdk")',
    '.product(name: "FirebaseCore", package: "firebase-ios-sdk"),\n                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS")'
  );
}

if (!content.includes('RGCFA_INCLUDE_GOOGLE')) {
  content = content.replace(
    'path: "ios/Plugin"),',
    'path: "ios/Plugin",\n            swiftSettings: [.define("RGCFA_INCLUDE_GOOGLE")]),'
  );
}

fs.writeFileSync(packagePath, content);
console.log('Patched @capacitor-firebase/authentication SPM package for Google Sign-In.');
