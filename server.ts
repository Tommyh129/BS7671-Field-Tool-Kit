import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import path from "path";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { installPrivacyRoutes } from './server/privacy';
import { installRamsRoutes } from './server/rams';
import { installBusinessStorageRoutes } from './server/business-storage';
import { GoogleGenAI } from "@google/genai";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };
import { installInvoiceRoutes } from './server/invoices';
import { installSubscriptionRoutes } from './server/subscriptions';
import { hasInvoicedBusinessAccess } from './src/subscriptions';
import { stripeSubscriptions, syncStripeSubscription } from './server/stripe-plans';
import { installWebBillingRoutes } from './server/web-billing';

dotenv.config();

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = getFirestore();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

interface RegulatoryUpdate {
  version: string;
  amendment: string;
  date: string;
  summary: string;
  changes: string[];
}

const DEFAULT_REGULATORY_UPDATE: RegulatoryUpdate = {
  version: "BS 7671:2018+A4:2026",
  amendment: "Amendment 4:2026",
  date: "15 April 2026",
  summary:
    "IET and BSI published Amendment 4:2026 to BS 7671:2018 on 15 April 2026, introducing updates for stationary secondary batteries, medical locations, functional earthing, Power over Ethernet, and harmonised standards.",
  changes: [
    "New chapter for stationary secondary batteries and energy storage systems.",
    "Major revision of Section 710 Medical Locations.",
    "New requirements for functional earthing and functional equipotential bonding for ICT systems.",
    "New Section 716 requirements for Power over Ethernet installations.",
    "BS 7671:2018+A2:2022+A3:2024 enters a six-month transition period before withdrawal."
  ]
};

let regulatoryCache: { value: RegulatoryUpdate; expiresAt: number } | null = null;

function normalizeRegulatoryUpdate(data: Partial<RegulatoryUpdate>): RegulatoryUpdate {
  return {
    version: data.version || DEFAULT_REGULATORY_UPDATE.version,
    amendment: data.amendment || DEFAULT_REGULATORY_UPDATE.amendment,
    date: data.date || DEFAULT_REGULATORY_UPDATE.date,
    summary: data.summary || DEFAULT_REGULATORY_UPDATE.summary,
    changes: Array.isArray(data.changes) && data.changes.length > 0
      ? data.changes
      : DEFAULT_REGULATORY_UPDATE.changes
  };
}

async function fetchRegulatoryUpdate(): Promise<RegulatoryUpdate> {
  if (!geminiApiKey) {
    return DEFAULT_REGULATORY_UPDATE;
  }

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents:
      "Find the current/latest official BS 7671 Requirements for Electrical Installations edition and amendment from authoritative UK sources such as IET or BSI. Return only JSON with keys: version, amendment, date, summary, changes. Keep summary under 60 words and changes as an array of up to 5 concise strings.",
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
    },
  });

  const text = response.text || "{}";
  return normalizeRegulatoryUpdate(JSON.parse(text));
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Stripe Webhook (must be before express.json())
  app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !sig || !webhookSecret) {
      return res.status(400).send("Webhook Error: Stripe not configured");
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const object=event.data.object as unknown as {subscription?:string;id:string;client_reference_id?:string};
    if(['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)){
      const subscriptionId=event.type==='checkout.session.completed'?object.subscription:object.id;
      try{if(subscriptionId)await syncStripeSubscription(stripe,subscriptionId,object.client_reference_id);}
      catch{return res.status(503).send('Subscription update could not be saved. Retry webhook.');}
    }

    res.json({ received: true });
  });

  app.use(cors());
  installRamsRoutes(app, firebaseConfig.storageBucket, firebaseConfig.firestoreDatabaseId);
  app.use(express.json({ limit: '1mb' }));
  installPrivacyRoutes(app, firebaseConfig.firestoreDatabaseId, firebaseConfig.storageBucket);
  installBusinessStorageRoutes(app, firebaseConfig.storageBucket, firebaseConfig.firestoreDatabaseId);
  installInvoiceRoutes(app, firebaseConfig.storageBucket);
  installSubscriptionRoutes(app);

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get('/api/subscriptions/context',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const bearer=req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if(!bearer)return res.status(401).json({error:'Sign in to check your subscription.'});
    let uid:string;
    try{uid=(await getAuth().verifyIdToken(bearer,true)).uid;}catch{return res.status(401).json({error:'Sign in again to check your subscription.'});}
    try{
      const profile=(await db.doc(`users/${uid}`).get()).data()||{};
      if(!stripe&&(profile.stripeSubscriptionId||profile.subscriptionId||profile.businessStripeSubscriptionId))throw Error('The web billing provider is unavailable. Do not start a separate store subscription.');
      const web=stripe?(await stripeSubscriptions(stripe,uid,profile))[0]:null;
      // An old expiry alone does not prove that a native auto-renewal stopped.
      // Keep changes on the original store until that source is reconciled.
      const invoiced = profile.invoicedBusiness;
      res.json({webActive:Boolean(web),invoicedBusiness:hasInvoicedBusinessAccess(profile) || (invoiced?.revoked === false && invoiced.expiresAt > Date.now()),native:profile.nativeSubscription?{provider:profile.nativeSubscription.provider,tier:profile.nativeSubscription.tier}:null,unknownLegacyPro:(profile.isPro===true||profile.businessUntil>0)&&!web&&!profile.nativeSubscription&&!profile.isBusiness});
    }catch(error){res.status(409).json({error:error instanceof Error?error.message:'Subscription checks are unavailable. Restore before paying again.'});}
  });

  app.post('/api/subscriptions/restore',async(req,res)=>{
    const bearer=req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if(!bearer)return res.status(401).json({error:'Sign in to restore your web subscription.'});
    let uid:string;
    try{uid=(await getAuth().verifyIdToken(bearer,true)).uid;}catch{return res.status(401).json({error:'Sign in again to restore your subscription.'});}
    if(!stripe)return res.status(503).json({error:'Web billing is unavailable. No payment has been started.'});
    try{
      const profile=(await db.doc(`users/${uid}`).get()).data()||{};
      const active=await stripeSubscriptions(stripe,uid,profile);
      for(const id of new Set([profile.stripeSubscriptionId,profile.subscriptionId,profile.businessStripeSubscriptionId,...active.map(s=>s.id)].filter(Boolean)))await syncStripeSubscription(stripe,id);
      res.json({restored:active.length>0});
    }catch{return res.status(503).json({error:'The existing subscription could not be restored. Contact support; do not purchase another plan.'});}
  });

  app.get("/api/regulatory-updates", async (req, res) => {
    const now = Date.now();
    const forceRefresh = req.query.refresh === "true" || req.query.refresh === "1";

    if (forceRefresh) {
      res.setHeader("Cache-Control", "no-store");
    }

    if (!forceRefresh && regulatoryCache && regulatoryCache.expiresAt > now) {
      return res.json(regulatoryCache.value);
    }

    try {
      const value = await fetchRegulatoryUpdate();
      regulatoryCache = {
        value,
        expiresAt: now + 24 * 60 * 60 * 1000,
      };
      res.json(value);
    } catch (error: any) {
      console.error("Regulatory update lookup failed:", error);
      res.json(DEFAULT_REGULATORY_UPDATE);
    }
  });

  installWebBillingRoutes(app, {
    stripe,
    verify: token => getAuth().verifyIdToken(token, true),
    profile: async uid => (await db.doc(`users/${uid}`).get()).data() || {},
    returnUrl: process.env.APP_URL || process.env.VITE_APP_URL || 'https://the-sparkys-mate-29962838005.europe-west1.run.app',
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      configLoader: "runner",
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
