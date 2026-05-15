import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageRoot = path.join(root, 'node_modules', 'capacitor-plugin-purchase');
const packagePath = path.join(packageRoot, 'Package.swift');
const pluginPath = path.join(packageRoot, 'ios', 'Sources', 'PurchasePlugin', 'InAppPurchasePlugin.swift');

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${path.relative(root, filePath)}`);
  }
}

function writeIfChanged(filePath, content) {
  const current = fs.readFileSync(filePath, 'utf8');
  if (current !== content) {
    fs.writeFileSync(filePath, content);
  }
}

requireFile(packagePath);
requireFile(pluginPath);

let packageSwift = fs.readFileSync(packagePath, 'utf8');
packageSwift = packageSwift.replace(
  'path: "ios/Sources/PurchasePlugin"),',
  'path: "ios/Sources/PurchasePlugin",\n            sources: ["InAppPurchase.swift", "InAppPurchasePlugin.swift"]),'
);
writeIfChanged(packagePath, packageSwift);

let pluginSwift = fs.readFileSync(pluginPath, 'utf8');
if (!pluginSwift.includes('CAPBridgedPlugin')) {
  pluginSwift = pluginSwift.replace(
    'public class InAppPurchasePlugin: CAPPlugin {',
    `public class InAppPurchasePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InAppPurchasePlugin"
    public let jsName = "InAppPurchase"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "canMakePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchaseProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActivePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cleanup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise)
    ]
`
  );
  writeIfChanged(pluginPath, pluginSwift);
}

console.log('Patched capacitor-plugin-purchase for Swift Package Manager.');
