const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const SESSION_COOKIE_NAME = "session_token";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_MIN_LENGTH = 12;

// Returns an error message if the password fails the policy, or null if it's fine.
function validatePassword(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password) && !/[^A-Za-z0-9]/.test(password)) {
    return "Password must include at least one number or symbol.";
  }
  return null;
}

function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Random bearer tokens (session/reset/verify) are high-entropy already;
// we still hash before storing so a DB leak alone doesn't hand out valid tokens.
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function setSessionCookie(res, token, maxAgeMs) {
  const maxAgeSeconds = Math.floor(maxAgeMs / 1000);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
}

async function createSession(db, userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [tokenHash, userId, expiresAt]
  );
  return { token, expiresAt };
}

async function getSessionUser(db, req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const tokenHash = hashToken(token);
  const { rows } = await db.query(
    `SELECT users.id, users.email, users.first_name, users.last_name, users.role, users.email_verified
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function destroySession(db, req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return;
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

async function destroyAllSessionsForUser(db, userId) {
  await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

module.exports = {
  SESSION_TTL_MS,
  RESET_TTL_MS,
  VERIFY_TTL_MS,
  PASSWORD_MIN_LENGTH,
  validatePassword,
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
  setSessionCookie,
  clearSessionCookie,
  createSession,
  getSessionUser,
  destroySession,
  destroyAllSessionsForUser,
};
