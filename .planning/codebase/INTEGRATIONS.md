# External Integrations

**Analysis Date:** 2026-01-22

## APIs & External Services

**Transcription:**
- Voice Sogni AI - Speech-to-text transcription service
  - Endpoint: `https://voice.sogni.ai/transcribe`
  - SDK/Client: Native fetch API
  - Implementation: `client/src/services/transcription.ts`
  - Input: Audio blob (WebM format) + timestamps parameter
  - Output: JSON with success status, transcript, and timestamp segments
  - Auth: None detected (public endpoint or API key in environment)

**Maps & Geolocation:**
- Google Maps API - Map visualization and location services
  - SDK/Client: Google Maps JavaScript API
  - Auth: `VITE_FRONTEND_FORGE_API_KEY` environment variable
  - Libraries loaded: marker, places, geocoding, geometry, routes
  - Implementation: `client/src/components/Map.tsx`
  - Proxy URL: Routed through `VITE_FRONTEND_FORGE_API_URL` (defaults to `https://forge.butterfly-effect.dev/v1/maps/proxy`)
  - Script injection: Dynamic script loading via `script` tag

**OAuth / Authentication Portal:**
- Custom OAuth Provider - Application authentication
  - Portal URL: `VITE_OAUTH_PORTAL_URL` environment variable
  - App ID: `VITE_OAUTH_PORTAL_APP_ID` environment variable
  - Callback URL: `{window.location.origin}/api/oauth/callback`
  - Implementation: `client/src/const.ts` (getLoginUrl function)
  - State encoding: Base64 encoded redirect URI

**Forge API:**
- Butterfly Effect Forge - Maps proxy service
  - Base URL: `VITE_FRONTEND_FORGE_API_URL` (default: `https://forge.butterfly-effect.dev`)
  - Purpose: Proxies Google Maps API requests
  - Auth: API key in `VITE_FRONTEND_FORGE_API_KEY`
  - Endpoint: `/v1/maps/proxy`

## Data Storage

**Databases:**
- IndexedDB (browser-native)
  - Database name: `voice-cards-db`
  - Version: 1
  - Client: `idb` package (v8.0.3)
  - Implementation: `client/src/services/db.ts`
  - Stores:
    - `project` - Project metadata (singleton pattern)
    - `cards` - Card objects with keyPath 'id'
    - `audio` - Audio blobs with keyPath 'cardId'
    - `settings` - User settings (singleton pattern)

**File Storage:**
- Local filesystem (browser local only)
  - Audio files: Stored as Blob in IndexedDB
  - Export format: ZIP files with metadata JSON
  - Import: ZIP file processing with jszip (v3.10.1)
  - Implementation: `client/src/services/exportProject.ts`, `client/src/services/importProject.ts`

**No cloud storage detected** - All data remains local to browser/IndexedDB

## Authentication & Identity

**Auth Provider:**
- Custom OAuth Portal (remote)
  - Implementation: OAuth 2.0 authorization code flow
  - Endpoint: `{VITE_OAUTH_PORTAL_URL}/app-auth`
  - Redirect URI: Application-relative callback URL
  - State parameter: Base64 encoded for verification
  - Session management: Cookie-based (COOKIE_NAME from shared constants)

**Session Handling:**
- Cookie: `app_session_id` (from `shared/const.ts`)
- Expiry: 1 year (ONE_YEAR_MS constant)
- Server: Express middleware for static serving (no auth logic in analyzed code)

## Browser APIs & Native Integration

**Audio Capture:**
- MediaRecorder API - Audio recording from microphone
  - Supported format: WebM
  - Implementation: `client/src/hooks/useRecorder.ts`
  - Device selection: Via localStorage preference key `voiceCards_selectedMicrophone`

**Audio Processing:**
- Web Audio API - Audio analysis and duration detection
  - Usage: Analyser node for waveform visualization
  - Duration detection: Primary via Web Audio API with HTMLAudioElement fallback
  - Implementation: `client/src/services/audioUtils.ts`

