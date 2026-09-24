import React, { useState, useEffect, useMemo, useCallback } from "react";
import { PLAYERS_RAW, TEAMS_RAW } from "./data.js";

/* ---------------------------------------------------------------
   DATA — parsed from the 2026 TFL League standings + roster reports
--------------------------------------------------------------- */

const TEAM_COLORS = [
  "#5A2A27", "#1F4E5F", "#7A5C1E", "#2E5339", "#6B2C4E", "#3B4A6B",
  "#8C3B2E", "#1E3D2F", "#5C4A1E", "#2C5643", "#6B3F2A", "#39506B",
  "#7A2E3F", "#2A4A3E", "#5E4B8A", "#3E5E2E", "#8A5A2E", "#2E3E5E",
  "#6E2E5E", "#4E6B2E", "#2E6E6E", "#6E4E2E", "#3E2E6E", "#6E2E2E",
];

const TEAMS = {};
TEAMS_RAW.forEach((t, i) => {
  TEAMS[t.name] = { ...t, color: TEAM_COLORS[i % TEAM_COLORS.length] };
});

const PLAYERS = PLAYERS_RAW.map(([team, name, position, nflTeam, keyStat, stat2025], idx) => ({
  id: `p${idx}`,
  team, name, position, nflTeam, keyStat, stat2025,
}));

const CONF_ORDER = ["Lombardi", "Landry"];
const DIV_ORDER = ["East", "West"];

/* ---------------------------------------------------------------
   POSITION GROUPING (uses the first-listed position of any combo)
--------------------------------------------------------------- */
const SPECIAL_TEAMS_POSITIONS = new Set(["Place Kicker", "Punter", "KO Returner", "Punt Returner"]);
const DEFENSE_POSITIONS = new Set([
  "1st Defensive Back", "CB", "Left CB", "Right CB",
  "Def End", "Left End", "Right End", "Def Tackle", "Nose Tackle",
  "LB", "I LB", "O LB", "Left I LB", "Right I LB", "Left O LB", "Right O LB",
  "Left LB", "Right LB", "Middle LB",
  "Free Safety", "Strong Safety", "Safety",
]);

function groupForPosition(positionCombo) {
  const first = positionCombo.split(",")[0].trim();
  if (SPECIAL_TEAMS_POSITIONS.has(first)) return "Special Teams";
  if (DEFENSE_POSITIONS.has(first)) return "Defense";
  return "Offense";
}

const POSITION_ORDER = {
  Offense: ["QuarterBack", "HalfBack", "FullBack", "Blocking Back", "Split End", "Flanker", "Tight End",
    "Left Tackle", "Left Guard", "Center", "Right Guard", "Right Tackle", "Off Tackle", "Guard"],
  Defense: ["Left End", "Right End", "Def End", "Def Tackle", "Nose Tackle",
    "Left O LB", "Right O LB", "O LB", "Left I LB", "Right I LB", "I LB", "Left LB", "Right LB", "Middle LB", "LB",
    "Left CB", "Right CB", "CB", "1st Defensive Back", "Free Safety", "Strong Safety", "Safety"],
  "Special Teams": ["Place Kicker", "Punter", "KO Returner", "Punt Returner"],
};

// Standard NFL position abbreviations, for display only — the full names above
// are still what all the grouping/sorting/stat-field logic matches against.
const POSITION_ABBREV = {
  "QuarterBack": "QB",
  "HalfBack": "RB",
  "FullBack": "FB",
  "Blocking Back": "FB",
  "Split End": "WR",
  "Flanker": "WR",
  "Tight End": "TE",
  "Left Tackle": "T",
  "Left Guard": "G",
  "Center": "C",
  "Right Guard": "G",
  "Right Tackle": "T",
  "Off Tackle": "T",
  "Guard": "G",
  "Left End": "DE",
  "Right End": "DE",
  "Def End": "DE",
  "Def Tackle": "DT",
  "Nose Tackle": "NT",
  "Left O LB": "OLB",
  "Right O LB": "OLB",
  "O LB": "OLB",
  "Left I LB": "LB",
  "Right I LB": "LB",
  "I LB": "LB",
  "Left LB": "LB",
  "Right LB": "LB",
  "Middle LB": "LB",
  "LB": "LB",
  "Left CB": "CB",
  "Right CB": "CB",
  "CB": "CB",
  "1st Defensive Back": "DB",
  "Free Safety": "S",
  "Strong Safety": "S",
  "Safety": "S",
  "Place Kicker": "K",
  "Punter": "P",
  "KO Returner": "KR",
  "Punt Returner": "PR",
};

function abbrevPosition(positionCombo) {
  if (!positionCombo) return positionCombo;
  return positionCombo
    .split(",")
    .map(p => POSITION_ABBREV[p.trim()] || p.trim())
    .join(", ");
}

