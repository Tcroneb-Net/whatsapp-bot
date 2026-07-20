# Fresh Start Guide - Gladiator Bot

## URL Error Fix

The error "Failed to parse URL from whatsapp-bot-production-8cc0.up.railway.app/pair" occurred because the ENGINE_URL was missing the HTTPS protocol.

### What Was Fixed

**Before:**
```
ENGINE_URL=whatsapp-bot-production-8cc0.up.railway.app
```

**After:**
```
ENGINE_URL=https://whatsapp-bot-production-8cc0.up.railway.app
```

### Files Updated

1. `.env.development.local` - Local development environment
2. `.env.production` - Production environment template

Both now include the `https://` protocol prefix.

## Starting Fresh with MongoDB

To completely reset your bot and start from a fresh state:

### Step 1: Clear MongoDB

Run the cleanup script:

```bash
node --env-file-if-exists=/vercel/share/.env.project scripts/clear-mongo-db.mjs
```

Or with your environment:

```bash
export MONGODB_URI='mongodb+srv://thelastcroneb_db_user:ThxAi@thxai.c1oeccy.mongodb.net/?appName=ThxAi'
export MONGODB_DB='Hostify'
node scripts/clear-mongo-db.mjs
```

### Step 2: What Gets Cleared

The script safely deletes:
- **bots** collection - All bot configurations
- **auth_state** collection - All WhatsApp sessions

After clearing, your bot will:
- Remove all paired sessions
- Reset all settings to defaults
- Clear all stored configurations
- Start fresh with no history

### Step 3: Restart Your Bot

After clearing the database:

1. Restart the bot engine
2. Visit the dashboard pairing page
3. Scan the QR code with your WhatsApp
4. Configure settings from scratch

### Step 4: Verify Fresh State

Check that:
- New bot configuration created in database
- WhatsApp session established
- Dashboard accessible
- All features working

## Deployment Updates

### For Vercel Production

Update Vercel environment variables:

1. Go to Vercel Dashboard > Project Settings > Environment Variables
2. Update **ENGINE_URL** (all environments):
   ```
   https://whatsapp-bot-production-8cc0.up.railway.app
   ```
3. Redeploy the project

### For Railway Engine

Verify Railway deployment:

```bash
# Test connection
curl https://whatsapp-bot-production-8cc0.up.railway.app/health

# Should return 200 OK
```

## Troubleshooting

### Still Getting URL Error

1. Clear browser cache
2. Redeploy Vercel project
3. Verify ENGINE_URL has `https://`
4. Check Railway deployment status

### MongoDB Connection Failed

1. Verify connection string in `.env.development.local`
2. Check MongoDB Atlas IP whitelist
3. Ensure database exists (Hostify)

### Pairing QR Code Not Showing

1. Clear database: `node scripts/clear-mongo-db.mjs`
2. Restart bot engine
3. Visit pairing page in fresh browser tab
4. Wait 5 seconds for QR to generate

## Database Schema After Fresh Start

### Collections Created

```
Database: Hostify

Collections:
  - bots
    └── Stores: bot configuration, settings, status
  
  - auth_state
    └── Stores: WhatsApp session credentials
```

### Initial State

When starting fresh:
- 0 bots configured
- 0 active sessions
- All features: OFF by default
- Default prefix: `.`
- Status: `pairing`

## Next Steps

After starting fresh:

1. **Configure Bot Settings**
   - Set bot name and identity
   - Enable desired features
   - Configure command prefix

2. **Enable Pro Features**
   - Access Pro Dashboard
   - Enable Suno Music
   - Enable Image Generation
   - Configure AI features

3. **Setup Groups**
   - Link WhatsApp groups
   - Configure group settings
   - Enable protection features

4. **Test Commands**
   - Try basic commands (`.menu`, `.ping`)
   - Test pro features
   - Verify all working

## Important Notes

⚠️ **Data Loss**: Running the cleanup script will permanently delete all sessions and configurations. Make sure you want a fresh start before running.

✅ **Safe to Run**: The script only affects MongoDB data, not your code or configuration files.

✅ **Reversible**: You can reconfigure everything from the dashboard after clearing.

## Support

If issues persist after following this guide:

1. Check Vercel build logs
2. Verify environment variables in Vercel Settings
3. Check Railway deployment health
4. Review browser console for errors
5. Check MongoDB Atlas connection logs
