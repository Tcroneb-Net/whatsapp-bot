# Pro AI Features Guide - WhatsApp Bot

## 🎵 Suno v4 Pro Music Generation

### Overview
Generate professional-quality AI music using Suno v4 Pro API powered by Omegatech.

### How It Works
1. User sends `.suno` command with music description
2. Bot asks for song title and tags
3. Omegatech Suno v4 generates 2 high-quality tracks
4. Bot sends audio files + album art + metadata
5. Includes video if available

### Command Usage
```
.suno <your music prompt>
```

### Examples
```
.suno upbeat 80s synthwave with neon vibes
.suno sad piano ballad about lost love  
.suno hiphop rap track with fire beat
.suno orchestral epic fantasy theme music
```

### Features
- ✅ Multiple tracks generation (typically 2+ per prompt)
- ✅ High-quality audio output
- ✅ Album artwork included
- ✅ Video support (if available)
- ✅ Custom title and tags support
- ✅ Model version info (foxaihub, etc)

### Response Format
```
🎵 Track 1/2
Title: War
Tags: Shadow studio, Electronic
Duration: Auto-calculated
Audio URL: https://ai-sunora.fortun3r.app/...
Image: Album art included
```

### Tips for Best Results
- Be descriptive about genre (electronic, rock, hip-hop, etc)
- Include mood (upbeat, sad, energetic, calm, etc)
- Mention instruments if you want (piano, synth, drums, etc)
- Specify tempo if desired (upbeat, slow, moderate, etc)
- Example: "fast-paced electronic dance music with heavy bass and synthetic vocals"

---

## 🎨 Pro Image Generation

### Two Premium Models Available

#### 1. Omegatech Nano Banana Pro (Default)
- **Command:** `.img <prompt>`
- **Quality:** Excellent realistic images
- **Speed:** Fast generation (30-60 seconds)
- **Best For:** Realistic photos, detailed scenes, photo-realistic art

#### 2. Luminux XGold (Premium)
- **Command:** `.img <prompt> --luminux`
- **Quality:** Ultra-high quality, best for art
- **Speed:** May take longer
- **Best For:** Anime, fantasy art, illustrations, creative designs

### How It Works
1. User sends `.img` command with description
2. Bot validates prompt
3. Sends to selected API (Nano Banana or Luminux)
4. Generates high-quality image
5. Downloads and sends to WhatsApp
6. Includes captions with model info

### Command Usage
```
# Default (Omegatech Nano Banana Pro)
.img <your prompt>
.image <your prompt>
.flux <your prompt>

# Premium (Luminux XGold)
.img <your prompt> --luminux
```

### Examples - Nano Banana Pro
```
.img cyberpunk city with neon lights, realistic style
.img beautiful sunset over mountain lake, ultra HD
.img futuristic robot in laboratory, detailed
.img person in space suit on alien planet, photorealistic
```

### Examples - Luminux XGold
```
.img anime girl with blue eyes in spring --luminux
.img fantasy castle on floating island --luminux
.img detailed manga character portrait --luminux
.img steampunk airship with detailed machinery --luminux
```

### Features
- ✅ Dual model selection
- ✅ High-resolution output
- ✅ Automatic image download
- ✅ Captions with model info
- ✅ Model comparison capability
- ✅ Credit attribution

### Response Format
```
✨ AI Generated Image

📝 Prompt: cyberpunk city with neon lights
🤖 Model: Luminux XGold / Omegatech Nano Banana Pro

[High-quality image attached]
```

### Quality Comparison

| Feature | Nano Banana Pro | Luminux XGold |
|---------|-----------------|---------------|
| Speed | ⚡⚡⚡ Fast | ⚡⚡ Medium |
| Realism | ⭐⭐⭐⭐ High | ⭐⭐⭐⭐⭐ Ultra |
| Anime/Art | ⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Excellent |
| Fantasy | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Excellent |
| Photos | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐ Good |
| Price | Free | Free |

