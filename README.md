# WA Bot Hub

A multi-user WhatsApp bot platform with a web dashboard. Users pair their number
with an 8-digit pairing code, receive a generated password in their WhatsApp DM,
then log into the dashboard to control their own bot.

> **Heads up:** WhatsApp bots built on Baileys are unofficial and against WhatsApp's
> Terms of Service. Numbers can be banned, especially with auto-reactions and
> auto-follow enabled. Use at your own risk.

## Architecture

This repo has **two deployable parts** that share one MongoDB database:

| Part | Folder | Runtime | Where it runs |
| --- | --- | --- | --- |
| **Dashboard** | `/` (Next.js app) | Serverless | Vercel / hostify |
| **Bot engine** | `/engine` | Long-running Node process | Railway / Render / Fly |

The dashboard **cannot** run the bot itself — WhatsApp needs a persistent
websocket per user, which serverless functions can't hold open. The engine is a
standalone Node service that keeps every paired user connected, stores sessions
in MongoDB (so it auto-restores on crash/restart), and exposes a small HTTP API
that the dashboard calls.

```
Browser ──> Next.js dashboard (Vercel) ──> MongoDB Atlas <── Bot engine (Railway) ──> WhatsApp
                         └──────────── HTTP (ENGINE_URL + ENGINE_API_KEY) ───────────┘
```

## Features

- **Pairing code login** — enter your number, get an 8-digit code to link in
  WhatsApp > Linked Devices. No QR scan needed.
- **Generated password** — on first pair, the bot DMs you a password. Log in with
  number + password.
- **Per-user isolation** — each user controls only their own bot.
- **Settings dashboard**: custom bot name, auto status view on/off, anti
  view-once (save to same chat or your private DM), alive check, ping check.
- **Force-follow channel + auto-react** — every paired bot follows your channel
  and reacts to new channel posts automatically.
- **MongoDB session store** — sessions persist; the engine auto-restores all bots
  on restart. Users can delete their session from the dashboard.

## Environment variables

### Dashboard (set in Vercel Project Settings → Vars)

| Var | Description |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB` | Database name (e.g. `whatsapp_bot`) |
| `SESSION_SECRET` | Long random string for signing login cookies |
| `ENGINE_URL` | Public URL of your deployed engine |
| `ENGINE_API_KEY` | Shared secret; must match the engine |

### Engine (`engine/.env`, see `engine/.env.example`)

| Var | Description |
| --- | --- |
| `MONGODB_URI` / `MONGODB_DB` | Same database as the dashboard |
| `API_KEY` | Must equal the dashboard's `ENGINE_API_KEY` |
| `PORT` | HTTP port (default `8080`) |
| `CHANNEL_JID` | Your channel's newsletter JID for force-follow/auto-react |
| `REACT_EMOJI` | Emoji used for channel auto-reactions (default ❤️) |

## Running locally

**Dashboard**
```bash
pnpm install
pnpm dev
```

**Engine**
```bash
cd engine
cp .env.example .env   # fill in values
pnpm install
pnpm dev
```

## Deploying the engine

The engine ships with a `Dockerfile`. On Railway/Render/Fly, point the service at
the `engine/` folder, set the env vars above, and expose the `PORT`. Then put that
service's public URL into the dashboard's `ENGINE_URL`.

---

