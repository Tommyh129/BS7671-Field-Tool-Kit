import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const iosAppDir = path.join(root, 'ios', 'App', 'App');
const googlePlistPath = path.join(iosAppDir, 'GoogleService-Info.plist');
const infoPlistPath = path.join(iosAppDir, 'Info.plist');
const entitlementsPath = path.join(iosAppDir, 'App.entitlements');
const pbxPath = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');

const GOOGLE_FILE_REF = 'F1A0B1C2D3E4F5060708090A';
const GOOGLE_BUILD_REF = 'F1A0B1C2D3E4F5060708090B';
const ENTITLEMENTS_FILE_REF = 'F1A0B1C2D3E4F5060708090C';

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${path.relative(root, filePath)}`);
  }
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeIfChanged(filePath, content) {
  const current = fs.existsSync(filePath) ? read(filePath) : null;
  if (current !== content) {
    fs.writeFileSync(filePath, content);
  }
}

function plistString(plist, key) {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
  return match?.[1];
}

function addGoogleUrlScheme(infoPlist, reversedClientId) {
  if (infoPlist.includes(reversedClientId)) return infoPlist;

  const urlType = [
    '\t\t<dict>',
    '\t\t\t<key>CFBundleURLSchemes</key>',
    '\t\t\t<array>',
    `\t\t\t\t<string>${reversedClientId}</string>`,
    '\t\t\t</array>',
    '\t\t</dict>'
  ].join('\n');

  if (infoPlist.includes('<key>CFBundleURLTypes</key>')) {
    return infoPlist.replace(
      /(<key>CFBundleURLTypes<\/key>\s*<array>\s*)/,
      `$1\n${urlType}\n`
    );
  }

  const block = [
    '\t<key>CFBundleURLTypes</key>',
    '\t<array>',
    urlType,
    '\t</array>'
  ].join('\n');

  return infoPlist.replace('</dict>', `${block}\n</dict>`);
}

function ensureEntitlements() {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>com.apple.developer.applesignin</key>
\t<array>
\t\t<string>Default</string>
\t</array>
</dict>
</plist>
`;
  writeIfChanged(entitlementsPath, content);
}

function addToAppGroup(pbx, line) {
  if (pbx.includes(line.trim())) return pbx;

  return pbx.replace(
    /(\/\* App \*\/ = \{\s+isa = PBXGroup;\s+children = \(\n)([\s\S]*?)(\n\s+\);\s+path = App;)/,
    (_match, start, children, end) => {
      const infoLine = /^(\s+)[A-Z0-9]+ \/\* Info\.plist \*\/,/m.exec(children);
      if (infoLine) {
        return `${start}${children.replace(infoLine[0], `${infoLine[1]}${line}\n${infoLine[0]}`)}${end}`;
      }
      return `${start}${children}\t\t\t\t${line}\n${end}`;
    }
  );
}

function ensureXcodeProject() {
  let pbx = read(pbxPath);

  if (!pbx.includes('GoogleService-Info.plist in Resources')) {
    pbx = pbx.replace(
      '/* End PBXBuildFile section */',
      `\t\t${GOOGLE_BUILD_REF} /* GoogleService-Info.plist in Resources */ = {isa = PBXBuildFile; fileRef = ${GOOGLE_FILE_REF} /* GoogleService-Info.plist */; };\n/* End PBXBuildFile section */`
    );
  }

  if (!new RegExp(`${GOOGLE_FILE_REF} /\\* GoogleService-Info\\.plist \\*/ = \\{isa = PBXFileReference;`).test(pbx)) {
    pbx = pbx.replace(
      '/* End PBXFileReference section */',
      `\t\t${GOOGLE_FILE_REF} /* GoogleService-Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = "GoogleService-Info.plist"; sourceTree = "<group>"; };\n/* End PBXFileReference section */`
    );
  }

  if (!pbx.includes(`${ENTITLEMENTS_FILE_REF} /* App.entitlements */`)) {
    pbx = pbx.replace(
      '/* End PBXFileReference section */',
      `\t\t${ENTITLEMENTS_FILE_REF} /* App.entitlements */ = {isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = App.entitlements; sourceTree = "<group>"; };\n/* End PBXFileReference section */`
    );
  }

  pbx = addToAppGroup(pbx, `${GOOGLE_FILE_REF} /* GoogleService-Info.plist */,`);
  pbx = addToAppGroup(pbx, `${ENTITLEMENTS_FILE_REF} /* App.entitlements */,`);

  if (!pbx.includes(`${GOOGLE_BUILD_REF} /* GoogleService-Info.plist in Resources */`)) {
    throw new Error('Failed to add GoogleService-Info.plist build reference.');
  }

  const resourcesBlock = pbx.match(/(\/\* Resources \*\/ = \{\s+isa = PBXResourcesBuildPhase;[\s\S]*?files = \(\n)([\s\S]*?)(\n\s+\);\s+runOnlyForDeploymentPostprocessing = 0;)/);
  if (!resourcesBlock) {
    throw new Error('Could not find Xcode Resources build phase.');
  }

  if (!resourcesBlock[2].includes(GOOGLE_BUILD_REF)) {
    pbx = pbx.replace(
      resourcesBlock[0],
      `${resourcesBlock[1]}${resourcesBlock[2].endsWith('\n') ? resourcesBlock[2] : `${resourcesBlock[2]}\n`}\t\t\t\t${GOOGLE_BUILD_REF} /* GoogleService-Info.plist in Resources */,\n${resourcesBlock[3]}`
    );
  }

  pbx = pbx.replace(
    /(CODE_SIGN_STYLE = (?:Automatic|Manual);\n)(?!\s+CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;)/g,
    '$1\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n'
  );

  writeIfChanged(pbxPath, pbx);
}

requireFile(googlePlistPath);
requireFile(infoPlistPath);
requireFile(pbxPath);

const googlePlist = read(googlePlistPath);
const reversedClientId = plistString(googlePlist, 'REVERSED_CLIENT_ID');
if (!reversedClientId) {
  throw new Error('REVERSED_CLIENT_ID not found in GoogleService-Info.plist.');
}

writeIfChanged(infoPlistPath, addGoogleUrlScheme(read(infoPlistPath), reversedClientId));
ensureEntitlements();
ensureXcodeProject();

console.log('Prepared iOS Firebase auth files, URL scheme, and Apple Sign-In entitlement.');
