const Stripe = require("stripe");
const { getPool, ensureSchema } = require("../lib/db");
const { getSessionUser } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  await ensureSchema();
  const db = getPool();

  const user = await getSessionUser(db, req);
  if (!user) {
    return res.status(401).json({ error: "Please log in before placing an order." });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!stripeSecretKey || !priceId) {
    return res.status(500).json({
      error: "Missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID environment variables.",
    });
  }

  const stripe = new Stripe(stripeSecretKey);
  const origin =
    req.headers.origin ||
    (req.headers.host ? `https://${req.headers.host}` : undefined);

  if (!origin) {
    return res.status(500).json({ error: "Could not determine site URL." });
  }

  try {
    // The order is created before Stripe is even called — its status only
    // moves to 'paid' once the webhook confirms payment (PAY-03). The
    // redirect below is UX only, never treated as proof of payment.
    const { rows } = await db.query(
      "INSERT INTO orders (customer_id) VALUES ($1) RETURNING id",
      [user.id]
    );
    const orderId = rows[0].id;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/?canceled=true`,
      client_reference_id: String(orderId),
      metadata: { orderId: String(orderId) },
    });

    await db.query(
      "INSERT INTO payments (order_id, stripe_checkout_session_id) VALUES ($1, $2)",
      [orderId, session.id]
    );

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
