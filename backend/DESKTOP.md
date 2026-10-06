# Desktop appearance and Gemini recovery

This update adds an actual dark desktop theme inside each Daytona computer:
aubergine/orange PNG wallpaper, modern GTK controls, cleaner panels, readable
fonts and fewer default desktop icons. On the standard Debian/Ubuntu image it installs the official apt packages
`yaru-theme-gtk`, `yaru-theme-icon` and `arc-theme` once, then uses Yaru-dark,
Yaru icons and Arc-Dark window decorations. Already installed assets are reused.
Package installation has bounded timeouts; built-in Adwaita dark styling remains
available if repositories or privileges are unavailable.
Supported dark window decoration themes are selected when present.

The styling joins the running XFCE session's D-Bus. It backs up the original
XFCE configuration under `~/.local/share/aethervm/original-desktop-config` and
applies once per theme revision, preserving later user customization. Existing
agent disks receive the theme on the next desktop start; no computer is replaced
and no `/workspace` files are deleted. A styling failure leaves automation usable
and can retry on the next desktop start. Screen polling never applies settings.

This is a modern XFCE desktop, not a GNOME session or an OS upgrade. To require
Ubuntu 24.04 specifically, use a Daytona snapshot built from Ubuntu 24.04 with
Daytona's required XFCE/VNC stack, browser, Python and the Ubuntu Yaru packages.
Set `DAYTONA_SNAPSHOT` for newly provisioned computers. Existing computers keep
their image and data. Do not install a desktop on the AWS orchestration host.

Gemini generation retries HTTP 408/500/502/503/504 and transport failures up to
three attempts with bounded exponential backoff and jitter. Task events show
retry progress and final errors retain the safe HTTP code. Quota/access/schema
errors are not automatically retried. Only model requests are repeated: executed
shell/file/mouse actions are not replayed. Cancellation interrupts the retry wait.
No model is silently changed, and raw exception text/API keys are not persisted.

## Deploy to the existing AWS backend

Let current tasks finish, then run in the Ubuntu SSH session:

```bash
sudo bash /opt/aethervm/deploy/aws/update.sh
curl --fail https://16.16.124.235/health
```

Reopen the agent's Computer view. Install APK 0.4.1 for the new Home screen,
startup animation and Google profile photo; desktop changes run on the backend. Use Settings →
Google Gemini → Test connection, then retry a task. If a server error persists,
record its HTTP code and model name; an upstream outage cannot be repaired by
desktop styling or retries.

## Validation

35 backend tests pass locally, including transient error recovery after an
executed tool, a strict retry limit, cancellation, no retries on quota/access
errors, secret-safe final messages, PNG CRC/dimensions/decompression and desktop
availability when styling fails. A live existing Daytona container was inspected: Debian 13, XFCE 4.20.1.
Official Yaru/Arc packages installed successfully, a terminal wrote and read
`/workspace/AWSTEST.txt`, and desktop settings were exercised against the real
VNC monitor. The image includes obsolete monitor-only settings; the theme also
creates modern per-workspace paths using detected XRandR connector names.
App-to-backend terminal and real Gemini requests still require a live check
after AWS is updated. The direct Daytona terminal test does not prove the API
route works with the deployed SDK credentials.

The provider connection test separately probes model listing, a simple text
request and a request with computer tools, identifying the failing phase.
Manual terminal errors identify Daytona and never replay a command. Workspace
initialization now creates a writable `/workspace` before entering it.
