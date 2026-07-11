# Environment Setup Guide - WhatsApp Bot Pro

## Required Environment Variables

Your WhatsApp bot requires specific environment variables to function properly. Follow this guide to set them up in Vercel.

### Step 1: Access Vercel Project Settings

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your **whatsapp-bot** project
3. Click **Settings** in the top menu
4. Click **Environment Variables** in the left sidebar

### Step 2: Add Required Variables

Add the following environment variables with their values:

#### Engine Configuration (REQUIRED)
```
ENGINE_URL = https://whatsbot.hostify.co.zw
ENGINE_API_KEY = JeCPjsPBuIJnpZEWSCqD0uK89UZBqnV68YkaRojtNei
```

**What it does:**
- `ENGINE_URL`: Points to your bot engine subdomain (must be accessible)
- `ENGINE_API_KEY`: API key for authenticating engine requests

#### Database Configuration (REQUIRED)
```
MONGODB_URI = mongodb+srv://thelastcroneb_db_user:ThxAi@thxai.c1oeccy.mongodb.net/?appName=ThxAi
MONGODB_DB = Hostify
MONGODB_CONNECTION_STRING = mongodb+srv://thelastcroneb_db_user:ThxAi@thxai.c1oeccy.mongodb.net/?appName=ThxAi
```

**What it does:**
- Stores bot settings, user data, and configuration
- Persists state across deployments

#### AI Services (REQUIRED for AI features)
```
AI_GATEWAY_API_KEY = vck_5cBuzb0y8nw6DbOvd6ySeoge7sGzwviGkgLix9Fv6dsLWHeKq90wN8rp
```

**What it does:**
- Enables Vercel AI Gateway for LLM features
- Powers GPT chat and AI responses

#### Suno Music Generation (For music feature)
```
SUNO_API_URL = https://api.omegatech.app/api/ai/sonu4
```

**What it does:**
- Generates AI music when users use `.suno` command

#### Image Generation (For image features)
```
IMAGE_AI_API_URL = https://api.omegatech.app/api/ai/nano-banana-pro
LUMINUX_API_URL = https://luminux-models.netlify.app/image
```

**What it does:**
- `IMAGE_AI_API_URL`: Nano Banana Pro for realistic images
- `LUMINUX_API_URL`: Luminux XGold for anime/art images

#### Authentication & Security (REQUIRED)
```
SESSION_SECRET = tech999
JWT = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**What it does:**
- Secures user sessions
- Handles JWT token signing

#### Analytics (Optional)
```
VERCEL_WEB_ANALYTICS_ID = 17XjrJsaTnGiUj36HF3JVeci6
```

**What it does:**
- Tracks usage and performance metrics

### Step 3: Set Environment for Each Stage

Each variable should be set for the stages where it's needed:

- **Development**: Local testing in `.env.development.local`
- **Preview**: Staging deployments on Vercel
- **Production**: Live deployment

**Recommended Setup:**
- Set all variables for **Production** and **Preview**
- This ensures consistency across all deployments

### Step 4: Verify ENGINE_URL Accessibility

Before redeploying, verify that your engine URL is accessible:

```bash
curl https://whatsbot.hostify.co.zw/health
```

Expected response:
```json
{
  "status": "ok",
  "connected": true
}
```

### Step 5: Redeploy the Project

1. After adding all variables, go to **Deployments**
2. Click the three dots on the latest deployment
3. Select **Redeploy**
4. Wait for deployment to complete

Or trigger a redeploy via Git:
```bash
git commit --allow-empty -m "Trigger redeploy with env vars"
git push origin main
```

### Step 6: Verify Deployment

After deployment completes:

1. Visit your dashboard at `https://whatsapp-bot.vercel.app/dashboard`
2. Check that the connection status shows "Connected"
3. Try running `.menu` command to verify the bot responds
4. Test AI features: `.suno test prompt` and `.img test image`

## Troubleshooting

### "ENGINE_URL is not configured"
- Verify `ENGINE_URL` is set in Vercel project settings
- Check that the value is exactly: `https://whatsbot.hostify.co.zw`
- Redeploy the project after adding the variable

### "Cannot connect to engine"
- Verify the ENGINE_URL is accessible: `curl https://whatsbot.hostify.co.zw`
- Check that your bot engine is running
- Review engine logs for connection errors
- Verify API key is correct: `ENGINE_API_KEY`

### "MongoDB connection failed"
- Verify `MONGODB_URI` is correct
- Check MongoDB Atlas IP whitelist includes Vercel IPs
- Verify database credentials are valid
- Check network connectivity

### "AI features not working"
- Verify `AI_GATEWAY_API_KEY` is set correctly
- Check API rate limits haven't been exceeded
- Verify `SUNO_API_URL` and `IMAGE_AI_API_URL` are accessible
- Review API provider status pages

### "Variables not taking effect"
- Ensure you redeployed after adding variables
- Clear browser cache (Ctrl+F5)
- Check that variables are set for correct deployment stage
- Verify variable names match exactly (case-sensitive)

## Environment Variable Security

**Best Practices:**

1. **Never commit `.env` files to Git**
   - Add `.env.development.local` to `.gitignore`
   - Keep API keys private

2. **Rotate API keys regularly**
   - Change `ENGINE_API_KEY` every 90 days
   - Regenerate `AI_GATEWAY_API_KEY` if compromised

3. **Use separate keys for environments**
   - Production: Separate API keys
   - Preview: Separate API keys
   - Development: Local testing only

4. **Monitor usage**
   - Check API provider dashboards for unusual activity
   - Review Vercel logs for failed requests
   - Alert on quota exceedances

## Local Development Setup

For local testing, create `.env.development.local`:

```bash
# Copy from the template above
ENGINE_URL=https://whatsbot.hostify.co.zw
ENGINE_API_KEY=your-api-key
MONGODB_URI=your-mongodb-uri
AI_GATEWAY_API_KEY=your-ai-gateway-key
# ... other variables
```

Then run:
```bash
npm run dev
```

The dev server will automatically load variables from `.env.development.local`.

## Production Deployment Checklist

- [ ] All required variables are set in Vercel
- [ ] ENGINE_URL points to active bot engine
- [ ] MongoDB connection is tested
- [ ] AI Gateway API key is valid
- [ ] Suno and image API URLs are accessible
- [ ] Project has been redeployed after adding variables
- [ ] Dashboard shows "Connected" status
- [ ] `.menu` command responds in WhatsApp
- [ ] AI commands work (`.suno`, `.img`)

## Support

If you encounter issues:

1. Check this guide first
2. Review Vercel deployment logs: Settings > Deployments > View logs
3. Check engine logs at your bot engine host
4. Review error messages in browser console (F12)
5. Contact support with complete error messages

---

**Last Updated:** 2026-07-11
**Bot Version:** Pro 2024
**Status:** Production Ready
