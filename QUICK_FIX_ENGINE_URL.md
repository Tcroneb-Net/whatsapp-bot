# Quick Fix: ENGINE_URL Error on Vercel

## TL;DR - 3 Steps

### 1. Go Here
https://vercel.com/tcronebhackx-md/whatsapp-bot/settings/environment-variables

### 2. Add These Variables

**For Production AND Preview** (check both boxes):

```
ENGINE_URL = https://whatsbot.hostify.co.zw

ENGINE_API_KEY = JeCPjsPBuIJnpZEWSCqD0uK89UZBqnV68YkaRojtNei

MONGODB_URI = mongodb+srv://thelastcroneb_db_user:ThxAi@thxai.c1oeccy.mongodb.net/?appName=ThxAi

AI_GATEWAY_API_KEY = vck_5cBuzb0y8nw6DbOvd6ySeoge7sGzwviGkgLix9Fv6dsLWHeKq90wN8rp
```

### 3. Redeploy
- Go to **Deployments** tab
- Click •••  on latest deployment
- Select **Redeploy**
- Wait for green checkmark

## Done ✅

Error should be gone. If still showing after 2 minutes, clear browser cache (Ctrl+Shift+Delete) and refresh.

## Why This Works

- **Local dev** (.env.development.local): Has ENGINE_URL for testing
- **Production** (Vercel): Uses Environment Variables from Settings
- **Both required** for proper functionality

See `VERCEL_ENV_VARIABLES_FIX.md` for detailed troubleshooting.
