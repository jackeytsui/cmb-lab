# Phase 36: Pronunciation Scoring - User Setup

## Azure Speech Services Configuration

Pronunciation scoring requires Azure Speech Services credentials. Without these, the system gracefully falls back to n8n audio grading.

### Environment Variables

| Variable | Source | Required |
|----------|--------|----------|
| `AZURE_SPEECH_KEY` | Azure Portal -> Speech Services -> Keys and Endpoint -> Key 1 | Yes (for pronunciation scoring) |
| `AZURE_SPEECH_REGION` | Azure Portal -> Speech Services -> Keys and Endpoint -> Location/Region (e.g., `eastus`) | Yes (for pronunciation scoring) |

### Setup Steps

1. **Create a Speech Services resource in Azure Portal**
   - Go to [Azure Portal](https://portal.azure.com)
   - Click "Create a resource"
   - Search for "Speech"
   - Select "Speech" (Microsoft) and click "Create"
   - Choose a resource group, region, and pricing tier (F0 is free tier with 5 hours/month)
   - Click "Review + create" then "Create"

2. **Get your credentials**
   - After the resource is created, go to the resource page
   - Click "Keys and Endpoint" in the left sidebar
   - Copy "Key 1" and the "Location/Region" value

3. **Add to your environment**
   Add these to your `.env.local` file:
   ```
   AZURE_SPEECH_KEY=your_key_here
   AZURE_SPEECH_REGION=eastus
   ```

### Supported Regions

Any Azure region that supports Speech Services works. Common choices:
- `eastus` (US East)
- `westus2` (US West 2)
- `southeastasia` (Southeast Asia)
- `westeurope` (West Europe)

### Language Support

The pronunciation assessment supports:
- **zh-CN** (Mandarin Chinese) - used for "mandarin" and "both" exercises
- **zh-HK** (Cantonese) - used for "cantonese" exercises

### Verification

After adding credentials, test by:
1. Starting the dev server: `npm run dev`
2. Navigate to a practice set with an audio recording exercise
3. Record and submit audio
4. If Azure credentials are configured correctly, you should see:
   - An overall pronunciation score (0-100)
   - Per-character accuracy scores (in Plan 02 UI)

If credentials are missing or invalid, the system falls back to n8n audio grading silently (check server console for error messages).

### Pricing

- **Free tier (F0):** 5 hours of audio per month, 1 concurrent request
- **Standard tier (S0):** Pay-as-you-go, $1 per audio hour for speech-to-text
- Pronunciation assessment is included in speech-to-text pricing
- Each exercise recording is typically 5-15 seconds, so free tier is sufficient for development and small classes
