const { getPool, ensureSchema } = require("../lib/db");
const {
  hashPassword,
  generateToken,
  hashToken,
  createSession,
  setSessionCookie,
  SESSION_TTL_MS,
  VERIFY_TTL_MS,
} = require("../lib/auth");
const { sendEmail } = require("../lib/email");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { email, password, name } = req.body || {};

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "A valid email is required." });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  await ensureSchema();
  const db = getPool();
  const normalizedEmail = email.toLowerCase();

  const existing = await db.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  // Public signup always creates a customer account — contractor and admin
  // accounts are created only via the admin-only endpoint (ACC-06, ACC-07).
  const passwordHash = await hashPassword(password);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, 'customer')
     RETURNING id, email, name, role, email_verified`,
    [normalizedEmail, passwordHash, name || null]
  );
  const user = rows[0];

  const verifyToken = generateToken();
  await db.query(
    "INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashToken(verifyToken), user.id, new Date(Date.now() + VERIFY_TTL_MS)]
  );

  const appUrl = process.env.APP_URL || "";
  await sendEmail({
    to: user.email,
    subject: "Verify your email",
    html: `<p>Confirm your email to finish setting up your account:</p>
           <p><a href="${appUrl}/verify-email?token=${verifyToken}">Verify email</a></p>`,
  });

  const { token } = await createSession(db, user.id);
  setSessionCookie(res, token, SESSION_TTL_MS);

  return res.status(201).json({ user });
};
