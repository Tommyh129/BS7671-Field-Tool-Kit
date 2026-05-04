import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = admin.firestore();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

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

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        
        if (userId) {
          try {
            await db.collection("users").doc(userId).update({
              isPro: true,
              subscriptionId: session.subscription as string || null,
              updatedAt: new Date().toISOString()
            });
            console.log(`Successfully upgraded user ${userId} to Pro`);
          } catch (error) {
            console.error(`Error updating user ${userId}:`, error);
          }
        }
        break;
<<<<<<< HEAD
      case "customer.subscription.deleted":
        const subscription = event.data.object as Stripe.Subscription;
        // We need to find the user by subscriptionId
        try {
          const userSnapshot = await db.collection("users").where("subscriptionId", "==", subscription.id).limit(1).get();
          if (!userSnapshot.empty) {
            const userDoc = userSnapshot.docs[0];
            await userDoc.ref.update({
              isPro: false,
              subscriptionId: null,
              updatedAt: new Date().toISOString()
            });
            console.log(`Successfully revoked Pro for user ${userDoc.id} due to subscription deletion`);
          }
        } catch (error) {
          console.error(`Error revoking Pro for subscription ${subscription.id}:`, error);
        }
        break;
=======
>>>>>>> 34342a05d2be667a7f620817b3b9dade520aded3
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  });

  app.use(express.json());
  app.use(cors());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/create-checkout-session", async (req, res) => {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    try {
      const { userId, email } = req.body;
      const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || "http://localhost:3000";

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "gbp",
              product_data: {
                name: "BS7671 Field Toolkit Pro Subscription",
<<<<<<< HEAD
                description: "Unlock all advanced electrical design tools (1 Month Free Trial)",
              },
              unit_amount: 599, // £5.99
              recurring: {
                interval: "month",
              },
=======
                description: "Unlock all advanced electrical design tools",
              },
              unit_amount: 599, // £5.99
>>>>>>> 34342a05d2be667a7f620817b3b9dade520aded3
            },
            quantity: 1,
          },
        ],
<<<<<<< HEAD
        mode: "subscription",
        subscription_data: {
          trial_period_days: 30,
        },
=======
        mode: "payment",
>>>>>>> 34342a05d2be667a7f620817b3b9dade520aded3
        success_url: `${appUrl}?success=true`,
        cancel_url: `${appUrl}?canceled=true`,
        customer_email: email,
        client_reference_id: userId,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Account Deletion
  app.post("/api/delete-account", async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: "Missing ID token" });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      console.log(`Deleting account for user: ${uid}`);

      // 1. Delete History Subcollection
      const historyRef = db.collection("users").doc(uid).collection("history");
      const historySnapshot = await historyRef.get();
      const batch = db.batch();
      historySnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      // 2. Delete User Profile
      await db.collection("users").doc(uid).delete();

      // 3. Delete from Auth
      await admin.auth().deleteUser(uid);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting account:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
