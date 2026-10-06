# Desktop appearance and Gemini recovery

This update adds an actual dark desktop theme inside each Daytona computer:
aubergine/orange PNG wallpaper, modern GTK controls, cleaner panels, readable
fonts and fewer default desktop icons. It uses Yaru-dark/Yaru if those Ubuntu
themes are installed, otherwise GTK's built-in Adwaita dark theme and icons.
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

Reopen the agent's Computer view. No Android rebuild is needed. Use Settings →
Google Gemini → Test connection, then retry a task. If a server error persists,
record its HTTP code and model name; an upstream outage cannot be repaired by
desktop styling or retries.

## Validation

32 backend tests pass locally, including transient error recovery after an
executed tool, a strict retry limit, cancellation, no retries on quota/access
errors, secret-safe final messages, PNG CRC/dimensions/decompression and desktop
availability when styling fails. The full remote XFCE session still needs live
verification after deployment. This build environment cannot start an XFCE
session; do not treat these checks as a live Daytona screenshot comparison.
