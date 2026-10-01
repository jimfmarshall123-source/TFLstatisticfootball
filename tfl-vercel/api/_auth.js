// Checks the x-admin-key header against the ADMIN_KEY environment variable.
// This is the real enforcement — the frontend also hides editing controls
// from non-admins, but that's just UI convenience. This check is what
// actually stops an unauthorized write from succeeding.
export function isAuthorized(req) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) {
    // No admin key configured on the server — refuse all writes rather than
    // silently allowing anyone to edit. Set ADMIN_KEY in Vercel's Environment
    // Variables to enable admin editing.
    return false;
  }
  const provided = req.headers["x-admin-key"];
  return typeof provided === "string" && provided === expected;
}
