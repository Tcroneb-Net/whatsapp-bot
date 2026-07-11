# Fix ENGINE_URL Error on Vercel

## Problem
You're seeing: "ENGINE_URL is not configured" error on Vercel even though you added the variable.

## Why This Happens
The local `.env.development.local` file doesn't have ENGINE_URL, and Vercel environment variables weren't properly set during deployment.

## Solution: 3 Simple Steps

### Step 1: Copy These Exact Values
```
ENGINE_URL = https://whatsbot.hostify.co.zw
ENGINE_API_KEY = JeCPjsPBuIJnpZEWSCqD0uK89UZBqnV68YkaRojtNei
MONGODB_URI = mongodb+srv://thelastcroneb_db_user:ThxAi@thxai.c1oeccy.mongodb.net/?appName=ThxAi
AI_GATEWAY_API_KEY = vck_5cBuzb0y8nw6DbOvd6ySeoge7sGzwviGkgLix9Fv6dsLWHeKq90wN8rp
SUNO_API_URL = https://api.omegatech.app/api/ai/sonu4
IMAGE_AI_API_URL = https://api.omegatech.app/api/ai/nano-banana-pro
LUMINUX_API_URL = https://luminux-models.netlify.app/image
SESSION_SECRET = tech999
MONGODB_DB = Hostify
```

### Step 2: Add to Vercel
1. Go to **Vercel Dashboard**
2. Select **whatsapp-bot** project
3. Click **Settings** (top right)
4. Click **Environment Variables** (left sidebar)
5. For each variable above:
   - Click **Add New**
   - Paste the variable name (e.g., `ENGINE_URL`)
   - Paste the value exactly as shown
   - **IMPORTANT:** Select BOTH "Production" AND "Preview" checkboxes
   - Click **Save**

### Step 3: Redeploy
1. Go to **Deployments** tab
2. Find your latest failed deployment
3. Click the three dots (•••)
4. Select **Redeploy**
5. Wait for deployment to complete

## Verification

After redeployment:
1. Visit your Vercel deployment URL
2. You should see the dashboard without the ENGINE_URL error
3. Try the `.menu` command in WhatsApp
4. All pro features should work

## Important Notes

### For Vercel (Production)
- Environment variables in Vercel Settings are the source of truth
- `.env` files are ignored in production
- Variables must be set for BOTH Production AND Preview environments
- Each change requires a redeploy

### For Local Development
- Use `.env.development.local` (not committed to git)
- Already includes ENGINE_URL
- Automatic on `npm run dev`

### Security
- Never commit `.env` files with real values
- Use Vercel's Environment Variables Settings for production
- Engine API key is now secured in Vercel

## If Still Getting Error After Redeploy

1. **Clear browser cache:** Ctrl+Shift+Delete (then reload)
2. **Check variables were actually saved:** Go back to Environment Variables page and verify they're there
3. **Verify both Production AND Preview are checked** when adding variables
4. **Wait 2-3 minutes** after redeploy (Vercel sometimes caches)
5. **Redeploy one more time** if still showing error

## Environment Variables Breakdown

| Variable | Type | Purpose | Example |
|----------|------|---------|---------|
| ENGINE_URL | Critical | Bot engine URL | https://whatsbot.hostify.co.zw |
| ENGINE_API_KEY | Optional | Engine authentication | JeCPjsPBuIJnpZEWSCqD... |
| MONGODB_URI | Critical | Database connection | mongodb+srv://... |
| MONGODB_DB | Critical | Database name | Hostify |
| AI_GATEWAY_API_KEY | Optional | AI service token | vck_5cBuzb0y... |
| SESSION_SECRET | Security | Session encryption | tech999 |
| SUNO_API_URL | Optional | Music generation API | https://api.omegatech.app/... |
| IMAGE_AI_API_URL | Optional | Image generation | https://api.omegatech.app/... |
| LUMINUX_API_URL | Optional | Premium image API | https://luminux-models.netlify.app... |

## Code Changes Made

1. **lib/engine.ts** - Improved ENGINE_URL validation with better error messages for production vs development
2. **.env.development.local** - Added ENGINE_URL for local development
3. **.env.production** - Created template showing required variables

The code now:
- Uses `process.env` only (respects Vercel environment variables)
- Gives detailed error messages specific to Vercel
- Handles both development and production properly
- Validates URL is not empty with proper trimming
