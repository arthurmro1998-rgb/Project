const Stripe = require("stripe");
const { getPool, ensureSchema } = require("../../lib/db");
const { getSessionUser } = require("../../lib/auth");

// Refunds are admin-only, and always require a stated reason — the policy is
// "only when the service was not properly rendered," which we can't verify
// automatically, so we record the reason rather than enforce its content.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  await ensureSchema();
  const db = getPool();

  const requester = await getSessionUser(db, req);
  if (!requester || requester.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const { orderId, reason } = req.body || {};
  if (!orderId) {
    return res.status(400).json({ error: "orderId is required." });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({
      error: "A reason is required — refunds are only issued when the service was not properly rendered.",
    });
  }

  const { rows: orderRows } = await db.query("SELECT id, status FROM orders WHERE id = $1", [orderId]);
  const order = orderRows[0];
  if (!order) {
    return res.status(404).json({ error: "Order not found." });
  }
  if (order.status !== "paid") {
    return res.status(400).json({ error: `Cannot refund an order with status "${order.status}".` });
  }

  const { rows: paymentRows } = await db.query(
    "SELECT stripe_payment_intent_id FROM payments WHERE order_id = $1 AND status = 'paid'",
    [orderId]
  );
  const payment = paymentRows[0];
  if (!payment || !payment.stripe_payment_intent_id) {
    return res.status(400).json({ error: "No paid payment found for this order." });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY environment variable." });
  }
  const stripe = new Stripe(stripeSecretKey);

  await stripe.refunds.create({ payment_intent: payment.stripe_payment_intent_id });

  await db.query("UPDATE payments SET status = 'refunded' WHERE order_id = $1", [orderId]);
  await db.query("UPDATE orders SET status = 'refunded' WHERE id = $1", [orderId]);

  return res.status(200).json({ message: "Order refunded." });
};
