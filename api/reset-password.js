const { getPool, ensureSchema } = require("../lib/db");
const { hashPassword, hashToken, destroyAllSessionsForUser } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: "Token and new password are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  await ensureSchema();
  const db = getPool();
  const tokenHash = hashToken(token);

  const { rows } = await db.query(
    "SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > now()",
    [tokenHash]
  );
  const record = rows[0];
  if (!record) {
    return res.status(400).json({ error: "This reset link is invalid or has expired." });
  }

  const passwordHash = await hashPassword(password);
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, record.user_id]);
  await db.query("DELETE FROM password_reset_tokens WHERE token_hash = $1", [tokenHash]);

  // A password change invalidates every existing session, including on other devices.
  await destroyAllSessionsForUser(db, record.user_id);

  return res.status(200).json({ message: "Password updated. Please log in again." });
};
