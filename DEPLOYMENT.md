# Free cloud deployment

Prepared on 5 October 2026. This is configuration ready for deployment; no public server has been deployed yet.

## Selected route

Render Free Web Service + Turso Free libSQL database + E2B sandbox credits.

Render runs the lightweight API with HTTPS. Turso stores sessions, workspace IDs, chats and job logs persistently. E2B runs the Ubuntu agent workspace. Render's local disk is ephemeral, so do not deploy this app there without the remote database variables.

Render Free sleeps after 15 minutes without inbound traffic. Reopening the app can take approximately a minute to wake the server. Free services have quotas and can be suspended when exceeded. This is suitable for a personal prototype, not guaranteed always-on hosting. No paid Render disk or paid database is needed for this route. E2B remains a metered service with one-time trial credits; hosting the coordinator for free does not make agent computers free indefinitely. Build the custom Ubuntu 24.04 template with `python e2b_template.py` before using the desktop.

Oracle Always Free VMs were considered, but Oracle excludes prepaid cards from normal signup verification. The user's available card is prepaid. Koyeb requires card verification. Hugging Face's current docs say creating new compute Spaces requires a paid subscription. We therefore prepared Render/Turso rather than promising a no-card, permanently free dedicated VM.

## Accounts required

1. Render: sign up at https://dashboard.render.com/register using your own Google account or email.
2. Turso: sign up at https://turso.tech and create a **libSQL** database, named `aethervm`. Copy its database URL and database access token. This driver is for libSQL, not the newer Turso database engine.
3. A source Git repository. Render can build a public Git repository URL without a linked Git provider. A private repository requires authorizing the Git provider. The source includes no E2B key, OAuth client secret or database credentials.

Once authorized access to these accounts is available, the remaining deployment can be automated.

## Render settings

The repository-root `render.yaml` is a Blueprint for the exact service. Alternatively create a Web Service manually:

- Runtime: Docker
- Plan: Free
- Region: Frankfurt
- Docker context: `backend`
- Dockerfile: `backend/Dockerfile`
- Health check: `/health`
- One process / one instance

Set environment variables:

| Variable | Value |
| --- | --- |
| GOOGLE_WEB_CLIENT_ID | `636307355753-srlt103so2e3d1encolqo0nq1tjrtk2v.apps.googleusercontent.com` |
| ALLOWED_GOOGLE_EMAILS | `inetixus@gmail.com` |
| DEV_AUTH | `false` |
| SANDBOX_PROVIDER | `e2b` |
| E2B_TEMPLATE | `aethervm-ubuntu-24-04-e2b-v1` |
| E2B_API_KEY | Your private E2B key, entered only as a server secret |
| TURSO_DATABASE_URL | Your libSQL database URL |
| TURSO_AUTH_TOKEN | Your private database token, entered only as a server secret |

After deployment, verify `/health`, enter the Render HTTPS URL in the Android app's Settings, save, and sign in with Google. Your email must also be on Google's OAuth test-user list. Gemini key entry is done in the Android app and is never built into the APK.

## Android certificate

The native Android project uses the supplied debug certificate:

- Package: `com.aethervm.app`
- SHA-1: `ED:7A:D7:76:69:A5:36:12:40:D1:26:DB:A8:91:AA:8E:45:CF:7B:B3`
- Web OAuth client: configured in `.env.example`

The preview release variant is signed with this debug certificate, so it can be installed without running Metro. This is a personal sideload build. Create a private production certificate and register its different SHA-1 before public distribution.

Sources:
https://render.com/docs/free
https://render.com/docs/blueprint-spec
https://turso.tech/pricing
https://docs.turso.tech/sdk/python/quickstart
https://www.oracle.com/middleeast/cloud/free/faq/
https://huggingface.co/docs/hub/main/en/spaces-overview