**Media Devices:**
- Navigator.mediaDevices API - Microphone enumeration and access
  - Permissions: Requires user grant for audio input
  - Device change events: Monitored for dynamic device updates
  - Implementation: `client/src/components/MicrophoneSetup.tsx`

**Local Storage:**
- localStorage - Persistent browser storage
  - Usage: Theme preference, microphone device ID
  - Keys:
    - `theme` - Light/dark mode preference
    - `voiceCards_selectedMicrophone` - Last used microphone device ID
  - Implementation: Multiple components and hooks

## Monitoring & Observability

**Error Tracking:**
- None detected - No Sentry, LogRocket, or similar

**Logs:**
- Browser console only (console.log, console.error)
- No centralized logging service

**Debugging:**
- Vite JSX location tracking (dev only via @builder.io/vite-plugin-jsx-loc)

## CI/CD & Deployment

**Hosting:**
- Self-hosted (Node.js + Express server)
- Static file serving from `dist/public/`
- Production entrypoint: `dist/index.js`

**CI Pipeline:**
- None detected in package.json (no GitHub Actions, CircleCI, etc.)

**Build Process:**
```bash
pnpm build  # Runs: vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
pnpm dev    # Runs: vite --host
pnpm start  # NODE_ENV=production node dist/index.js
```

## Webhooks & Callbacks

**Incoming:**
- OAuth callback endpoint: `/api/oauth/callback` (expected but not implemented in analyzed server code)
- No other webhook endpoints detected

**Outgoing:**
- None detected - No webhook triggers or external notifications

## Environment Configuration

**Required env vars:**
- `VITE_OAUTH_PORTAL_URL` - OAuth provider portal URL
- `VITE_APP_ID` - Application ID for OAuth registration
- `VITE_FRONTEND_FORGE_API_KEY` - Google Maps API key via Forge
- `VITE_FRONTEND_FORGE_API_URL` - Forge API base URL (optional, defaults to https://forge.butterfly-effect.dev)
- `NODE_ENV` - Environment mode (development/production)
- `PORT` - Server port (optional, defaults to 3000)

**Optional env vars:**
- None explicitly optional, but Forge URL has sensible default

**Secrets location:**
- Environment variables should be stored in `.env` file (not committed to git)
- OAuth app credentials and API keys require secure management

## Data Flow Summary

**Audio Recording Flow:**
1. User selects microphone via `MicrophoneSetup` component
2. `useRecorder` hook uses MediaRecorder API to capture audio
3. Audio processed with Web Audio API for waveform visualization
4. Recorded Blob stored in IndexedDB via `saveAudio()` in `db.ts`

**Transcription Flow:**
1. User initiates transcription on a recorded card
2. Audio Blob sent to `https://voice.sogni.ai/transcribe` via POST
3. Response includes timestamp segments with text
4. Segments stored in Card's `transcript` field in IndexedDB

**Maps Integration Flow:**
1. `MapView` component dynamically loads Google Maps script
2. Script URL constructed via Forge proxy with API key
3. Markers, geocoding, and directions handled via Google Maps libraries
4. All requests proxied through `VITE_FRONTEND_FORGE_API_URL`

**Export/Import Flow:**
1. Export: All IndexedDB data serialized and packaged as ZIP
2. ZIP includes: project.json, card metadata, audio files
3. Import: ZIP parsed, contents restored to IndexedDB
4. No server-side processing

## Third-Party Service Reliability

**Critical Dependencies:**
- Transcription service (voice.sogni.ai) - Required for transcription feature
- Google Maps API (via Forge) - Required for map visualization
- OAuth Portal - Required for authentication

**Fallbacks:**
- Maps: None (script failure logs to console)
- Transcription: None (API errors propagate to user)
- Audio: Multiple fallback mechanisms in `audioUtils.ts` for duration detection

---

*Integration audit: 2026-01-22*
