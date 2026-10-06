# AWS migration — prepared, not deployed

Target supplied by the owner: EC2 `16.16.124.235`, eu-north-1, t3.large.
The build environment returns `Network is unreachable` for port 22. No OS,
SSH username, security group, domain, running service or TLS installation has
been verified on this instance. The app continues using the existing HTTPS API.

## Deployment procedure once SSH is available

1. Inspect the instance's AMI in AWS and use its documented SSH username.
   Keep the supplied PEM outside the repository, mode 600. Verify the server's
   SSH host fingerprint through AWS before trusting it; do not disable host checks.
2. Read `/etc/os-release` on the host before installing packages. Install the
   distribution-supported Docker engine, Compose v2, nginx, Git and an ACME
   client. Apply system updates and enable Docker/nginx at boot.
3. Clone this repository into `/opt/aethervm`. Create `/etc/aethervm` mode 700.
   Copy the existing production configuration into `/etc/aethervm/backend.env`
   mode 600 without printing it. Required private configuration: Daytona key,
   Turso URL/token, Google Web client ID and the existing account allowlist.
   Keep `SANDBOX_PROVIDER=daytona`; sandbox compute stays on Daytona.
   Do not enable `DEV_AUTH` in production. No Gemini key belongs in this file.
4. Use the owner-controlled API hostname and point DNS at EC2. Restrict SSH
   ingress to the administrator's current IP. Permit application traffic on
   443, and port 80 only for redirects/ACME. Do not expose 8000 or any database
   port. The compose file binds the API to localhost.
5. Obtain a valid certificate using the chosen hostname and ACME webroot
   `/var/www/letsencrypt`. Replace `API_HOSTNAME` in `nginx.conf.example`,
   install it in nginx's distro-specific configuration directory, then run
   `nginx -t` before reload. Enable automated certificate renewal and nginx
   reload after renewal. No valid AWS-hosted HTTPS endpoint exists yet.
6. Install `aethervm.service` in `/etc/systemd/system/`, then run
   `systemctl daemon-reload` and `systemctl enable --now aethervm`.
   Compose's restart policy restarts a crashed container and Docker restores
   it after reboot. The API uses one Uvicorn process and four task threads.
7. Check `docker compose -f deploy/aws/compose.yml ps`, container logs and local
   `/health`. Verify `https://<hostname>/health` from outside EC2 with ordinary
   certificate validation. Confirm Google/session, profiles, tasks, provider,
   live screen/control, uploads/downloads, memory, skills, cancellation and logout.
8. Run four real Daytona/Gemini jobs at once, including one failure, while
   polling health. Record API latency, process CPU/RSS, host memory and
   `docker stats`; test independent screen/control/file ownership. The local
   mock concurrency test is evidence of scheduling/isolation, not AWS capacity.
9. Only after these checks pass set the single mobile `EXPO_PUBLIC_API_URL`
   configuration to the new HTTPS hostname and build the APK. Existing saved
   addresses can be changed in Settings. Keep the old service available until
   the installed app's critical flows pass against AWS.

## Updates and recovery

Run `deploy/aws/update.sh` on the server after reviewing the target commit.
Retain the previous commit for rollback; switch to it and rebuild the container
if health or critical flows fail. Turso contains durable data; take a database
backup before migrations. Updates interrupt in-memory running tasks; they
restore as interrupted rather than silently restarting work.

Configuration is in `/etc/aethervm/backend.env`; logs use nginx's access/error
logs and bounded Docker logs. Neither PEM nor environment credentials are
included in source archives or Android builds.
