# AetherVM

Android AI workspace app: React Native/Expo client + Python/FastAPI backend. Gemini uses real function calls to execute commands, write/read files, and browse with Playwright in isolated Linux sandboxes. No simulated task results.

## Status

The 0.2.0 Android preview uses persistent agent profiles, separate conversations, a dedicated computer surface, files, terminal, skills and secure Gemini configuration. The personal backend is deployed at `https://aethervm-api.onrender.com` on Render Free with Turso persistence. GitHub Actions builds the ARM64 preview APK; download `AetherVM-preview-apk` from the latest successful run for the mobile changes, extract it and install `app-release.apk` over the existing preview.

This remains a personal preview. Profiles share the account's existing Daytona computer. Scheduled automation and parallel agents are not implemented. See `VALIDATION.md` for checks and remaining live-device verification.

## 1. Configure Google login

Create a Google Cloud project, configure the OAuth consent screen and add yourself as a test user if the app is in testing. Create a **Web OAuth client** (its ID is the server audience), and an **Android OAuth client** with package `com.aethervm.app` and the SHA-1 fingerprint of your APK signing certificate. Set the same Web client ID in backend `GOOGLE_WEB_CLIENT_ID` and mobile `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. The native Google sign-in module requires a development build or APK; it does not work in Expo Go. Do not put OAuth secrets or Daytona keys in `EXPO_PUBLIC_*` variables.

## 2. Start the backend

Python 3.11+ recommended. From `backend/`:

```bash
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows PowerShell instead: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
# Windows instead: Copy-Item .env.example .env
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Use one API process: the task executor and cancellation flags are process-local. SQLite or configured Turso libSQL persists accounts' workspace mappings, profiles, memory, skills, messages and task traces. Restarted jobs become interrupted. Put the service behind HTTPS (a reverse proxy or a tunnel); Android app intentionally requires an HTTPS URL. Keep the SQLite file private and backed up. Google sessions expire after seven days; sign out revokes the current session. Gemini keys are kept in Android SecureStore and transient backend memory, not SQLite. Prompts, tool arguments and command output are saved in SQLite, so do not place secrets in task text.

### Daytona (default)

Create an account at https://app.daytona.io and generate an API key. Set `DAYTONA_API_KEY`, `DAYTONA_API_URL=https://app.daytona.io/api`, `SANDBOX_PROVIDER=daytona` in backend `.env`. Each account receives its own sandbox, with a 5-minute idle auto-stop. Stopped sandbox disk may still incur charges. Use the app's Put computer to sleep button to stop compute after a task. The standard Daytona image includes the desktop dependencies. Custom `DAYTONA_SNAPSHOT` images must provide those dependencies. The separate headless browse tool may require Playwright and Chromium installation. Provider snapshot permissions determine whether system packages can be installed.

Daytona manages independent sandboxes; this app does not claim that Daytona splits a single rented VM into unlimited free workspaces.

### Self-hosted Docker (no cloud subscription)

On your own Linux computer/VM with Docker installed:

```bash
cd backend
docker build -f Dockerfile.sandbox -t aethervm-sandbox:local .
```

Set `SANDBOX_PROVIDER=docker` in `.env`, then run the API on the Docker host. Each Google account gets a separate container and persistent named volume, using up to 1 CPU and 1 GiB RAM. The image includes Chromium/Playwright, Python, Node, npm, curl and git. Containers can install packages; they cannot access the Docker socket or mounted host directories. The API needs Docker access; never grant it to the agent container. Manually stop unused containers or use the app's stop control. Files survive container stops.

For a personal prototype, Docker shares one machine economically. Ordinary containers share the host kernel and are not a strong boundary for arbitrary hostile public tenants. Before offering public access, use hardened isolation, network policy blocking private/metadata destinations, tenant quotas, rate limiting and a proper queued job service. This version is intended for trusted personal use.

## 3. Run / build Android

From `mobile/`:

