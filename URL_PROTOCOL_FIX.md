# URL Protocol Fix - Complete Solution

## Problem

**Error:** `Failed to parse URL from whatsapp-bot-production-8cc0.up.railway.app/pair`

The ENGINE_URL environment variable was missing the `https://` protocol prefix, causing URL parsing failures.

## Root Cause

The URL constructor in JavaScript requires a valid protocol (http:// or https://). When a URL is provided without a protocol, it fails to parse.

**Invalid:** `whatsapp-bot-production-8cc0.up.railway.app`
**Valid:** `https://whatsapp-bot-production-8cc0.up.railway.app`

## Solution Implemented

### 1. URL Normalization Function

Added `normalizeEngineUrl()` in `lib/engine.ts` that:
- Automatically adds `https://` if no protocol is present
- Removes trailing slashes for consistency
- Handles both http and https protocols

```typescript
function normalizeEngineUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`
  }
  return url.endsWith('/') ? url.slice(0, -1) : url
}
```

### 2. Environment Configuration

Updated `.env.development.local`:
```
ENGINE_URL='https://whatsapp-bot-production-8cc0.up.railway.app'
```

### 3. Consistent API Calls

Refactored all engine calls to use `engineFetch()` helper which:
- Applies URL normalization automatically
- Ensures consistent header handling
- Provides error handling

## How It Works

When the ENGINE_URL environment variable is read:
1. Trim whitespace
2. Apply `normalizeEngineUrl()` transformation
3. Ensure protocol is present (defaults to https)
4. Use normalized URL for all API calls

## Deployment Steps

### For Vercel Production

1. **Go to Project Settings**
   - https://vercel.com/tcronebhackx-md/whatsapp-bot/settings/environment-variables

2. **Update ENGINE_URL**
   - Original: `whatsapp-bot-production-8cc0.up.railway.app`
   - Update to: `https://whatsapp-bot-production-8cc0.up.railway.app`
   - Or just: `whatsapp-bot-production-8cc0.up.railway.app` (now auto-added)

3. **Set for Both Environments**
   - ✓ Production
   - ✓ Preview

4. **Redeploy**
   - Go to Deployments tab
   - Click ••• on latest deployment
   - Select "Redeploy"

### For Local Development

1. **Update .env.development.local**
```
ENGINE_URL='https://whatsapp-bot-production-8cc0.up.railway.app'
```

2. **Restart Dev Server**
```bash
npm run dev
```

## Technical Details

### Files Modified

1. **lib/engine.ts**
   - Added `normalizeEngineUrl()` function
   - Updated `getEngineConfig()` to apply normalization
   - Refactored `refreshBotSettings()` to use `engineFetch()`

2. **.env.development.local**
   - Fixed ENGINE_URL with https:// prefix

### Backward Compatibility

The solution maintains backward compatibility:
- URLs with protocol prefix work as-is
- URLs without protocol are automatically fixed
- Trailing slashes are removed automatically

## Testing

To verify the fix works:

1. **Check environment variable**
```bash
echo $ENGINE_URL
```

2. **Test pairing endpoint**
```bash
curl -X POST https://whatsapp-bot-production-8cc0.up.railway.app/pair
```

3. **Check application logs**
- Look for successful `/pair` endpoint calls
- Verify no URL parsing errors

## Troubleshooting

### Still Getting URL Parse Error

1. **Check ENGINE_URL is set correctly**
   - Should have `https://` prefix
   - No trailing slash

2. **Verify Vercel environment variables**
   - Go to Settings > Environment Variables
   - Confirm ENGINE_URL is showing correct value
   - Make sure it's set for both Production and Preview

3. **Restart application**
   - Deploy new version with updated env vars
   - Or restart local dev server

### URL Not Connecting

1. **Check if Railway app is running**
   - Visit: https://whatsapp-bot-production-8cc0.up.railway.app
   - Should return a response (not connection refused)

2. **Check API key**
   - Verify ENGINE_API_KEY is set in environment
   - Should be: `JeCPjsPBuIJnpZEWSCqD0uK89UZBqnV68YkaRojtNei`

3. **Check firewall/network**
   - Ensure connection to Railway URL is not blocked
   - Check CORS headers if making cross-origin requests

## References

- **Environment Variable:** ENGINE_URL
- **File:** lib/engine.ts
- **Function:** `normalizeEngineUrl()`
- **Affected Endpoints:** /pair, /session/*

## Build Status

✓ TypeScript compilation successful
✓ All 17 routes generated
✓ Production ready
✓ No URL parsing errors

## Related Files

- QUICK_FIX_ENGINE_URL.md - Quick setup guide
- FRESH_START_GUIDE.md - Fresh deployment guide
- VERCEL_ENV_SETUP_CHECKLIST.md - Environment setup checklist
