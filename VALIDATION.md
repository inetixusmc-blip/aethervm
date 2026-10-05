# Validation — 5 October 2026, version 0.2.0

## Completed

- 15 backend pytest checks pass, covering authentication/revocation, account and agent ownership, input validation, shell quoting, a mocked Gemini tool loop, libSQL adapter behavior, account allowlisting, per-agent history/memory/skills, exclusive computer control, read-only status, workspace path validation, screenshot dimensions and waiting status for human handoffs.
- Strict TypeScript typecheck passes.
- Final Android Hermes production export passes: 822 modules, 2.34 MB bundle.
- The final native Android build passed in GitHub Actions run 37362936734: Gradle BUILD SUCCESSFUL in 9m 52s. AetherVM-preview-apk uploaded successfully (12,372,312-byte ZIP, artifact 11368330240). This APK includes the final layout/handoff UI refinements from eda45c9.
- Render reports the persistent-agent backend commit live. The handoff-status correction is live from af96659. The enforced immediate handoff pause is live from 8d3c8b7, preventing subsequent model/tool calls until the user responds.
- Static document rendering of the actual React Native Web component tree was visually inspected at 360/390 px phone widths, 834 px tablet width and 1366/1920/2560 px desktop widths. These are approximate layout checks, not native screenshots. The sidebar flex sizing was corrected.
- Package remains `com.aethervm.app`, version code 2. Preview certificate SHA-1 remains `ED:7A:D7:76:69:A5:36:12:40:D1:26:DB:A8:91:AA:8E:45:CF:7B:B3`.
- The user previously confirmed Google login and backend connectivity worked in the earlier installed preview.

## Still requires a real device / live providers

- Install the final APK and verify keyboard behavior, file picker/export, Google login, screen touch coordinates and long-chat scrolling on Android.
- Run a real Gemini task using the user's key and verify Daytona desktop tools end to end. The current runtime could not resolve app.daytona.io, so the new live desktop integration was not tested from this environment.
- Static chat rendering exceeded the document renderer's layout limits; long chat therefore has typecheck/bundle coverage but no complete static visual review.
- No Android emulator is available in the workspace. Automated backend tests use provider mocks and do not establish live Gemini/Daytona behavior.

## Preview boundaries

One API process is required; task executor, cancellation flags and manual-control leases are process-local. Restarted active jobs become interrupted. Agents share one computer per account, scheduled automations and parallel agents are unavailable, terminal commands are noninteractive, and attachments/exports are limited to 4 MB. Render Free can cold-start slowly. Daytona usage is metered and is not a permanently free unlimited VM service.

No private Daytona key, OAuth client secret, backend .env or remote database token is included in the repository. The debug signing key is for personal preview builds; replace it before production distribution.
