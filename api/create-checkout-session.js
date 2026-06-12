const Stripe = require("stripe");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
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
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/?canceled=true`,
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
