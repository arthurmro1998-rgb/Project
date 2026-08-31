const { getPool, ensureSchema } = require("../lib/db");
const { verifyPassword, createSession, setSessionCookie, SESSION_TTL_MS } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  await ensureSchema();
  const db = getPool();
  const normalizedEmail = email.toLowerCase();

  const { rows } = await db.query(
    "SELECT id, email, first_name, last_name, role, email_verified, password_hash FROM users WHERE email = $1",
    [normalizedEmail]
  );
  const user = rows[0];

  // Same error for "no such user" and "wrong password" so login can't be used
  // to enumerate which emails have accounts.
  const genericError = { error: "Invalid email or password." };
  if (!user) return res.status(401).json(genericError);

  const passwordOk = await verifyPassword(password, user.password_hash);
  if (!passwordOk) return res.status(401).json(genericError);

  const { token } = await createSession(db, user.id);
  setSessionCookie(res, token, SESSION_TTL_MS);

  delete user.password_hash;
  return res.status(200).json({ user });
};