```bash
cp .env.example .env
# Set EXPO_PUBLIC_API_URL and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
npm ci
npx expo run:android
```

Local builds require Android Studio/SDK and Java. For an installable preview APK using Expo's build service:

```bash
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

EAS needs your Expo account and available build quota. When Google Android OAuth asks for SHA-1, use the signing certificate of the resulting build (EAS credentials or your local debug certificate). Rebuild after changing public environment variables. Install the APK, open Settings, enter the HTTPS backend address and Gemini key, save, then sign in with Google. Pick a Gemini model available to your API key by entering its model ID; the default is `gemini-2.5-flash`.

## App features

- Restrained dark interface with a persistent agent roster, focused conversation and dedicated Computer surface on mobile. Wider screens show a fixed roster and optional computer panel.
- Create and edit named agents with roles, instructions, avatars and persistent memory. Each agent has separate conversations and task history; the account shares one computer.
- Google identity verified on the server; ownership checked on every private endpoint.
- Markdown responses, copyable code, concise activity cards, expandable technical details, and explicit waiting/error/cancelled states.
- Daytona desktop screenshots, visible browser launch, mouse/keyboard actions, and exclusive manual/agent control. A disconnected manual-control lease expires automatically.
- Navigate workspace folders, preview and export files, and attach files up to 4 MB. Bounded terminal commands expose real output and exit status.
- Gemini key stored in Android SecureStore, connection testing and available-model selection. Keys remain transient on the backend, outside the database.
- Saved skills become agent instructions. Scheduled runs are clearly unavailable in this version.
- Restores server conversations and tasks after reopening the app. Free-host cold starts use a longer request timeout with readable errors.
- Stop requests take effect after the current bounded command or model request. Cancellation does not undo completed actions or necessarily stop background processes.
- Docker provides shell/files; the desktop viewer requires the Daytona provider.

## Free hosting research — checked 5 October 2026

| Option | Free provision | Practical limit |
| --- | --- | --- |
| Daytona | $200 trial compute credits; no card required for trial | Metered usage after credits, not permanently free |
| Oracle Cloud Always Free | Eligible compute instances; shape/resource limits apply | Regional capacity can be unavailable; idle instances can be reclaimed; account verification needed |
| Google Cloud Free Tier | One e2-micro equivalent within eligible regions, 30 GB standard disk and limited outbound data | Very small for Chromium or multiple workspaces; billing account and strict eligible quotas; additional network resources can cost |
| Your own Linux machine + Docker | No cloud hosting fee | Your machine must stay on; electricity, internet and hardware still apply |

For a permanent no-subscription personal setup, use your own Linux machine. For a cloud trial, Daytona is already integrated. No provider guarantees unlimited always-on Linux computers completely free. An Oracle free VM can host the Docker provider if you obtain capacity and meet the account requirements.

Sources: https://www.daytona.io/pricing · https://www.daytona.io/docs/billing · https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm · https://cloud.google.com/free · https://docs.cloud.google.com/free/docs/free-cloud-features

## Checks

```bash
# project root
pip install pytest httpx
python -m pytest -q
cd mobile
npm run typecheck
npx expo export --platform android
```

Do not enable `DEV_AUTH=true` on an accessible server. It is a local test-only authentication bypass, disabled by default.

## Prepared free-cloud deployment

See `DEPLOYMENT.md` for the selected Render Free + Turso Free libSQL route. `render.yaml` defines the service. The API supports `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` for durable remote storage on ephemeral hosts, and `ALLOWED_GOOGLE_EMAILS` restricts the personal deployment. Current examples contain the configured public Google Web client ID; no private provider credentials are shipped.

The native `mobile/android` project is now included. Its preview release variant uses the debug certificate matching the SHA-1 you registered. `.github/workflows/android.yml` can build an ARM64 sideload APK in GitHub Actions. The backend URL can be entered in the installed app's Settings; it does not need to be known at build time. The workflow has produced preview APKs on your GitHub account. The signing fingerprint remains unchanged in 0.2.0.
