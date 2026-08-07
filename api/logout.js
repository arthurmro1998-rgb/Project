const { getPool, ensureSchema } = require("../lib/db");
const { destroySession, clearSessionCookie } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  await ensureSchema();
  const db = getPool();

  await destroySession(db, req);
  clearSessionCookie(res);

  return res.status(200).json({ ok: true });
};
