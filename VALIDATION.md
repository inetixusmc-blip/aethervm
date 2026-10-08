# AetherVM 0.4.3 validation — 8 October 2026

- 48 local backend tests passed, including no VM wake for a greeting, progress visible before a command finishes, separate final messages, interrupted-task progress preservation, and screenshot feedback after a desktop click.
- TypeScript passes. Original character data and animation runtime are unchanged.
- The CI UI suite checks compact short messages, separate live updates without duplicate restored messages, no automatic desktop start/screen polling in chat, bottom worker size/position, explicit Computer navigation, and message copy/edit. APK and browser QA results are recorded in the associated GitHub Actions run.
- Performance changes remove unconditional VM/desktop startup and unnecessary screenshot/model turns. These are architectural checks, not live Gemini or Daytona timing measurements.
- Real provider keys, native Android behavior, and AWS deployment require live verification.

## Previous release checks

# AetherVM 0.4.2 validation — 6 October 2026

## Completed locally

- 41 backend tests pass, including auth, account/agent ownership, tool history and
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
  Conversation task submission and live preview; all five onboarding screens with skipped
  Gemini setup; layouts at 360, 390 and landscape widths. No browser JS errors
  or settled-layout horizontal overflow in those scenarios. Browser Reduce Motion
  reaches the source engine; changing shape preserves the running engine and
  state; the focused creation input remains visible.

## Still require live verification

Native WebView rendering/performance on Android; real Google OAuth and Gemini
provider setup; real Daytona live desktop, manual handoff, uploads/downloads,
reconnect, reduced-motion system preference and keyboard behavior on Android.
Browser fixtures do not prove these live integrations. The 0.4.2 CI UI suite
also checks source bouncing geometry during startup, Google photo rendering,
minimal Home navigation and search. Its result is recorded by the build run.

The user deployed the backend on EC2 and verified HTTPS health, service startup
and certificate renewal. EC2 port 22 is unreachable from this execution
environment, so the latest source changes require the documented update command
in the user's existing SSH session. Live Gemini and app-terminal recovery remain
unverified. The previous Debian desktop was inspected earlier. The new Ubuntu 24.04 image, OS gate and preservation-first workspace migration are in 0.4.2; live Daytona migration remains unverified until deployment. See `deploy/aws/README.md` for the
concrete deployment/update/verification procedure.

Native APK status is recorded by the latest GitHub Actions run; do not infer
APK success from Metro compilation alone.

## 0.4.2 revision checks

41 backend tests pass locally, including recoverable assistant removal/restore,
active-task removal rejection, account-scoped atomic editing of the last user
turn, automatic model-listing without inference, specialist-model filtering,
Ubuntu release checking and avoiding restarts of running desktops. TypeScript
and all 702 original shape/state comparisons pass. CI checks the sidebar,
chat bubbles, copy/edit, remove/restore, immediate models and continuous source
character rendering during work, plus the Ubuntu image build and desktop smoke
test. CI outcomes are recorded by the actual build run. Native credentials and
computer requests in browser QA are fixtures.
