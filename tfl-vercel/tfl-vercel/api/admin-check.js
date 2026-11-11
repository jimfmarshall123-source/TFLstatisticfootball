import { isAuthorized } from "./_auth.js";

// POST /api/admin-check -> { ok: true } if the x-admin-key header matches,
// otherwise 401. Used only to verify a password before showing edit controls
// — it doesn't read or write any data itself.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false });
    return;
  }
  res.status(200).json({ ok: true });
}