function sortRoster(players, group) {
  const order = POSITION_ORDER[group] || [];
  return [...players].sort((a, b) => {
    const fa = a.position.split(",")[0].trim();
    const fb = b.position.split(",")[0].trim();
    const ia = order.indexOf(fa); const ib = order.indexOf(fb);
    const ra = ia === -1 ? 999 : ia; const rb = ib === -1 ? 999 : ib;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

/* ---------------------------------------------------------------
   STORAGE — talks to the /api/stats, /api/leaderboard, and /api/seed
   serverless functions, which read/write the Upstash Redis database
   connected to this Vercel project.
--------------------------------------------------------------- */
async function loadAllStats() {
  try {
    const res = await fetch("/api/leaderboard");
    const json = await res.json();
    if (!res.ok) return { data: {}, error: json.error || `HTTP ${res.status}` };
    return { data: json.data || {}, error: null };
  } catch (e) { return { data: {}, error: (e && e.message) ? e.message : String(e) }; }
}

const ADMIN_KEY_STORAGE = "tfl-admin-key";

function getStoredAdminKey() {
  try { return localStorage.getItem(ADMIN_KEY_STORAGE) || ""; } catch (e) { return ""; }
}

async function verifyAdminKey(key) {
  try {
    const res = await fetch("/api/admin-check", {
      method: "POST",
      headers: { "x-admin-key": key },
    });
    return res.ok;
  } catch (e) { return false; }
}

async function savePlayerStat(team, id, entry, adminKey) {
  try {
    const res = await fetch("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": adminKey || "" },
      body: JSON.stringify({ team, id, entry }),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error || `HTTP ${res.status}` };
    return { ok: true, error: null };
  } catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
}

async function runWeek1Seed(adminKey) {
  try {
    const res = await fetch("/api/seed", { method: "POST", headers: { "x-admin-key": adminKey || "" } });
    const json = await res.json();
    if (!res.ok) return { added: 0, updated: 0, unchanged: 0, error: json.error || `HTTP ${res.status}` };
    return { ...json, error: null };
  } catch (e) { return { added: 0, updated: 0, unchanged: 0, error: (e && e.message) ? e.message : String(e) }; }
}

/* ---------------------------------------------------------------
   ICONS
--------------------------------------------------------------- */
const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" />
  </svg>
);

/* ---------------------------------------------------------------
   HOME VIEW
--------------------------------------------------------------- */
function Home({ onSelectTeam, onOpenLeaderboards }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return PLAYERS.filter(p => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [query]);

  const teamsByConfDiv = useMemo(() => {
    const map = {};
    for (const [team, meta] of Object.entries(TEAMS)) {
      map[meta.conf] = map[meta.conf] || {};
      map[meta.conf][meta.div] = map[meta.conf][meta.div] || [];
      map[meta.conf][meta.div].push(team);
    }
    for (const c of Object.keys(map)) {
      for (const d of Object.keys(map[c])) {
        map[c][d].sort((a, b) => a.localeCompare(b));
      }
    }
    return map;
  }, []);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px 64px" }}>
      <header style={{ padding: "48px 0 28px", borderBottom: "2px solid var(--ink)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div className="sg-mono" style={{ fontSize: 12, letterSpacing: "0.12em", color: "var(--turf-light)", marginBottom: 6 }}>
            2026 TFL LEAGUE · LOMBARDI &amp; LANDRY CONFERENCES
          </div>
          <button className="sg-btn gold" onClick={onOpenLeaderboards}>Leaderboards</button>
        </div>
        <h1 className="sg-display" style={{ fontSize: "clamp(34px, 9vw, 64px)", lineHeight: 0.95, margin: 0, color: "var(--ink)" }}>
          TFL LEAGUE
        </h1>
        <p style={{ maxWidth: 580, marginTop: 14, fontSize: 15, color: "var(--turf)" }}>
          All 24 TFL club rosters, built from 2025 NFL rosters. Each player's card tracks their real
          2026 NFL season production and PFF grade as this year's games are played — last year's
          2025 stats are shown only as a reference point.
        </p>

        <div style={{ marginTop: 26, position: "relative", maxWidth: 420 }}>
          <div style={{ position: "absolute", left: 12, top: 11, color: "var(--turf)" }}>
            <IconSearch />
          </div>
          <input
            className="sg-input"
            style={{ width: "100%", paddingLeft: 34 }}
            placeholder="Find a player by name..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <div className="sg-scroll" style={{
              position: "absolute", top: 42, left: 0, right: 0, background: "var(--chalk)",
              border: "1px solid var(--ink)", maxHeight: 320, overflowY: "auto", zIndex: 20,
            }}>
              {results.map(p => (
                <div
                  key={p.id}
                  onClick={() => { onSelectTeam(p.team, p.id); setQuery(""); }}
                  style={{
                    padding: "10px 12px", cursor: "pointer", fontSize: 13.5,
                    borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--parchment)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span><strong>{p.name}</strong> <span style={{ color: "var(--turf)" }}>· {abbrevPosition(p.position)}</span></span>
                  <span className="sg-mono" style={{ color: "var(--turf-light)" }}>{p.team}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {CONF_ORDER.map(conf => (
        <section key={conf} style={{ marginTop: 40 }}>
          <h2 className="sg-display" style={{ fontSize: 30, margin: "0 0 14px", color: "var(--turf)" }}>{conf} Conference</h2>
          <div className="sg-grid-2col" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 22 }}>
            {DIV_ORDER.map(div => (
              <div key={div}>
                <div className="sg-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--turf-light)", marginBottom: 8 }}>
                  {conf.toUpperCase()} {div.toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(teamsByConfDiv[conf]?.[div] || []).map(team => {
                    const meta = TEAMS[team];
                    const count = PLAYERS.filter(p => p.team === team).length;
                    return (
                      <button
                        key={team}
                        onClick={() => onSelectTeam(team)}
                        style={{
                          textAlign: "left", background: "var(--chalk)", border: "1px solid var(--line)",
                          borderLeft: `5px solid ${meta.color}`, padding: "10px 12px", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--parchment)"}
                        onMouseLeave={e => e.currentTarget.style.background = "var(--chalk)"}
                      >
                        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span className="sg-display" style={{ fontSize: 20, lineHeight: 1 }}>{team}</span>
                          <span className="sg-mono" style={{ fontSize: 11, color: "var(--turf)" }}>{count} on roster</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   PLAYER ROW — shows real 2025 production + editable 2026 TFL line / PFF
--------------------------------------------------------------- */
/* ---------------------------------------------------------------
   STRUCTURED STAT FIELDS — numeric, so leaderboards can rank them
--------------------------------------------------------------- */
const STAT_FIELD_DEFS = {
  passYds: "Pass Yds", passTD: "Pass TD",
  rushYds: "Rush Yds", rushTD: "Rush TD",
  rec: "Rec", recYds: "Rec Yds", recTD: "Rec TD",
  tackles: "Tackles", sacks: "Sacks", tfLoss: "TFLs", int: "INT",
  prRet: "PR", prYds: "PR Yds", prTD: "PR TD",
  krRet: "KR", krYds: "KR Yds", krTD: "KR TD",
  punts: "Punts", puntYds: "Punt Yds",
  fgm: "FG Made", fga: "FG Att", xpm: "XP Made", xpa: "XP Att",
};

const DLINE_EDGE_POSITIONS = new Set([
  "Left End", "Right End", "Def End", "Def Tackle", "Nose Tackle",
  "Left O LB", "Right O LB", "O LB",
]);
const LINEBACKER_POSITIONS = new Set([
  "LB", "I LB", "Left I LB", "Right I LB", "Left LB", "Right LB", "Middle LB",
]);
const DB_POSITIONS = new Set([
  "CB", "Left CB", "Right CB", "1st Defensive Back", "Free Safety", "Strong Safety", "Safety",
]);

function fieldsForPosition(positionCombo) {
  const first = positionCombo.split(",")[0].trim();
  let fields;
  if (first === "QuarterBack") fields = ["passYds", "passTD", "rushYds", "rushTD"];
  else if (["HalfBack", "FullBack", "Blocking Back"].includes(first)) fields = ["rushYds", "rushTD", "rec", "recYds", "recTD"];
  else if (["Split End", "Flanker", "Tight End"].includes(first)) fields = ["rec", "recYds", "recTD"];
  else if (DLINE_EDGE_POSITIONS.has(first)) fields = ["tackles", "sacks", "tfLoss"];
  else if (LINEBACKER_POSITIONS.has(first)) fields = ["tackles", "sacks", "tfLoss", "int"];
  else if (DB_POSITIONS.has(first)) fields = ["tackles", "int"];
  else if (first === "Punter") fields = ["punts", "puntYds"];
  else if (first === "Place Kicker") fields = ["fgm", "fga", "xpm", "xpa"];
  else fields = []; // OL: PFF only

  // Return-game stats can apply to any position combo that lists a returner role, not just the primary one.
  if (positionCombo.includes("Punt Returner")) fields = [...fields, "prRet", "prYds", "prTD"];
  if (positionCombo.includes("KO Returner")) fields = [...fields, "krRet", "krYds", "krTD"];
  return fields;
}

function PlayerRow({ player, entry, onSave, highlighted, pffRank }) {
  const [open, setOpen] = useState(false);
  const [statLine, setStatLine] = useState(entry?.statLine || "");
  const [pff, setPff] = useState(entry?.pff || "");
  const [statFields, setStatFields] = useState({});
  const [saving, setSaving] = useState(false);

  const relevantFields = fieldsForPosition(player.position);

  useEffect(() => {
    setStatLine(entry?.statLine || "");
    setPff(entry?.pff || "");
    const next = {};
    for (const f of relevantFields) next[f] = entry?.[f] ?? "";
    setStatFields(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  const handleSave = async () => {
    setSaving(true);
    const payload = { statLine, pff, updatedAt: new Date().toISOString() };
    for (const f of relevantFields) payload[f] = statFields[f];
    await onSave(player.id, payload);
    setSaving(false);
    setOpen(false);
  };

  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <div
        onClick={onSave ? () => setOpen(o => !o) : undefined}
        className="sg-player-row-grid"
        style={{
          display: "grid", gridTemplateColumns: "1.3fr 1.1fr 1.6fr 0.5fr 0.5fr", gap: 10,
          padding: "9px 4px", cursor: onSave ? "pointer" : "default", alignItems: "center",
          background: highlighted ? "rgba(201,154,60,0.18)" : "transparent",
          fontSize: 13.5,
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {player.name}
          <span className="sg-mono" style={{ color: "var(--turf-light)", fontSize: 11, marginLeft: 6 }}>
            {player.nflTeam}
          </span>
        </span>
        <span style={{ color: "var(--turf)" }}>{abbrevPosition(player.position)}</span>
        <span className="sg-mono" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry?.statLine || <span style={{ color: "var(--line)" }}>no 2026 stats logged yet</span>}
        </span>
        <span className="sg-mono" style={{ textAlign: "right", fontWeight: 600, color: entry?.pff ? "var(--brick)" : "var(--line)" }}>
          {entry?.pff || "—"}
        </span>
        <span className="sg-mono" style={{ textAlign: "right", color: pffRank ? "var(--turf)" : "var(--line)" }}>
          {pffRank ? `#${pffRank}` : "—"}
        </span>
      </div>
      {open && onSave && (
        <div style={{ padding: "6px 4px 16px" }}>
          <div className="sg-mono" style={{ fontSize: 11, color: "var(--turf-light)", marginBottom: 8 }}>
            2025 season (reference only): {player.stat2025 ? player.stat2025 : (player.keyStat || "no logged stats")}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 260px" }}>
              <span className="sg-mono" style={{ fontSize: 10.5, color: "var(--turf-light)" }}>2026 NFL STAT LINE (current season)</span>
              <input
                className="sg-input"
                placeholder='e.g. "14/22, 187 YDS, 2 TD, 1 INT"'
                value={statLine}
                onChange={e => setStatLine(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, width: 110 }}>
              <span className="sg-mono" style={{ fontSize: 10.5, color: "var(--turf-light)" }}>2026 PFF GRADE</span>
              <input
                className="sg-input"
                placeholder="0–100"
                value={pff}
                onChange={e => setPff(e.target.value)}
              />
            </label>
            <button className="sg-btn gold" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            {entry?.updatedAt && (
              <span className="sg-mono" style={{ fontSize: 10.5, color: "var(--turf-light)" }}>
                updated {new Date(entry.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          {relevantFields.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <span className="sg-mono" style={{ fontSize: 10, color: "var(--turf-light)", alignSelf: "center" }}>
                FOR LEADERBOARDS:
              </span>
              {relevantFields.map(f => (
                <label key={f} style={{ display: "flex", flexDirection: "column", gap: 4, width: 84 }}>
                  <span className="sg-mono" style={{ fontSize: 10, color: "var(--turf-light)" }}>{STAT_FIELD_DEFS[f]}</span>
                  <input
                    className="sg-input"
                    type="number"
                    value={statFields[f] ?? ""}
                    onChange={e => setStatFields(s => ({ ...s, [f]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   IMPORT PANEL — paste to bulk-update a team's 2026 stats
--------------------------------------------------------------- */
function ImportPanel({ team, roster, onBulkSave }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  const runImport = async () => {
    setBusy(true);
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const matched = []; const unmatched = [];
    for (const line of lines) {
      const cols = line.split(",").map(c => c.trim());
      if (cols.length < 2) continue;
      const [fullName, ...rest] = cols;
      const pffMaybe = rest[rest.length - 1];
      const looksLikePff = /^\d{1,3}(\.\d)?$/.test(pffMaybe) && Number(pffMaybe) <= 100;
      const statLine = looksLikePff ? rest.slice(0, -1).join(", ") : rest.join(", ");
      const pff = looksLikePff ? pffMaybe : "";
      const player = roster.find(p => p.name.toLowerCase() === fullName.toLowerCase());
      if (player) matched.push({ id: player.id, statLine, pff, updatedAt: new Date().toISOString() });
      else unmatched.push(fullName);
    }
    await onBulkSave(matched);
    setReport({ matchedCount: matched.length, unmatched });
    setBusy(false);
  };

  return (
    <div style={{ marginTop: 26, border: "1px solid var(--line)", background: "var(--chalk)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="sg-mono"
        style={{
          width: "100%", textAlign: "left", padding: "10px 14px", background: "var(--turf)",
          color: "var(--chalk)", border: "none", cursor: "pointer", fontSize: 12, letterSpacing: "0.06em",
        }}
      >
        {open ? "▾" : "▸"} IMPORT 2026 NFL STATS FOR {team.toUpperCase()}
      </button>
      {open && (
        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 12.5, color: "var(--turf)", marginTop: 0 }}>
            Paste one player per line: <span className="sg-mono">Full Name, stat line, PFF grade</span> (grade optional).
            Matches by exact full name against this team's roster. Use real 2026 NFL season stats and current
            2026 PFF grades — from NFL.com, ESPN, PFF's site, or wherever you're tracking each player this year.
          </p>
          <textarea
            className="sg-input sg-mono"
            style={{ width: "100%", height: 120, resize: "vertical" }}
            placeholder={"Matthew Stafford, 24/34 287 YDS 3 TD, 91.2\nDavante Adams, 6 REC 88 YDS 1 TD, 84"}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="sg-btn gold" onClick={runImport} disabled={busy || !text.trim()}>
              {busy ? "Importing…" : "Import"}
            </button>
            {report && (
              <span className="sg-mono" style={{ fontSize: 11.5, color: "var(--turf-light)" }}>
                matched {report.matchedCount}
                {report.unmatched.length > 0 && ` · unmatched: ${report.unmatched.join(", ")}`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   LEADERBOARDS — top 10 per offensive category + top PFF per position
--------------------------------------------------------------- */
const OFFENSE_CATEGORIES = [
  { key: "passYds", label: "Passing Yards" },
  { key: "passTD", label: "Passing TDs" },
  { key: "rushYds", label: "Rushing Yards" },
  { key: "rushTD", label: "Rushing TDs" },
  { key: "rec", label: "Receptions" },
  { key: "recYds", label: "Receiving Yards" },
  { key: "recTD", label: "Receiving TDs" },
];

const DEFENSE_CATEGORIES = [
  { key: "tackles", label: "Tackles" },
  { key: "sacks", label: "Sacks" },
  { key: "tfLoss", label: "Tackles For Loss" },
  { key: "int", label: "Interceptions" },
];

const SPECIAL_TEAMS_CATEGORIES = [
  { key: "prYds", label: "Punt Return Yards" },
  { key: "krYds", label: "Kick Return Yards" },
  { key: "fgm", label: "Field Goals Made" },
  { key: "puntYds", label: "Punting Yards" },
];



/* ---------------------------------------------------------------
   REAL WEEK 1 2026 NFL STATS — the actual matching/merging logic now
   lives server-side in api/seed.js (it has direct access to Redis,
   so it can loop over every team in one function call instead of
   round-tripping to the browser 24 times). This just calls it.
--------------------------------------------------------------- */

function Leaderboards({ onBack, onSelectTeam, isAdmin, adminKey }) {
  const [allStats, setAllStats] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const refreshStats = useCallback(() => {
    return loadAllStats().then(({ data }) => setAllStats(data));
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshStats().then(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [refreshStats]);

  const handleLoadWeek1 = async () => {
    setSeeding(true);
    setLoadError(null);
    try {
      const result = await runWeek1Seed(adminKey);
      if (result.error) {
        setLoadError(result.error);
      } else {
        setSeedResult(result);
        await refreshStats();
      }
    } catch (err) {
      setLoadError(err && err.message ? err.message : String(err));
    } finally {
      setSeeding(false);
    }
  };

  const categoryLeaders = useMemo(() => {
    if (!allStats) return null;
    const result = {};
    for (const cat of [...OFFENSE_CATEGORIES, ...DEFENSE_CATEGORIES, ...SPECIAL_TEAMS_CATEGORIES]) {
      const rows = [];
      for (const p of PLAYERS) {
        // "int" means two different things depending on who's wearing it: a
        // QB's thrown interceptions (bad) vs. a defender's caught interceptions
        // (good) — both stored under the same field. The Interceptions leaders
        // category is specifically about defensive playmaking, so quarterbacks
        // don't belong in it even though they technically have an "int" value.
        if (cat.key === "int" && p.position.split(",")[0].trim() === "QuarterBack") continue;
        const entry = allStats[p.id];
        const val = entry ? Number(entry[cat.key]) : NaN;
        if (!isNaN(val) && val > 0) rows.push({ player: p, value: val });
      }
      rows.sort((a, b) => b.value - a.value);
      result[cat.key] = rows.slice(0, 10);
    }
    return result;
  }, [allStats]);

  const pffByPosition = useMemo(() => {
    if (!allStats) return null;
    const order = [...POSITION_ORDER.Offense, ...POSITION_ORDER.Defense, ...POSITION_ORDER["Special Teams"]];
    const best = {};
    for (const p of PLAYERS) {
      const entry = allStats[p.id];
      const grade = entry ? Number(entry.pff) : NaN;
      if (isNaN(grade)) continue;
      const pos = p.position.split(",")[0].trim();
      if (!best[pos] || grade > best[pos].value) best[pos] = { player: p, value: grade };
    }
    const rows = Object.entries(best).map(([pos, v]) => ({ position: pos, ...v }));
    rows.sort((a, b) => {
      const ia = order.indexOf(a.position); const ib = order.indexOf(b.position);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    return rows;
  }, [allStats]);

  const loading = allStats === null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 80px" }}>
      <div style={{ padding: "28px 0 18px" }}>
        <button className="sg-btn" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 18 }}>
          <IconBack /> All teams
        </button>
        <h1 className="sg-display" style={{ fontSize: "clamp(28px, 8vw, 48px)", margin: 0, borderBottom: "4px solid var(--gold)", paddingBottom: 14 }}>
          2026 LEADERBOARDS
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--turf)", marginTop: 10, maxWidth: 640 }}>
          Ranked from the 2026 stat lines and PFF grades league members have logged so far. Numbers only
          show up here once someone enters them on a player's row.
        </p>
        {isAdmin && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button className="sg-btn gold" onClick={handleLoadWeek1} disabled={seeding}>
              {seeding ? "Loading…" : "Load real 2026 season stats"}
            </button>
            <span className="sg-mono" style={{ fontSize: 11.5, color: "var(--turf-light)" }}>
              fills in season-to-date stat lines from NFL.com for players who've actually played — updates existing entries to the latest totals
            </span>
          </div>
        )}
        {seedResult && (
          <div className="sg-mono" style={{ fontSize: 12, color: "var(--brick)", marginTop: 8 }}>
            Added stats for {seedResult.added} new player{seedResult.added === 1 ? "" : "s"}, updated {seedResult.updated} existing
            player{seedResult.updated === 1 ? "" : "s"} with corrected data
            {seedResult.unchanged > 0 ? ` (${seedResult.unchanged} already matched and were left alone)` : ""}.
            {seedResult.failedTeams && seedResult.failedTeams.length > 0 && (
              <> Failed to save for: {seedResult.failedTeams.join(", ")} — try clicking the button again.</>
            )}
            {seedResult.firstError && (
              <div style={{ marginTop: 4 }}>Diagnostic: {seedResult.firstError}</div>
            )}
          </div>
        )}
        {loadError && (
          <div className="sg-mono" style={{ fontSize: 12, color: "var(--brick)", marginTop: 8 }}>
            Something went wrong loading stats: {loadError}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: "24px 4px", color: "var(--turf)" }}>Loading league-wide stats…</div>
      ) : (
        <>
          <h2 className="sg-display" style={{ fontSize: 28, margin: "0 0 12px", color: "var(--turf)", borderBottom: "2px solid var(--ink)", paddingBottom: 10 }}>
            Offense
          </h2>
          <div className="sg-grid-2col" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 28, marginBottom: 40 }}>
            {OFFENSE_CATEGORIES.map(cat => (
              <div key={cat.key}>
                <h2 className="sg-display" style={{ fontSize: 22, margin: "0 0 8px", color: "var(--turf)" }}>{cat.label}</h2>
                {categoryLeaders[cat.key].length === 0 ? (
                  <div className="sg-mono" style={{ fontSize: 11.5, color: "var(--line)" }}>no entries logged yet</div>
                ) : (
                  <div style={{ borderTop: "2px solid var(--ink)" }}>
                    {categoryLeaders[cat.key].map((row, i) => (
                      <div
                        key={row.player.id}
                        onClick={() => onSelectTeam(row.player.team, row.player.id)}
                        style={{
                          display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 8,
                          padding: "6px 4px", fontSize: 13, borderBottom: "1px solid var(--line)", cursor: "pointer",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--chalk)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <span className="sg-mono" style={{ color: "var(--turf-light)" }}>{i + 1}</span>
                        <span>
                          {row.player.name}{" "}
                          <span className="sg-mono" style={{ fontSize: 11, color: "var(--turf)" }}>· {row.player.team}</span>
                        </span>
                        <span className="sg-mono" style={{ fontWeight: 600 }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <h2 className="sg-display" style={{ fontSize: 28, margin: "0 0 12px", color: "var(--turf)", borderBottom: "2px solid var(--ink)", paddingBottom: 10 }}>
            Defense
          </h2>
          <div className="sg-grid-2col" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 28, marginBottom: 40 }}>
            {DEFENSE_CATEGORIES.map(cat => (
              <div key={cat.key}>
                <h2 className="sg-display" style={{ fontSize: 22, margin: "0 0 8px", color: "var(--turf)" }}>{cat.label}</h2>
                {categoryLeaders[cat.key].length === 0 ? (
                  <div className="sg-mono" style={{ fontSize: 11.5, color: "var(--line)" }}>no entries logged yet</div>
                ) : (
                  <div style={{ borderTop: "2px solid var(--ink)" }}>
                    {categoryLeaders[cat.key].map((row, i) => (
                      <div
                        key={row.player.id}
                        onClick={() => onSelectTeam(row.player.team, row.player.id)}
                        style={{
                          display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 8,
                          padding: "6px 4px", fontSize: 13, borderBottom: "1px solid var(--line)", cursor: "pointer",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--chalk)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <span className="sg-mono" style={{ color: "var(--turf-light)" }}>{i + 1}</span>
                        <span>
                          {row.player.name}{" "}
                          <span className="sg-mono" style={{ fontSize: 11, color: "var(--turf)" }}>· {row.player.team}</span>
                        </span>
                        <span className="sg-mono" style={{ fontWeight: 600 }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <h2 className="sg-display" style={{ fontSize: 28, margin: "0 0 12px", color: "var(--turf)", borderBottom: "2px solid var(--ink)", paddingBottom: 10 }}>
            Special Teams
          </h2>
          <div className="sg-grid-2col" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 28, marginBottom: 40 }}>
            {SPECIAL_TEAMS_CATEGORIES.map(cat => (
              <div key={cat.key}>
                <h2 className="sg-display" style={{ fontSize: 22, margin: "0 0 8px", color: "var(--turf)" }}>{cat.label}</h2>
                {categoryLeaders[cat.key].length === 0 ? (
                  <div className="sg-mono" style={{ fontSize: 11.5, color: "var(--line)" }}>no entries logged yet</div>
                ) : (
                  <div style={{ borderTop: "2px solid var(--ink)" }}>
                    {categoryLeaders[cat.key].map((row, i) => (
                      <div
                        key={row.player.id}
                        onClick={() => onSelectTeam(row.player.team, row.player.id)}
                        style={{
                          display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 8,
                          padding: "6px 4px", fontSize: 13, borderBottom: "1px solid var(--line)", cursor: "pointer",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--chalk)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <span className="sg-mono" style={{ color: "var(--turf-light)" }}>{i + 1}</span>
                        <span>
                          {row.player.name}{" "}
                          <span className="sg-mono" style={{ fontSize: 11, color: "var(--turf)" }}>· {row.player.team}</span>
                        </span>
                        <span className="sg-mono" style={{ fontWeight: 600 }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <h2 className="sg-display" style={{ fontSize: 28, margin: "0 0 12px", color: "var(--turf)", borderBottom: "2px solid var(--ink)", paddingBottom: 10 }}>
            Highest 2026 PFF Grade by Position
          </h2>
          {pffByPosition.length === 0 ? (
            <div className="sg-mono" style={{ fontSize: 11.5, color: "var(--line)" }}>no PFF grades logged yet</div>
          ) : (
            <div className="sg-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px 24px" }}>
              {pffByPosition.map(row => (
                <div
                  key={row.position}
                  onClick={() => onSelectTeam(row.player.team, row.player.id)}
                  style={{
                    display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 4px",
                    borderBottom: "1px solid var(--line)", fontSize: 13, cursor: "pointer",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--chalk)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span>
                    <span className="sg-mono" style={{ fontSize: 10.5, color: "var(--turf-light)" }}>{abbrevPosition(row.position).toUpperCase()}</span>
                    <br />
                    {row.player.name} <span className="sg-mono" style={{ fontSize: 11, color: "var(--turf)" }}>· {row.player.team}</span>
                  </span>
                  <span className="sg-mono" style={{ fontWeight: 600, color: "var(--brick)", alignSelf: "center" }}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   TEAM VIEW
--------------------------------------------------------------- */
function TeamPage({ team, onBack, highlightId, isAdmin, adminKey }) {
  const meta = TEAMS[team];
  const roster = useMemo(() => PLAYERS.filter(p => p.team === team), [team]);
  const [fullStats, setFullStats] = useState({}); // all players, all teams — one combined store
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Offense");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAllStats().then(({ data }) => {
      if (!cancelled) { setFullStats(data); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [team]);

  // This team's slice, for display only — saves always go through the full object.
  const stats = fullStats;

  // League-wide PFF rank within each player's primary position (same grouping as the Leaderboards page).
  const pffRanks = useMemo(() => {
    const byPosition = {};
    for (const p of PLAYERS) {
      const entry = fullStats[p.id];
      const grade = entry ? Number(entry.pff) : NaN;
      if (isNaN(grade)) continue;
      const pos = p.position.split(",")[0].trim();
      byPosition[pos] = byPosition[pos] || [];
      byPosition[pos].push({ id: p.id, grade });
    }
    const ranks = {};
    for (const pos of Object.keys(byPosition)) {
      const sorted = [...byPosition[pos]].sort((a, b) => b.grade - a.grade);
      sorted.forEach((row, i) => { ranks[row.id] = i + 1; });
    }
    return ranks;
  }, [fullStats]);

  const grouped = useMemo(() => {
    const groups = { Offense: [], Defense: [], "Special Teams": [] };
    for (const p of roster) groups[groupForPosition(p.position)].push(p);
    for (const g of Object.keys(groups)) groups[g] = sortRoster(groups[g], g);
    return groups;
  }, [roster]);

  const handleSaveOne = useCallback(async (id, entry) => {
    setFullStats(prev => ({ ...prev, [id]: entry }));
    await savePlayerStat(team, id, entry, adminKey);
  }, [team, adminKey]);

  const handleBulkSave = useCallback(async (entries) => {
    if (entries.length === 0) return;
    setFullStats(prev => {
      const next = { ...prev };
      for (const e of entries) next[e.id] = { statLine: e.statLine, pff: e.pff, updatedAt: e.updatedAt };
      return next;
    });
    // Each player gets its own request — small payloads, no risk of one big
    // write clobbering a teammate's concurrent edit.
    for (const e of entries) {
      await savePlayerStat(team, e.id, { statLine: e.statLine, pff: e.pff, updatedAt: e.updatedAt }, adminKey);
    }
  }, [team, adminKey]);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px 80px" }}>
      <div style={{ padding: "28px 0 18px" }}>
        <button className="sg-btn" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 18 }}>
          <IconBack /> All teams
        </button>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderBottom: `4px solid ${meta.color}`, paddingBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div className="sg-mono" style={{ fontSize: 12, color: "var(--turf-light)", letterSpacing: "0.1em" }}>
              {meta.conf.toUpperCase()} {meta.div.toUpperCase()}
            </div>
            <h1 className="sg-display" style={{ fontSize: "clamp(28px, 8vw, 48px)", margin: 0 }}>{team}</h1>
          </div>
          <div className="sg-mono" style={{ fontSize: 12, color: "var(--turf)", textAlign: "right" }}>
            {roster.length} players
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {["Offense", "Defense", "Special Teams"].map(g => (
          <button
            key={g}
            onClick={() => setTab(g)}
            className={tab === g ? "sg-btn gold" : "sg-btn"}
          >
            {g} ({grouped[g].length})
          </button>
        ))}
      </div>

      <div className="sg-player-row-header" style={{
        display: "grid", gridTemplateColumns: "1.3fr 1.1fr 1.6fr 0.5fr 0.5fr", gap: 10,
        padding: "6px 4px", borderBottom: "2px solid var(--ink)", marginBottom: 2,
      }}>
        {["NAME", "POSITION", "2026 NFL STAT LINE", "2026 PFF", "RANK"].map((h, i) => (
          <span key={h} className="sg-mono" style={{ fontSize: 10, color: "var(--turf-light)", textAlign: i >= 3 ? "right" : "left" }}>{h}</span>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "24px 4px", color: "var(--turf)" }}>Loading roster stats…</div>
      ) : (
        grouped[tab].map(p => (
          <PlayerRow
            key={p.id}
            player={p}
            entry={stats[p.id]}
            onSave={isAdmin ? handleSaveOne : null}
            highlighted={p.id === highlightId}
            pffRank={pffRanks[p.id]}
          />
        ))
      )}

      {isAdmin && <ImportPanel team={team} roster={roster} onBulkSave={handleBulkSave} />}
    </div>
  );
}

/* ---------------------------------------------------------------
   APP ROOT
--------------------------------------------------------------- */
export default function App() {
  const [view, setView] = useState({ page: "home" });
  const [adminKey, setAdminKey] = useState(() => getStoredAdminKey());
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (adminKey) {
      verifyAdminKey(adminKey).then(ok => { if (!cancelled) setIsAdmin(ok); });
    } else {
      setIsAdmin(false);
    }
    return () => { cancelled = true; };
  }, [adminKey]);

  const handleAdminLogin = async () => {
    const entered = window.prompt("Admin password:");
    if (!entered) return;
    const ok = await verifyAdminKey(entered);
    if (ok) {
      try { localStorage.setItem(ADMIN_KEY_STORAGE, entered); } catch (e) {}
      setAdminKey(entered);
    } else {
      window.alert("That password isn't correct.");
    }
  };

  const handleAdminLogout = () => {
    try { localStorage.removeItem(ADMIN_KEY_STORAGE); } catch (e) {}
    setAdminKey("");
    setIsAdmin(false);
  };

  const goTeam = (team, highlightId) => setView({ page: "team", team, highlightId });
  const goHome = () => setView({ page: "home" });
  const goLeaderboards = () => setView({ page: "leaderboards" });

  return (
    <div className="sg-root" style={{ minHeight: "100vh" }}>
      {view.page === "home" && <Home onSelectTeam={goTeam} onOpenLeaderboards={goLeaderboards} />}
      {view.page === "team" && (
        <TeamPage team={view.team} onBack={goHome} highlightId={view.highlightId} isAdmin={isAdmin} adminKey={adminKey} />
      )}
      {view.page === "leaderboards" && (
        <Leaderboards onBack={goHome} onSelectTeam={goTeam} isAdmin={isAdmin} adminKey={adminKey} />
      )}
      <footer style={{ textAlign: "center", padding: "20px 0 40px", color: "var(--turf-light)", fontSize: 11.5 }} className="sg-mono">
        2026 TFL LEAGUE · rosters from the Strat-O-Matic league reports · 2026 NFL season stats &amp; PFF grades entered by league members
        <div style={{ marginTop: 8 }}>
          {isAdmin ? (
            <>
              <span style={{ color: "var(--turf)" }}>admin mode</span>
              {" · "}
              <button onClick={handleAdminLogout} className="sg-mono" style={{ background: "none", border: "none", color: "var(--turf-light)", textDecoration: "underline", cursor: "pointer", fontSize: 11.5, padding: 0 }}>log out</button>
            </>
          ) : (
            <button onClick={handleAdminLogin} className="sg-mono" style={{ background: "none", border: "none", color: "var(--turf-light)", textDecoration: "underline", cursor: "pointer", fontSize: 11.5, padding: 0 }}>admin</button>
          )}
        </div>
      </footer>
    </div>
  );
}
