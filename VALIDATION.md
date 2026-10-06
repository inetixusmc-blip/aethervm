# AetherVM 0.4 validation — 6 October 2026

## Completed locally

- 22 API tests pass, including auth, account/agent ownership, tool history and
  Gemini signature/image responses, handoff pause, cancellation-related paths,
  screenshot compatibility, appearance persistence for all 18 shapes and legacy
  edits preserving appearance.
- Four mocked agent jobs enter their independent workspaces simultaneously;
  the API responds while they are held, a fifth job returns 429, and another
  task on an already running agent returns 409. One workspace failure affects
  only that worker. Other workers complete successfully. Control leases are
  isolated per agent. This is not a live AWS resource/load measurement.
- TypeScript and Android Metro/Hermes bundle pass.
- Source versus bundled character comparison: 14 original runtime modules are
  byte-identical, 39 states, 18 shapes, 25 eye poses, 96-point head loops and
  48-point eye loops retained. 702 deterministic state/shape transitions match
  original geometry, eye/body transforms, task morphs and state snapshots.
- Interactive browser QA with native/provider/VM fixtures: actual character SVG
  renders; Home and agent navigation; creation with a different shape/material;
  Home task submission and live preview; all five onboarding screens with skipped
  Gemini setup; layouts at 360, 390 and landscape widths. No browser JS errors
  or settled-layout horizontal overflow in those scenarios. Browser Reduce Motion
  reaches the source engine; changing shape preserves the running engine and
  state; the focused creation input remains visible.

## Still require live verification

Native WebView rendering/performance on Android; real Google OAuth and Gemini
provider setup; real Daytona live desktop, manual handoff, uploads/downloads,
reconnect, reduced-motion system preference and keyboard behavior on Android.
Browser fixtures do not prove these live integrations.

EC2 port 22 returns `Network is unreachable` from this session. No server
packages, services, TLS, security groups or external AWS flow were changed or
verified. The existing backend is retained. See `deploy/aws/README.md` for the
concrete deployment/update/verification procedure.

Native APK status is recorded by the latest GitHub Actions run; do not infer
APK success from Metro compilation alone.
