# Vercel Environment Variables - Quick Setup

## Copy This Exact Configuration

Go to: **Vercel Dashboard > whatsapp-bot Project > Settings > Environment Variables**

Add these variables exactly as shown:

### 1. Engine Configuration
```
Name: ENGINE_URL
Value: https://whatsbot.hostify.co.zw
Environments: Production, Preview
```

```
Name: ENGINE_API_KEY
Value: JeCPjsPBuIJnpZEWSCqD0uK89UZBqnV68YkaRojtNei
Environments: Production, Preview
```

### 2. Database Configuration
```
Name: MONGODB_URI
Value: mongodb+srv://thelastcroneb_db_user:ThxAi@thxai.c1oeccy.mongodb.net/?appName=ThxAi
Environments: Production, Preview
```

```
Name: MONGODB_DB
Value: Hostify
Environments: Production, Preview
```

```
Name: MONGODB_CONNECTION_STRING
Value: mongodb+srv://thelastcroneb_db_user:ThxAi@thxai.c1oeccy.mongodb.net/?appName=ThxAi
Environments: Production, Preview
```

### 3. AI Services
```
Name: AI_GATEWAY_API_KEY
Value: vck_5cBuzb0y8nw6DbOvd6ySeoge7sGzwviGkgLix9Fv6dsLWHeKq90wN8rp
Environments: Production, Preview
```

### 4. Music Generation (Suno v4)
```
Name: SUNO_API_URL
Value: https://api.omegatech.app/api/ai/sonu4
Environments: Production, Preview
```

### 5. Image Generation
```
Name: IMAGE_AI_API_URL
Value: https://api.omegatech.app/api/ai/nano-banana-pro
Environments: Production, Preview
```

```
Name: LUMINUX_API_URL
Value: https://luminux-models.netlify.app/image
Environments: Production, Preview
```

### 6. Authentication
```
Name: SESSION_SECRET
Value: tech999
Environments: Production, Preview
```

### 7. Analytics (Optional)
```
Name: VERCEL_WEB_ANALYTICS_ID
Value: 17XjrJsaTnGiUj36HF3JVeci6
Environments: Production, Preview
```

## Steps to Complete

1. ✅ Open Vercel Dashboard
2. ✅ Navigate to whatsapp-bot project
3. ✅ Click Settings > Environment Variables
4. ✅ Add each variable above (copy-paste exact values)
5. ✅ Make sure each is set for BOTH Production and Preview
6. ✅ Click "Add" after each variable
7. ✅ Go to Deployments tab
8. ✅ Click the three dots on latest deployment
9. ✅ Select "Redeploy"
10. ✅ Wait for deployment to complete

## Verification

After redeploying:

1. Visit dashboard: https://whatsapp-bot.vercel.app/dashboard
2. Check connection status (should show "Connected")
3. Look at console for any errors (F12 on dashboard)
4. Test in WhatsApp: Send `.menu` to your bot
5. Bot should respond with menu

## If Still Getting ENGINE_URL Error

1. **Double-check the value:** `https://whatsbot.hostify.co.zw` (no trailing slash)
2. **Verify it's set for Production AND Preview environments**
3. **Hard refresh Vercel dashboard:** Ctrl+F5
4. **Redeploy again:** Sometimes first redeploy doesn't pick up new vars
5. **Check if engine is running:** 
   ```bash
   curl https://whatsbot.hostify.co.zw/health
   ```
   Should return 200 status

## Critical Variables (Required for bot to work)

These MUST be set or bot will fail:

- ✅ ENGINE_URL - Bot engine location
- ✅ ENGINE_API_KEY - Engine authentication
- ✅ MONGODB_URI - Database connection
- ✅ AI_GATEWAY_API_KEY - AI features

## Optional Variables (Nice to have)

These enhance features but bot works without them:

- IMAGE_AI_API_URL - Image generation (requires ENGINE)
- SUNO_API_URL - Music generation (requires ENGINE)
- LUMINUX_API_URL - Premium images

---

**Need Help?** See `ENVIRONMENT_SETUP.md` for detailed troubleshooting
