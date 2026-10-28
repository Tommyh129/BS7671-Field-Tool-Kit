import type { Express } from 'express';
import { createHash, sign } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleAuth } from 'google-auth-library';
import { appleBusinessEntitlement, playBusinessEntitlement } from './store-entitlements';
import type { SubscriptionTier } from '../src/subscriptions';

const businessId = (platform: string) => process.env[platform === 'ios' ? 'IOS_BUSINESS_PRODUCT_ID' : 'ANDROID_BUSINESS_PRODUCT_ID'] || 'business_subscription';
const proIds = (platform:string) => [process.env[platform==='ios'?'IOS_PRO_PRODUCT_ID':'ANDROID_PRO_PRODUCT_ID']||process.env.PRO_PRODUCT_ID||'pro_subscription',...(process.env.PRO_PRODUCT_ID_ALIASES||'').split(',')].map(id=>id.trim()).filter(Boolean);
const bundleId = () => process.env.IOS_BUNDLE_ID || 'com.bs7671.fieldtoolkit';
const packageName = () => process.env.ANDROID_PACKAGE_NAME || 'com.bs7671.fieldtoolkit';
const appleReady = () => Boolean(process.env.APPLE_IAP_KEY_ID && process.env.APPLE_IAP_ISSUER_ID && process.env.APPLE_IAP_PRIVATE_KEY);
const playReady = () => process.env.PLAY_BILLING_VERIFICATION_ENABLED === 'true';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

async function appleTransaction(transactionId: string, appAccountToken: unknown, productId:string) {
  if (!appleReady()) throw Error('Business purchase verification is not configured for Apple. Contact support; do not purchase again.');
  if (!/^\d{1,30}$/.test(transactionId)) throw Error('Invalid Apple transaction.');
  if (typeof appAccountToken !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(appAccountToken)) throw Error('Apple purchase proof is missing. Restore Purchases from the original store account.');
  const now = Math.floor(Date.now() / 1000);
  const data = `${encode({alg:'ES256',kid:process.env.APPLE_IAP_KEY_ID,typ:'JWT'})}.${encode({iss:process.env.APPLE_IAP_ISSUER_ID,iat:now,exp:now+300,aud:'appstoreconnect-v1',bid:bundleId()})}`;
  const signature = sign('sha256', Buffer.from(data), {key:process.env.APPLE_IAP_PRIVATE_KEY!.replace(/\\n/g,'\n'), dsaEncoding:'ieee-p1363'}).toString('base64url');
  // Only decode JWS obtained directly from Apple's authenticated HTTPS API,
  // never accept a client-supplied decoded transaction or expiry.
  let response = await fetch(`https://api.storekit.apple.com/inApps/v1/transactions/${transactionId}`, {headers:{Authorization:`Bearer ${data}.${signature}`},signal:AbortSignal.timeout(15000)});
  if (response.status === 404 && process.env.APPLE_IAP_ALLOW_SANDBOX === 'true') {
    response = await fetch(`https://api.storekit-sandbox.apple.com/inApps/v1/transactions/${transactionId}`, {headers:{Authorization:`Bearer ${data}.${signature}`},signal:AbortSignal.timeout(15000)});
  }
  if (!response.ok) throw Error('Apple could not verify this subscription. Use Restore Purchases when connected.');
  const result = await response.json() as {signedTransactionInfo?:string};
  const transaction = JSON.parse(Buffer.from(result.signedTransactionInfo?.split('.')[1] || '', 'base64url').toString());
  // The native Business purchase sets a random UUID appAccountToken. Restores
  // return it from StoreKit. Knowing only a transaction ID is not purchase proof.
  if (transaction.appAccountToken?.toLowerCase() !== appAccountToken.toLowerCase()) throw Error('Apple purchase proof is missing. Restore Purchases from the original store account.');
  return {...appleBusinessEntitlement(transaction,productId,bundleId(),transactionId),linkedKey:undefined as string|undefined};
}

