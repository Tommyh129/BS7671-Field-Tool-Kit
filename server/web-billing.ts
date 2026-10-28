import type { Express } from 'express';
import type Stripe from 'stripe';
import { STORE_ONLY_PURCHASE_MESSAGE } from '../src/subscriptions';
import { stripeSubscriptions } from './stripe-plans';

export function installWebBillingRoutes(app: Express, services: {
  stripe: Stripe | null;
  verify: (token: string) => Promise<{uid: string}>;
  profile: (uid: string) => Promise<Record<string, any>>;
  returnUrl: string;
}) {
  app.post('/api/create-checkout-session', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(410).json({error: STORE_ONLY_PURCHASE_MESSAGE});
  });
  app.post('/api/subscriptions/manage-web', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return res.status(401).json({error:'Sign in to manage your existing web subscription.'});
    let uid: string;
    try { uid = (await services.verify(token)).uid; }
    catch { return res.status(401).json({error:'Sign in again to manage your subscription.'}); }
    if (!services.stripe) return res.status(503).json({error:'Web subscription management is unavailable. Contact support; do not purchase a separate plan.'});
    try {
      const stripe = services.stripe;
      const profile = await services.profile(uid);
      if (profile.deletionPending) return res.status(403).json({error:'This account is being closed. Contact support for billing help.'});
      const subscriptions = await stripeSubscriptions(stripe, uid, profile, true);
      if (!subscriptions.length) return res.status(404).json({error:'No existing web subscription was found. New subscriptions are purchased through Apple or Google Play.'});
      const customers = [...new Set(subscriptions.map(s => typeof s.customer === 'string' ? s.customer : s.customer.id))];
      if (customers.length !== 1) throw Error('Billing accounts need support review.');
      const returnUrl = new URL(services.returnUrl);
      if (returnUrl.protocol !== 'https:' || returnUrl.username || returnUrl.password) throw Error('Invalid billing return URL.');
      const config = await stripe.billingPortal.configurations.create({
        features: {
          subscription_cancel:{enabled:true,mode:'at_period_end'},
          subscription_update:{enabled:false},
          payment_method_update:{enabled:true}, invoice_history:{enabled:true},
        },
      }, {idempotencyKey:'store-only-existing-customer-portal-v1'});
      const session = await stripe.billingPortal.sessions.create({customer:customers[0],configuration:config.id,return_url:returnUrl.href});
      return res.json({url:session.url});
    } catch {
      return res.status(503).json({error:'Existing web billing could not be opened. Contact support; no new subscription has been started.'});
    }
  });
}
