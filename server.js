require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { initDb, getState, setState } = require("./db");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // needed behind Render's proxy for secure cookies

app.use(express.json({ limit: "10mb" })); // roomy enough for a base64-encoded phone photo
app.use(
  session({
    name: "dutylog.sid",
    secret: process.env.SESSION_SECRET || "change-me-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — stay signed in on your own devices
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  res.status(401).json({ error: "not authenticated" });
}

// ---------- auth ----------
app.post("/api/login", async (req, res) => {
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) return res.status(500).json({ error: "APP_PASSWORD_HASH is not set on the server" });
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "Enter a password" });
  const ok = await bcrypt.compare(password, hash);
  if (!ok) return res.status(401).json({ error: "Wrong password" });
  req.session.authed = true;
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/session", (req, res) => {
  res.json({ authed: !!(req.session && req.session.authed) });
});

// ---------- data ----------
const OWNER = "default"; // single-user app; every request reads/writes the same record

app.get("/api/state", requireAuth, async (req, res) => {
  try {
    const data = await getState(OWNER);
    res.json(data);
  } catch (err) {
    console.error("GET /api/state failed:", err);
    res.status(500).json({ error: "Could not read from the database" });
  }
});

app.put("/api/state", requireAuth, async (req, res) => {
  try {
    await setState(OWNER, req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/state failed:", err);
    res.status(500).json({ error: "Could not save to the database" });
  }
});

// ---------- duty photo scan ----------
// Sends a screenshot of a duty slip to the Anthropic API and gets back a CSV
// row in the same format the CSV importer already understands, so it flows
// straight into the existing preview/dedupe logic on the client.
const SCAN_SYSTEM_PROMPT = `You read UK bus duty slip screenshots and extract the shift into one CSV row.
Output ONLY two lines of CSV, nothing else — no explanation, no markdown fences, no code block.
Line 1 (headings): Duty number,Depot,Date,First bus,Second bus,Start,Finish,OT start,OT finish,Description
Line 2: the extracted values.

Rules:
- "Duty number" is the duty code, e.g. SE422 — strip any route/garage suffix (e.g. "- BSS") into Description instead.
- "Depot" is a short code. Known codes: Sydenham = SM, New Cross = NX, Morden Wharf = MG, Camberwell = Q, Sutton = A, Merton = AL, Putney = AF, Peckham = PM. If a depot/garage name appears that isn't in that list, leave it blank rather than guessing.
- "Date" as DD/MM/YYYY.
- "Start" and "Finish" are the paid sign-on and sign-off times (not the intermediate service "Start"/"End" times), as HH:MM 24-hour.
- Leave "First bus", "Second bus", "OT start", "OT finish" blank unless a fleet/bus number or overtime is clearly shown on the slip.
- "Description" is a short summary, e.g. the route or location shown, like "Denmark Hill - BSS".
- If a field genuinely isn't visible or legible, leave it blank — never guess or invent a value.`;

app.post("/api/extract-duty", requireAuth, async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "No image provided" });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set on the server" });

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 300,
        system: SCAN_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/png", data: imageBase64 } },
              { type: "text", text: "Extract this duty slip into the CSV format described." },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic API error:", aiRes.status, errText);
      return res.status(502).json({ error: "The extraction service couldn't read that image" });
    }

    const data = await aiRes.json();
    const csv = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!csv) return res.status(502).json({ error: "Got no text back from the extraction service" });
    res.json({ csv });
  } catch (err) {
    console.error("POST /api/extract-duty failed:", err);
    res.status(500).json({ error: "Could not read the photo" });
  }
});

// ---------- pages ----------
app.get("/index.html", (req, res) => res.redirect("/"));
app.use(express.static(path.join(__dirname, "public"), { index: false }));

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/", (req, res) => {
  if (!(req.session && req.session.authed)) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log("Duty Log listening on port " + PORT));
  })
  .catch((err) => {
    console.error("Failed to set up the database — check DATABASE_URL:", err);
    process.exit(1);
  });
