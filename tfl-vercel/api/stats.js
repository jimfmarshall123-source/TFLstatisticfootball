import { redis, teamKey } from "./_redis.js";
import { isAuthorized } from "./_auth.js";

// GET  /api/stats?team=Carolina%20Flight        -> { data: { [playerId]: entry } }
// POST /api/stats  { team, id, entry }           -> upsert one player's entry (admin only)
export default async function handler(req, res) {
  if (!redis) {
    res.status(500).json({
      error: "Redis is not configured. Connect an Upstash database to this project in Vercel (Storage -> Browse Marketplace) and redeploy.",
    });
    return;
  }

  try {
    if (req.method === "GET") {
      const team = req.query.team;
      if (!team) {
        res.status(400).json({ error: "Missing ?team=" });
        return;
      }
      const raw = await redis.get(teamKey(team));
      const data = raw && typeof raw === "object" ? raw : (raw ? JSON.parse(raw) : {});
      res.status(200).json({ data });
      return;
    }

    if (req.method === "POST") {
      if (!isAuthorized(req)) {
        res.status(401).json({ error: "Not authorized. This site is read-only except for the admin." });
        return;
      }
      const { team, id, entry } = req.body || {};
      if (!team || !id || !entry) {
        res.status(400).json({ error: "Body must include team, id, and entry" });
        return;
      }
      const key = teamKey(team);
      const raw = await redis.get(key);
      const current = raw && typeof raw === "object" ? raw : (raw ? JSON.parse(raw) : {});
      current[id] = { ...entry, updatedAt: new Date().toISOString() };
      await redis.set(key, JSON.stringify(current));
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
}
