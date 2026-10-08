"""Run inside the preview image in CI, never against a user's files."""
import subprocess
from pathlib import Path
release=dict(line.split('=',1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
assert release['ID'].strip('"')=='ubuntu' and release['VERSION_ID'].strip('"')=='24.04'
for program in ('Xvfb','xfce4-session','x11vnc','python3'):
    subprocess.run(['which',program],check=True)
subprocess.run(['xdotool','getdisplaygeometry'],check=True)
p=Path('/workspace/smoke.txt');p.write_text('Ubuntu verified');assert p.read_text()=='Ubuntu verified'
subprocess.run(['scrot','/workspace/ubuntu-desktop.png'],check=True)
print('Ubuntu 24.04 desktop, packages, display and workspace verified.')
