const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PAYPAL_BASE = process.env.PAYPAL_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getAccessToken() {
  const client = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!client || !secret) throw new Error('Missing PayPal credentials in env');

  const resp = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(client + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  return resp.json();
}

// Create order (server-side) - accepts amount, currency, description, optional userId and planId
router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'KES', description = 'LoveLink purchase', userId, planId } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount required' });

    const tokenData = await getAccessToken();
    const accessToken = tokenData.access_token;

    // include small metadata in custom_id (ensure short)
    const customId = JSON.stringify({ userId, planId });

    const orderResp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amount.toString()
            },
            description,
            custom_id: customId
          }
        ],
        application_context: {
          brand_name: 'LoveLink',
          user_action: 'PAY_NOW'
        }
      })
    });

    const order = await orderResp.json();
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Capture order (server-side fallback)
router.post('/capture-order', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    const tokenData = await getAccessToken();
    const accessToken = tokenData.access_token;

    const captureResp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const capture = await captureResp.json();
    res.json(capture);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Webhook handler
router.post('/webhook', async (req, res) => {
  try {
    // PayPal sends several headers required for verification
    const transmissionId = req.header('paypal-transmission-id');
    const transmissionTime = req.header('paypal-transmission-time');
    const certUrl = req.header('paypal-cert-url');
    const authAlgo = req.header('paypal-auth-algo');
    const transmissionSig = req.header('paypal-transmission-sig');
    const webhookId = process.env.PAYPAL_WEBHOOK_ID; // set this in env after creating webhook in PayPal

    if (!webhookId) {
      console.warn('No PAYPAL_WEBHOOK_ID set - cannot verify webhook');
      return res.status(400).send('PAYPAL_WEBHOOK_ID not configured');
    }

    const tokenData = await getAccessToken();
    const accessToken = tokenData.access_token;

    // Verify signature
    const verifyResp = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: req.body
      })
    });

    const verifyJson = await verifyResp.json();
    if (verifyJson.verification_status !== 'SUCCESS') {
      console.warn('Webhook verification failed', verifyJson);
      return res.status(400).send('Invalid webhook signature');
    }

    const event = req.body;
    console.log('Webhook event verified:', event.event_type);

    // Handle relevant events
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' || event.event_type === 'CHECKOUT.ORDER.APPROVED' || event.event_type === 'PAYMENT.CAPTURE.DENIED') {
      // Extract capture info and custom_id (metadata) if present
      const resource = event.resource;
      let customId = null;
      if (resource && resource.supplementary_data && resource.supplementary_data.related_ids && resource.supplementary_data.related_ids.order_id) {
        // fallback
      }

      // Many events include order or purchase_unit info with custom_id under purchase_units
      try {
        const pu = resource.purchase_units || (resource.purchase_units && resource.purchase_units[0]) || null;
        // For capture events, parent order may be in resource.supplementary_data
      } catch (e) {
        // ignore
      }

      // For simplicity, record a generic Purchase entry when capture completed
      if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const captureId = resource && resource.id;
        const amountObj = resource && resource.amount ? resource.amount : (resource && resource.purchase_units && resource.purchase_units[0] && resource.purchase_units[0].amount);
        const value = amountObj ? parseFloat(amountObj.value || amountObj.amount || 0) : 0;
        const currency = amountObj ? (amountObj.currency_code || amountObj.currency) : 'KES';

        // Attempt to read custom_id from the order (if sent in custom_id on purchase_unit)
        let metadata = null;
        try {
          if (resource && resource.custom_id) {
            metadata = JSON.parse(resource.custom_id);
          }
        } catch (e) {
          // ignore
        }

        await prisma.purchase.create({
          data: {
            userId: metadata && metadata.userId ? Number(metadata.userId) : null,
            planId: metadata && metadata.planId ? Number(metadata.planId) : null,
            amount: value,
            currency,
            provider: 'paypal',
            providerId: captureId || (resource && resource.parent_payment) || 'unknown',
            status: 'completed'
          }
        });
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