async function playSubscription(receipt: string, productId:string) {
  if (!playReady()) throw Error('Business purchase verification is not configured for Google Play. Contact support; do not purchase again.');
  let token: string;
  try {const data=JSON.parse(receipt);token=data.purchaseToken || data.token;} catch {throw Error('Invalid Google Play receipt.');}
  if (typeof token !== 'string' || !token || token.length > 10000) throw Error('Invalid Google Play receipt.');
  const client = await new GoogleAuth({scopes:['https://www.googleapis.com/auth/androidpublisher']}).getClient();
  const {data} = await client.request<{subscriptionState:string;linkedPurchaseToken?:string;lineItems?:{productId:string;expiryTime:string}[]}>({url:`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName())}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,timeout:15000});
  return {...playBusinessEntitlement(data,productId,token),linkedKey:data.linkedPurchaseToken?`android:${data.linkedPurchaseToken}`:undefined};
}

export function installSubscriptionRoutes(app: Express) {
  app.get('/api/subscriptions/business/ready', (_req,res) => res.json({ios:appleReady(),android:playReady()}));
  app.post(['/api/subscriptions/business/verify','/api/subscriptions/verify'], async(req,res) => {
    res.setHeader('Cache-Control','no-store');
    try {
      const platform = req.body.platform;
      const productId=req.body.productId;
      const tier:SubscriptionTier|null=productId===businessId(platform)?'business':proIds(platform).includes(productId)?'pro':null;
      if (!['ios','android'].includes(platform) || !tier) {res.status(400).json({error:'Invalid subscription product.'});return;}
      const bearer = req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
      const uid = bearer ? (await getAuth().verifyIdToken(bearer,true)).uid : undefined;
      const verified = platform === 'ios' ? await appleTransaction(String(req.body.transactionId || ''),req.body.appAccountToken,productId) : await playSubscription(String(req.body.receipt || ''),productId);
      if (!Number.isFinite(verified.expiresAt)) throw Error('Invalid subscription expiry returned by the store.');
      const active=verified.expiresAt>Date.now();
      const db=getFirestore(),claimId=createHash('sha256').update(verified.key).digest('hex'),claim=db.doc(`subscriptionClaims/${claimId}`);
      const linkedId=verified.linkedKey?createHash('sha256').update(verified.linkedKey).digest('hex'):null;
      // A signed-out store owner can change a plan. Refresh the account already
      // bound to that proven purchase, never leave its old Business grant alive.
      const bound=(await claim.get()).data();
      const linkedOwner=linkedId?(await db.doc(`subscriptionClaims/${linkedId}`).get()).data()?.uid:undefined;
      const ownerUid=uid||bound?.uid||linkedOwner;
      if (ownerUid) {
        const profile=db.doc(`users/${ownerUid}`);
        await db.runTransaction(async tx=>{
          const previous=(await tx.get(claim)).data(),owner=previous?.uid;
          const current=(await tx.get(profile)).data();
          const linked=linkedId?(await tx.get(db.doc(`subscriptionClaims/${linkedId}`))).data():undefined;
          if(previous?.replacedBy)throw Error('This subscription has already been replaced. Restore the current plan instead.');
          if (owner && owner !== ownerUid) throw Error('This subscription is already linked to a different app account. Sign in to that account or contact support.');
          if (linked?.uid && linked.uid!==ownerUid) throw Error('This subscription replaces a purchase linked to a different app account. Contact support.');
          if (active) {
            const old=current?.nativeSubscription;
            if(old?.expiresAt>Date.now()&&old.claimId!==claimId&&old.claimId!==linkedId)throw Error('This subscription does not replace the currently linked plan. Restore the original subscription or contact support.');
            tx.set(claim,{uid:ownerUid,platform,tier,expiresAt:verified.expiresAt});
            if(linkedId)tx.set(db.doc(`subscriptionClaims/${linkedId}`),{replacedBy:claimId,expiresAt:0},{merge:true});
            tx.set(profile,{isPro:tier==='pro'||(current?.stripeTier==='pro'&&current.stripeUntil>Date.now()),businessUntil:tier==='business'?verified.expiresAt:0,nativeSubscription:{provider:platform,tier,expiresAt:verified.expiresAt,claimId}},{merge:true});
          } else if (owner===ownerUid && current?.nativeSubscription?.claimId===claimId && current.nativeSubscription.tier===tier) tx.set(profile,{businessUntil:0,nativeSubscription:{provider:platform,tier,expiresAt:0,claimId}},{merge:true});
        });
      }
      if (!active) {res.status(409).json({error:'This subscription is expired or revoked. No payment has been started.'});return;}
      res.json({tier,expiresAt:verified.expiresAt});
    } catch(error) {
      // Never log receipts, purchase tokens, private keys or store response bodies.
      const message=error instanceof Error?error.message:'';
      res.status(503).json({error:/^(Business purchase|Invalid |Apple |Google Play did|This subscription)/.test(message)?message:'Business subscription verification is unavailable. Restore Purchases when connected; do not purchase again.'});
    }
  });
}
