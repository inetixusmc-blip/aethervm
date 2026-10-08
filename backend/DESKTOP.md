# E2B Ubuntu desktops

Backend 0.5.0 defaults to E2B Desktop. Each assistant owns a separate E2B computer,
with Ubuntu 24.04 verified from `/etc/os-release`. The public `desktop` template
uses Ubuntu 22.04, so the app builds its own `aethervm-ubuntu-24-04-e2b-v1` template
from `Dockerfile.e2b`. It includes XFCE, Ubuntu Yaru/Arc styling, a 1280x800 display,
Playwright Chromium, Python, Node, terminal and file tools. This is Ubuntu with
XFCE, not the stock GNOME desktop.

E2B runs commands and desktop tools; the AWS API remains the coordinator. AI keys
still belong to Gemini or Vercel AI Gateway. An E2B key is a separate server-only
infrastructure credential, never a mobile `EXPO_PUBLIC_*` setting.

## AWS setup

Create an E2B account and obtain an API key from https://e2b.dev.
Finish current tasks, then run these commands one at a time in SSH:

```bash
sudo git -C /opt/aethervm pull --ff-only
```

```bash
sudo python3 /opt/aethervm/deploy/aws/configure-e2b.py
```

The second command accepts the E2B key through a hidden prompt, preserves the
existing Google/database configuration and optional Daytona recovery credentials,
and writes `/etc/aethervm/backend.env` with mode 600. No key appears in shell history.

```bash
sudo bash /opt/aethervm/deploy/aws/update.sh
```

This rebuilds the API and builds the E2B Ubuntu template once per account. It does
not run Daytona snapshot migrations when E2B is selected. The first build takes
several minutes. To check actual E2B operation:

```bash
sudo docker compose -f /opt/aethervm/deploy/aws/compose.yml exec -T api python e2b_check.py
```

The check creates one disposable VM and tests Ubuntu, shell, file access, screenshots,
visible HTTPS browsing, pause/resume and preserved files; it then removes only that
VM. It consumes E2B compute credits. Existing assistant files are never used by this check.

```bash
curl --fail https://16.16.124.235/health
```

Expect `version: 0.5.0`, `provider: e2b`, `browser_tools_version: 2`. The existing
0.4.4 Android APK works with these endpoints; installing a new APK is not required.

## Persistence and provider switching

E2B computers use `lifecycle.on_timeout=pause`, never the default destructive
`kill` timeout. The default runtime lease is 600 seconds; active commands renew it.
The Sleep button pauses the VM, preserving files and memory. Explicit task, Start,
terminal and file requests resume it. Screen/status polling does not resume paused
VMs or repeatedly extend the lease. After an API restart, one SDK reconnect may
extend an already running VM by at most a second. Hobby's continuous-session limit
still applies; provider limits and availability are not changed by the app.

New E2B IDs are stored with an `e2b:` prefix. Existing unprefixed Daytona records
are recognized as legacy and never sent to E2B. Switching providers creates a
fresh E2B computer on first use; it does not silently copy old files. The database
retains the original computer ID in `previous_workspaces`, and the old VM is stopped
when possible, never deleted. A failed E2B creation leaves the old mapping intact.
Switching back reuses the most recently preserved computer for that provider.
Missing or killed E2B IDs cause an explicit error; a blank replacement is not
silently created over a computer that may contain important files.

To import the old `/workspace` after opening each assistant's new E2B computer:

```bash
sudo docker compose -f /opt/aethervm/deploy/aws/compose.yml exec -T api python e2b_migrate.py
```

Retain a valid Daytona key for this optional operation. It restores hash-verified,
safely extracted archives into `/workspace/imports/daytona-<source-hash>`; it never
replaces existing files or an existing import directory. The automated transfer
limit is 64 MiB compressed per workspace. System packages and files outside
`/workspace` stay in the old VM. Removed or currently working assistants are skipped.
Do not delete old Daytona computers until the files have been reviewed.

## Verification limits

SDK contract/unit tests and a disposable Ubuntu Docker smoke run validate the
adapter and image without cloud credentials. Only `e2b_check.py` on the configured
server establishes that the account's key, cloud template build, credits and live
provider work. Public-site bot checks may still require manual user takeover.
