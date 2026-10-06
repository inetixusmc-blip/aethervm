# Validation — 6 October 2026, version 0.3.0

## Completed

- 20 backend pytest checks pass, covering authentication/revocation, account and agent ownership, input validation, shell quoting, a mocked Gemini tool loop, libSQL adapter behavior, account allowlisting, per-agent history/memory/skills, exclusive computer control, read-only status, workspace path validation, screenshot dimensions and waiting status for human handoffs.
- Strict TypeScript typecheck passes.
- Final Android Hermes production export passes: 825 modules, 2.36 MB bundle.
- Added regression coverage for parameterless screenshot-tool serialization, safe provider error classification, starting the live viewer while an agent holds the operation lock, one desktop start per task, and screenshot function-response ordering with thought signatures preserved.
- Added native-driver blink, wink, eye glance, head tilt, breathing and success reactions. Motion respects app settings, Android reduced-motion preferences and app background state. Native timing still needs real-device review.
- Added three onboarding screens, a key/model generation check, full-screen simplified agent creation and automatic desktop connection. The new onboarding layout was visually inspected using static rendering of the actual component tree at 360 and 390 px phone widths. The face picker uses explicit sizes to keep all six choices in one row on those widths. Static document rendering does not display native input placeholders.
- Native Android 0.3 build passed in GitHub Actions run 37415377409 for a0d68c6. Gradle reported BUILD SUCCESSFUL in 10m 28s. The 11.8 MB AetherVM-preview-apk artifact uploaded successfully (ID 11391275926, ZIP size 12,379,688 bytes, SHA-256 12ce860a45073451dd840c512067b9a7780f0a3d731ff7931f7e273acbb86360). Install this build for the final face-picker and live connection feedback refinements.
- Gemini/desktop backend corrections were published in a532846. Live Render deployment verification is unavailable: Google sign-in returned a gateway error and the subsequent service check was blocked by browser policy. Auto-deployment is configured, but the new revision has not been confirmed live.
- Static document rendering of the actual React Native Web component tree was visually inspected at 360/390 px phone widths, 834 px tablet width and 1366/1920/2560 px desktop widths. These are approximate layout checks, not native screenshots. The sidebar flex sizing was corrected.
- Package remains `com.aethervm.app`, version code 3. Preview certificate SHA-1 remains `ED:7A:D7:76:69:A5:36:12:40:D1:26:DB:A8:91:AA:8E:45:CF:7B:B3`.
- The user previously confirmed Google login and backend connectivity worked in the earlier installed preview.

## Still requires a real device / live providers

- Install the final APK and verify keyboard behavior, file picker/export, Google login, screen touch coordinates and long-chat scrolling on Android.
- The exact cause of the user's earlier generic ClientError is unconfirmed. The parameterless tool schema was corrected, screenshot responses now precede their images and provider failure codes now map to actionable messages. Run a real Gemini task using the user's key and verify Daytona desktop tools end to end. The current runtime could not resolve app.daytona.io, so the new live desktop integration was not tested from this environment.
- Static chat rendering exceeded the document renderer's layout limits; long chat therefore has typecheck/bundle coverage but no complete static visual review.
- No Android emulator is available in the workspace. Automated backend tests use provider mocks and do not establish live Gemini/Daytona behavior.

## Preview boundaries

One API process is required; task executor, cancellation flags and manual-control leases are process-local. Restarted active jobs become interrupted. Agents share one computer per account, scheduled automations and parallel agents are unavailable, terminal commands are noninteractive, and attachments/exports are limited to 4 MB. Render Free can cold-start slowly. Daytona usage is metered and is not a permanently free unlimited VM service.

No private Daytona key, OAuth client secret, backend .env or remote database token is included in the repository. The debug signing key is for personal preview builds; replace it before production distribution.
