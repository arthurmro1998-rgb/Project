const { getPool, ensureSchema } = require("../lib/db");
const { generateToken, hashToken, RESET_TTL_MS } = require("../lib/auth");
const { sendEmail } = require("../lib/email");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  await ensureSchema();
  const db = getPool();
  const normalizedEmail = email.toLowerCase();

  const { rows } = await db.query("SELECT id, email FROM users WHERE email = $1", [normalizedEmail]);
  const user = rows[0];

  if (user) {
    const resetToken = generateToken();
    await db.query(
      "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [hashToken(resetToken), user.id, new Date(Date.now() + RESET_TTL_MS)]
    );

    const appUrl = process.env.APP_URL || "";
    await sendEmail({
      to: user.email,
      subject: "Reset your password",
      html: `<p>Reset your password (this link expires in 1 hour):</p>
             <p><a href="${appUrl}/reset-password?token=${resetToken}">Reset password</a></p>`,
    });
  }

  // Always the same response, whether or not the email matched an account —
  // otherwise this endpoint could be used to check who has an account.
  return res.status(200).json({
    message: "If an account exists for that email, a reset link has been sent.",
  });
};
