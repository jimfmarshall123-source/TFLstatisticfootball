import { redis, teamKey } from "./_redis.js";
import { TEAMS_RAW } from "../src/data.js";

// GET /api/leaderboard -> { data: { [playerId]: entry } } merged across every team.
// One request instead of 24 separate per-team fetches from the browser.
export default async function handler(req, res) {
  if (!redis) {
    res.status(500).json({
      error: "Redis is not configured. Connect an Upstash database to this project in Vercel (Storage -> Browse Marketplace) and redeploy.",
    });
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const teamNames = TEAMS_RAW.map(t => t.name);
    const keys = teamNames.map(teamKey);
    const results = await Promise.all(keys.map(k => redis.get(k)));

    const merged = {};
    for (const raw of results) {
      if (!raw) continue;
      const parsed = typeof raw === "object" ? raw : JSON.parse(raw);
      Object.assign(merged, parsed);
    }
    res.status(200).json({ data: merged });
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
}
