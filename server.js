require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { initDb, getState, setState } = require("./db");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // needed behind Render's proxy for secure cookies

app.use(express.json({ limit: "2mb" }));
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
