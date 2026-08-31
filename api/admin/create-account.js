const { getPool, ensureSchema } = require("../../lib/db");
const { hashPassword, validatePassword, getSessionUser } = require("../../lib/auth");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = ["customer", "contractor", "admin"];

// Contractor and admin accounts are never self-service (ACC-06, ACC-07) —
// only an already-authenticated admin can create one, here.
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

  const { email, password, firstName, lastName, role } = req.body || {};

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "A valid email is required." });
  }
  if (!firstName || !firstName.trim()) {
    return res.status(400).json({ error: "First name is required." });
  }
  if (!lastName || !lastName.trim()) {
    return res.status(400).json({ error: "Last name is required." });
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${ALLOWED_ROLES.join(", ")}.` });
  }

  const normalizedEmail = email.toLowerCase();
  const existing = await db.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const passwordHash = await hashPassword(password);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id, email, first_name, last_name, role, email_verified`,
    [normalizedEmail, passwordHash, firstName.trim(), lastName.trim(), role]
  );

  return res.status(201).json({ user: rows[0] });
};
