# Ubuntu desktops and connection recovery

AetherVM now requires Ubuntu 24.04 LTS for active agent computers. It never uses
Daytona's default Debian snapshot for new computers. `Dockerfile.ubuntu` includes
Daytona's documented XFCE/Xvfb/x11vnc/noVNC/D-Bus stack, official Ubuntu Yaru and
Arc themes, Chrome from Google's official Debian package, Python, Node and
Playwright. This is an Ubuntu XFCE desktop rather than the stock GNOME session.
The OS gate checks `/etc/os-release`, independent of appearance or provider labels.

The account's Daytona snapshot is built once with `python ubuntu_snapshot.py`.
The AWS update script invokes this after deploying the API; the first image build
can take several minutes. Snapshot build failures do not enable Debian fallback.
`DAYTONA_SNAPSHOT` can override the image only with another Ubuntu 24.04 snapshot.

The AWS update migrates and checks every existing active assistant computer;
computers created later use Ubuntu directly. Non-Ubuntu computers also migrate
on first use if an administrator uses a different deployment path. A compressed backup of all
`/workspace` contents is hash-verified before extraction in a new Ubuntu computer.
The API switches the mapping only after extraction succeeds and stores the old
sandbox ID in `previous_workspaces`. The original sandbox stops and remains in
Daytona for recovery; it is not deleted. Installed system packages and files
outside `/workspace` stay on that old computer. The automatic transfer is bounded
to 64 MiB compressed; larger or unsafe archives leave the original mapping intact
and require a manual migration. Do not delete old sandboxes until their files have
been reviewed. Stopped storage may count toward Daytona quota.

Desktop startup checks the provider's running display before starting it. Shell
initialization creates a writable `/workspace` before executing commands. Polling
retains the last frame on transient failure, and a failed screen can reconnect a
computer that auto-stopped. A recoverable assistant removal hides it, stops its
computer when possible, and keeps its messages/files for the sidebar Restore flow.

## Apply to AWS

Let current tasks finish, then use the existing SSH terminal:

```bash
sudo bash /opt/aethervm/deploy/aws/update.sh
curl --fail https://16.16.124.235/health
```

Health should include `"version":"0.4.2"`. The update command builds the Ubuntu
snapshot in the same Daytona organization and credentials as the API. Reopen the
computer; the initial migration can take longer than normal startup. Its original
files are preserved if migration fails. Install APK 0.4.2 for the UI and default
AWS address. A custom server URL remains unchanged.

Gemini model discovery lists only supported agent text/image models and does not
make an inference request. The optional connection test isolates model listing,
plain text generation and generation with computer tools. Terminal commands do
not use Gemini. Provider failures show safe error categories without secret URLs
or API keys. Transient Gemini requests retry up to three times; executed computer
actions are never automatically repeated. Editing/resending the latest user
message replaces the last conversational turn and starts a new task; it does not
undo previously completed computer actions.

Live AWS SSH is unreachable from the build workspace. Docker image/UI/SDK unit
checks do not establish that the user's deployed Daytona key or native Android
WebView works. Verify a terminal command, desktop reconnect and a Gemini task
after applying the update on AWS.