### Tips for Best Results
- Be specific with style (realistic, anime, digital art, oil painting, etc)
- Include art style words (ultra HD, 4K, detailed, intricate, etc)
- Mention lighting (bright, dramatic shadows, golden hour, etc)
- Use composition tips (close-up, wide angle, cinematic, etc)
- Example: "anime girl with long silver hair, detailed eyes, sitting in magical forest clearing, soft magical glow, ultra detailed, 4K"

---

## 🔌 API Endpoints

### Music Generation
```
POST /api/ai/suno
GET /api/ai/suno?prompt=<prompt>&title=<title>&tags=<tags>

Response:
{
  "statusCode": 200,
  "success": true,
  "data": {
    "prompt": "...",
    "title": "...",
    "tags": "...",
    "tracks": [
      {
        "title": "Track Title",
        "audioUrl": "https://...",
        "imageUrl": "https://...",
        "videoUrl": "https://..." (optional),
        "modelVersion": "foxaihub"
      }
    ]
  }
}
```

### Image Generation
```
POST /api/ai/image
GET /api/ai/image?prompt=<prompt>&luminux=false

Response:
{
  "statusCode": 200,
  "success": true,
  "model": "Nano Banana Pro" or "Luminux XGold",
  "prompt": "revised prompt",
  "image": "https://image-url.png",
  "timestamp": "2026-07-11T15:31:11.664Z"
}
```

---

## 🌐 Environment Configuration

Required environment variables:
```env
ENGINE_URL=https://whatsbot.hostify.co.zw
SUNO_API_URL=https://api.omegatech.app/api/ai/sonu4
IMAGE_AI_API_URL=https://api.omegatech.app/api/ai/nano-banana-pro
LUMINUX_API_URL=https://luminux-models.netlify.app/image
```

---

## ⚡ Performance & Limits

### Suno Music Generation
- **Generation Time:** 30-120 seconds
- **Timeout:** 180 seconds
- **Tracks per Request:** 2-4 typically
- **File Sizes:** 5-15 MB per track
- **Rate Limit:** Recommended 1 request per minute

### Image Generation
- **Nano Banana Pro:** 30-60 seconds
- **Luminux XGold:** 45-90 seconds
- **Timeout:** 180 seconds
- **File Size:** 2-8 MB
- **Rate Limit:** Recommended 1 request per minute

---

## 🎯 Best Practices

### Music Generation
1. Use descriptive genre names
2. Include mood/emotion keywords
3. Mention specific instruments
4. Keep prompts under 500 characters
5. Avoid requesting copyrighted material
6. Wait for completion before requesting another

### Image Generation
1. Start simple and refine
2. Use style keywords (anime, realistic, oil painting, etc)
3. Include quality descriptors (HD, 4K, detailed, etc)
4. Specify composition (close-up, wide angle, cinematic, etc)
5. Mention lighting conditions
6. Don't request copyrighted characters (except generic usage)

---

## 🔗 External Resources

- **Suno AI:** https://www.suno.ai/
- **Omegatech:** https://omegatech.app/
- **Luminux:** https://luminux-models.netlify.app/

---

## 🐛 Troubleshooting

### Music Won't Generate
- Check internet connection
- Try simpler prompt
- Wait 30 seconds and retry
- Verify ENGINE_URL is configured

### Image Generation Fails
- Verify LUMINUX_API_URL is set
- Try different prompt style
- Clear browser cache
- Check image size (may be large)

### Slow Generation
- Image AI takes 30-120 seconds - be patient
- Music generation is more resource intensive
- Peak times may be slower
- Check your internet speed

---

## 💡 Coming Soon

- [ ] Voice-to-Music (convert voice prompt to music)
- [ ] Image Variation (generate variations of existing images)
- [ ] Style Transfer (apply art style to photos)
- [ ] Batch Generation (multiple images at once)
- [ ] Custom Model Selection

---

**Powered by:**
- 🎵 Suno v4 Pro (Omegatech)
- 🎨 Nano Banana Pro & Luminux XGold
- 💬 WhatsApp Bot by Hostify

**Last Updated:** July 11, 2026
