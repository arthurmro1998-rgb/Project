const { getPool, ensureSchema } = require("../lib/db");
const { getSessionUser } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  await ensureSchema();
  const db = getPool();

  const user = await getSessionUser(db, req);
  if (!user) return res.status(401).json({ error: "Not logged in." });

  return res.status(200).json({ user });
};
