# Duty Log

A shift/timesheet app with a real Postgres backend, ready to deploy. Everything
you enter is saved to the database, so it's the same data whether you open it
on your phone or your computer.

Tested locally end-to-end (login, save, reload, logout, wrong-password
rejection) against a real Postgres database before packaging.

## What you need

- A **Neon** account (free) for the database — [neon.tech](https://neon.tech)
- A **Render** account (free) to host the app — [render.com](https://render.com)
- A **GitHub** account, to hold the code Render deploys from

## 1. Create the database (Neon)

1. Sign up at neon.tech and create a new project (any region close to you is fine).
2. On the project dashboard, copy the **connection string** — it looks like
   `postgresql://user:password@ep-something.neon.tech/dbname?sslmode=require`.
   Keep this somewhere safe; you'll paste it into Render in a moment.

Neon's free tier suspends the database after a period of inactivity and wakes
it automatically on the next request — you might notice the first load after
a while is a second or two slower. Your data isn't deleted.

## 2. Put the code on GitHub

From this folder:

```bash
git init
git add .
git commit -m "Duty Log"
```

Create a new empty repository on GitHub, then follow its instructions to push
this commit to it (something like):

```bash
git remote add origin https://github.com/<you>/duty-log.git
git branch -M main
git push -u origin main
```

## 3. Choose your password

Pick a password only you know, then generate its hash (this never sends the
password anywhere — it runs on your own machine):

```bash
npm install
npm run hash "your chosen password"
```

Copy the long string it prints (starts with `$2a$` or `$2b$`) — that's your
`APP_PASSWORD_HASH`.

## 4. Deploy on Render

1. On Render, **New → Web Service**, connect the GitHub repo you just pushed.
2. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
3. Under **Environment**, add these variables:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from step 1 |
   | `APP_PASSWORD_HASH` | the hash from step 3 |
   | `SESSION_SECRET` | any long random string (e.g. run `openssl rand -hex 32`) |
   | `NODE_ENV` | `production` |

4. Click **Create Web Service**. Render will build and start it — first
   deploy takes a couple of minutes. You'll get a URL like
   `https://duty-log.onrender.com`.

That's it — open the URL, sign in with the password you chose, and it's the
same data on any device you sign into.

## Notes on the free tier

- Render's free web service **spins down after 15 minutes of no traffic** and
  takes ~30-50 seconds to wake back up on the next request. Your data is
  unaffected — it's just a cold start on the server, not data loss. If that
  wait bothers you, Render's cheapest paid tier ($7/month) keeps it always on.
- Neon's free database has generous limits for a single person's use and
  doesn't expire.

## Changing your password later

Run `npm run hash "new password"` again, and update `APP_PASSWORD_HASH` in
Render's environment settings. No code changes needed.

## Running it locally

```bash
cp .env.example .env
# edit .env with a local Postgres connection string and your password hash
npm install
npm start
```

Then open `http://localhost:3000`.

## How your data is stored

Settings and duties are stored together as one JSON document in Postgres —
simple and reliable for one person's use. If you ever want to query duties
directly in SQL (e.g. for your own reports), that's a small follow-up job:
splitting the JSON blob into a proper `duties` table. Just ask.
