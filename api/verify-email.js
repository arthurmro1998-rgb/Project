const { getPool, ensureSchema } = require("../lib/db");
const { hashToken } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: "Token is required." });
  }

  await ensureSchema();
  const db = getPool();
  const tokenHash = hashToken(token);

  const { rows } = await db.query(
    "SELECT user_id FROM email_verification_tokens WHERE token_hash = $1 AND expires_at > now()",
    [tokenHash]
  );
  const record = rows[0];
  if (!record) {
    return res.status(400).json({ error: "This verification link is invalid or has expired." });
  }

  await db.query("UPDATE users SET email_verified = TRUE WHERE id = $1", [record.user_id]);
  await db.query("DELETE FROM email_verification_tokens WHERE token_hash = $1", [tokenHash]);

  return res.status(200).json({ message: "Email verified." });
};
