import { Redis } from "@upstash/redis";

// Vercel's Upstash Marketplace integration usually sets UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN. Some setups (or the older "Vercel KV" naming) use
// KV_REST_API_URL / KV_REST_API_TOKEN instead — support both so this works
// regardless of which one your dashboard actually injected.
const url =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  console.error(
    "Missing Redis credentials. Connect an Upstash Redis database to this " +
    "project in the Vercel dashboard (Storage -> Browse Marketplace -> Upstash), " +
    "then redeploy."
  );
}

export const redis = url && token ? new Redis({ url, token }) : null;

export function teamSlug(team) {
  return team.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function teamKey(team) {
  return `tfl:stats:${teamSlug(team)}`;
}
