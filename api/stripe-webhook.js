const Stripe = require("stripe");
const { getPool, ensureSchema } = require("../lib/db");
const { sendEmail } = require("../lib/email");

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Stripe signs the raw request body, so it can't go through Vercel's default
// JSON body parser — this must see the exact bytes Stripe sent.
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeSecretKey || !webhookSecret) {
    return res.status(500).json({
      error: "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET environment variables.",
    });
  }

  const stripe = new Stripe(stripeSecretKey);
  const signature = req.headers["stripe-signature"];
  const rawBody = await readRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${error.message}` });
  }

  await ensureSchema();
  const db = getPool();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.client_reference_id;

    if (orderId) {
      await db.query(
        `UPDATE payments SET status = 'paid', stripe_payment_intent_id = $1
         WHERE stripe_checkout_session_id = $2`,
        [session.payment_intent, session.id]
      );

      const { rows } = await db.query(
        `UPDATE orders SET status = 'paid', amount_cents = $1, currency = $2
         WHERE id = $3
         RETURNING id, customer_id`,
        [session.amount_total, session.currency, orderId]
      );
      const order = rows[0];

      if (order) {
        const { rows: userRows } = await db.query("SELECT email FROM users WHERE id = $1", [
          order.customer_id,
        ]);
        if (userRows[0]) {
          await sendEmail({
            to: userRows[0].email,
            subject: "Order confirmation",
            html: `<p>Thanks for your order! We've received your payment for order #${order.id}.</p>`,
          });
        }
      }
    }
  }

  return res.status(200).json({ received: true });
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
