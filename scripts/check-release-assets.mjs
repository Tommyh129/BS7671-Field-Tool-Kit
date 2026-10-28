import {readFile, readdir, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=file=>readFile(path.join(root,file));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function files(directory, prefix='') {
  const result=[];
  for (const entry of await readdir(path.join(root,directory,prefix),{withFileTypes:true})) {
    const relative=path.join(prefix,entry.name);
    if (entry.isDirectory()) result.push(...await files(directory,relative));
    else if(entry.isFile()) result.push(relative);
  }
  return result.sort();
}
const version=JSON.parse(await read('package.json')).version;
const gradle=(await read('android/app/build.gradle')).toString();
const pbx=(await read('ios/App/App.xcodeproj/project.pbxproj')).toString();
const androidCode=Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
assert.equal(gradle.match(/versionName\s+"([^"]+)"/)?.[1],version,'Android version must match package.json');
for (const match of pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)) assert.equal(match[1],version,'iOS marketing versions must match');
for (const match of pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)) assert.equal(Number(match[1]),androidCode,'Local native build numbers must match');
const entries=await files('dist');
assert.ok(entries.includes('index.html') && entries.length>1,'Build web assets first.');
const copies=['android/app/src/main/assets/public','ios/App/App/public'];
const manifest=[];
for (const relative of entries) {
  const bytes=await read(path.join('dist',relative));
  const digest=hash(bytes);
  if(relative.endsWith('.js')) {
    const text=bytes.toString();
    for(const forbidden of ['Diagnostic Build Only','QA sample customer','ais-pre-cudgj6lkyex64hxupsknop']) assert.ok(!text.includes(forbidden),`Unexpected release content: ${forbidden}`);
  }
  for(const copy of copies) assert.equal(hash(await read(path.join(copy,relative))),digest,`Stale native web asset: ${copy}/${relative}`);
  manifest.push({path:relative.replaceAll('\\','/'),sha256:digest});
}
for (const file of ['android/app/src/main/assets/capacitor.config.json','ios/App/App/capacitor.config.json']) {
  const config=JSON.parse(await read(file));
  assert.equal(config.appId,'com.bs7671.fieldtoolkit');
  assert.ok(!config.server?.url,'Native release must bundle its assets, not point at a preview server.');
}
const plugins=JSON.parse(await read('android/app/src/main/assets/capacitor.plugins.json'));
assert.ok(plugins.some(plugin=>plugin.classpath==='com.scgscorp.capacitorpluginpurchase.InAppPurchasePlugin'),'Android billing plugin missing');
const iosPackage=(await read('ios/App/CapApp-SPM/Package.swift')).toString();
assert.ok(iosPackage.includes('CapacitorPluginPurchase'),'iOS billing package missing');
assert.ok(!/path:\s*"[^"\n]*\\/.test(iosPackage),'iOS Swift package paths must use forward slashes');
await mkdir(path.join(root,'build'),{recursive:true});
await writeFile(path.join(root,'build/release-verification.json'),JSON.stringify({version,androidCode,iosLocalBuild:androidCode,verifiedAt:new Date().toISOString(),copies,files:manifest},null,2));
console.log(`Release ${version} (${androidCode}): ${entries.length} web files match Android and iOS byte-for-byte; no preview server, billing panel or QA customer is bundled. Native billing registration found. Store signing/device tests are still required.`);
