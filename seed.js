import { redis, teamKey } from "./_redis.js";
import { PLAYERS_RAW } from "../src/data.js";
import { SEASON_2026_SEEDS } from "../src/season2026seeds.js";
import { isAuthorized } from "./_auth.js";

// POST /api/seed -> merges the bundled 2026 season-to-date stats into Redis (admin only).
// Only writes fields that are missing or different from what's already saved,
// so it's always safe to click again after the underlying seed data changes.
export default async function handler(req, res) {
  if (!redis) {
    res.status(500).json({
      error: "Redis is not configured. Connect an Upstash database to this project in Vercel (Storage -> Browse Marketplace) and redeploy.",
    });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Not authorized. This site is read-only except for the admin." });
    return;
  }

  try {
    const idToTeam = {};
    PLAYERS_RAW.forEach((p, idx) => { idToTeam[`p${idx}`] = p[0]; });

    const byTeam = {};
    for (const [id, stats] of Object.entries(SEASON_2026_SEEDS)) {
      const team = idToTeam[id];
      if (!team) continue;
      byTeam[team] = byTeam[team] || [];
      byTeam[team].push([id, stats]);
    }

    let added = 0, updated = 0, unchanged = 0;
    for (const [team, entries] of Object.entries(byTeam)) {
      const key = teamKey(team);
      const raw = await redis.get(key);
      const existing = raw && typeof raw === "object" ? raw : (raw ? JSON.parse(raw) : {});
      let changedAny = false;

      for (const [id, stats] of entries) {
        const prev = existing[id];
        if (!prev) {
          existing[id] = { ...stats, updatedAt: new Date().toISOString() };
          added++;
          changedAny = true;
        } else {
          const changed = Object.keys(stats).some(k => prev[k] !== stats[k]);
          if (changed) {
            existing[id] = { ...prev, ...stats, updatedAt: new Date().toISOString() };
            updated++;
            changedAny = true;
          } else {
            unchanged++;
          }
        }
      }

      if (changedAny) {
        await redis.set(key, JSON.stringify(existing));
      }
    }

    res.status(200).json({ added, updated, unchanged });
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
}
