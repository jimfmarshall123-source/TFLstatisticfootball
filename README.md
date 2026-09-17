# TFL League

The TFL League stats site, rebuilt as a deployable project for Vercel.

## What's in here

```
index.html          Page shell (fonts, favicon, title)
src/
  main.jsx          React entry point
  App.jsx            The whole site (all pages/components)
  data.js            Team + player roster data
  week1seeds.js      Bundled Week 1 2026 stats (used to seed the database)
  index.css          Design tokens / styling
api/
  _redis.js          Shared Redis connection helper
  stats.js           GET/POST a single team's stats
  leaderboard.js      GET merged stats for all 24 teams in one call
  seed.js            POST — loads the Week 1 2026 seed data into Redis
```

## One-time setup

1. **Create a free Vercel account** at vercel.com (sign in with GitHub if you can — it makes step 4 automatic).

2. **Push this folder to a new GitHub repository.** It can be private.

3. **Import the repo into Vercel** — "Add New Project" → pick the repo → Deploy. Vercel auto-detects this as a Vite project; no configuration needed. It will deploy successfully even before the database is connected (the site will load, but stats won't save yet).

4. **Connect a database.** In your Vercel project dashboard: **Storage → Browse Marketplace → Upstash → Redis**. Connect it to this project. Vercel automatically adds the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` environment variables and redeploys.

5. **Load Week 1 stats.** Open your live site, go to the Leaderboards page, and click "Load real Week 1 2026 stats." This runs once and populates the database — after that, everyone who opens the link sees the same live data.

That's it. The link Vercel gives you (something like `your-project.vercel.app`) is now a real, public website anyone can open, with data that persists and updates live for every visitor.

## Making changes later

Any time you want something changed (new stats, a bug fix, a new feature), the same file gets updated and pushed back to GitHub — Vercel redeploys automatically within about a minute of every push, no manual redeploy step needed.

## Local development (optional)

Not required for normal use, but if you want to run this on your own machine:

```bash
npm install
npm i -g vercel        # Vercel's CLI, only needed for local API routes
vercel dev             # in one terminal — runs the /api functions
npm run dev            # in another terminal — runs the frontend
```

You'll need a `.env.local` file with your Upstash credentials (copy `.env.example` and fill it in from your Vercel project's Environment Variables page) for the API routes to work locally.
