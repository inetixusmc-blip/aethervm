"""A modern XFCE desktop for Daytona; also runnable inside a sandbox.

Styling needs no root access. Optional asset provisioning uses the image's
configured apt repositories; GTK's built-in dark theme remains a fallback.
"""
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import time
import zlib

REVISION = 'aethervm-desktop-4'


def install_assets():
    if Path('/usr/share/themes/Yaru-dark').exists() and Path('/usr/share/icons/Yaru').exists() and Path('/usr/share/themes/Arc-Dark/xfwm4').exists():
        return {'status': 'already_installed'}
    if not shutil.which('apt-get'):
        return {'status': 'fallback', 'reason': 'no_apt'}
    prefix = [] if os.geteuid() == 0 else ['sudo', '-n']
    if prefix and not shutil.which('sudo'):
        return {'status': 'fallback', 'reason': 'no_privileges'}
    try:
        for args, limit in ((['update'],25),(['install','-y','--no-install-recommends','yaru-theme-gtk','yaru-theme-icon','arc-theme'],45)):
            result = subprocess.run(prefix+['apt-get']+args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=limit,env={**os.environ,'DEBIAN_FRONTEND':'noninteractive'})
            if result.returncode:
                return {'status': 'fallback', 'reason': 'package_install_failed'}
    except (OSError,subprocess.TimeoutExpired):
        return {'status': 'fallback', 'reason': 'package_install_unavailable'}
    return {'status': 'installed'}


def desktop_env():
    # Join the existing desktop session's bus instead of starting a second one.
    for _ in range(30):
        for proc in Path('/proc').iterdir():
            if not proc.name.isdigit(): continue
            try:
                if (proc / 'comm').read_text().strip() not in ('xfce4-session', 'xfdesktop', 'xfce4-panel'): continue
                values = dict(entry.split('=', 1) for entry in (proc / 'environ').read_bytes().decode().split('\0') if '=' in entry)
                if values.get('DBUS_SESSION_BUS_ADDRESS'):
                    env = os.environ.copy()
                    env.update({k: values[k] for k in ('DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY', 'HOME', 'XDG_RUNTIME_DIR') if k in values})
                    return env
            except (OSError, UnicodeError, ValueError): continue
        time.sleep(.1)
    raise RuntimeError('Desktop session bus is not ready')


def wallpaper(path, width=1280, height=800):
    """Render an original aubergine/orange geometric wallpaper with stdlib PNG."""
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        fy = y / height
        for x in range(width):
            fx = x / width
            glow = max(0, 1 - ((fx-.15)**2*1.5 + (fy-.9)**2*2)) ** 3
            arc = max(0, 1 - abs(fy - (.25 + fx*.6))*12) * .12
            rows.extend((min(255,int(35+glow*142+arc*120)),min(255,int(18+glow*35+arc*80)),min(255,int(48+glow*10+arc*150))))
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0)) + chunk(b'IDAT',zlib.compress(bytes(rows),6)) + chunk(b'IEND',b''))


def apply(force=False):
    env = desktop_env()
    home = Path(env.get('HOME', str(Path.home())))
    assets = home / '.local/share/aethervm'
    marker = assets / 'desktop-version'
    if not force and marker.exists() and marker.read_text().strip() == REVISION:
        return {'status': 'already_configured'}
    if not shutil.which('xfconf-query'): raise RuntimeError('XFCE configuration tool is unavailable')
    assets.mkdir(parents=True, exist_ok=True)
    backup = assets / 'original-desktop-config'
    config = home / '.config/xfce4/xfconf/xfce-perchannel-xml'
    if config.exists() and not backup.exists(): shutil.copytree(config, backup)

    def query(channel, *args):
        return subprocess.run(['xfconf-query', '-c', channel, *map(str,args)], env=env, capture_output=True, text=True, timeout=5)
    def put(channel, prop, value, kind='string'):
        value = str(value).lower() if isinstance(value,bool) else str(value)
        exists = query(channel, '-p', prop).returncode == 0
        args = ['-p', prop, '-s', value] if exists else ['-p', prop, '-n', '-t', kind, '-s', value]
        if query(channel, *args).returncode != 0: raise RuntimeError('Could not apply desktop setting: ' + prop)

    theme_roots = [home / '.themes', home / '.local/share/themes', Path('/usr/share/themes')]
    icon_roots = [home / '.icons', home / '.local/share/icons', Path('/usr/share/icons')]
    gtk = next((t for t in ('Yaru-dark','Adwaita-dark') if any((r/t).exists() for r in theme_roots)), 'Adwaita-dark')
    icons = next((t for t in ('Yaru','Papirus-Dark','Adwaita') if any((r/t).exists() for r in icon_roots)), 'Adwaita')
    wm = next((t for t in ('Yaru-dark','Greybird-dark','Arc-Dark') if any((r/t/'xfwm4').exists() for r in theme_roots)), None)
    put('xsettings','/Net/ThemeName',gtk)
    put('xsettings','/Net/IconThemeName',icons)
    put('xsettings','/Gtk/FontName','Sans 10')
    put('xsettings','/Gtk/CursorThemeName','Adwaita')
    put('xsettings','/Gtk/CursorThemeSize',24,'int')
    put('xsettings','/Xft/Antialias',1,'int')
    if wm: put('xfwm4','/general/theme',wm)
    put('xfwm4','/general/title_font','Sans Bold 10')
    put('xfwm4','/general/button_layout','|HMC')

    image = assets / 'wallpaper.png'
    wallpaper(image)
    props = query('xfce4-desktop','-l').stdout.splitlines()
    # Daytona's Debian image still uses the older monitor-only schema.
    backdrops = set(p.rsplit('/',1)[0] for p in props if re.fullmatch(r'/backdrop/screen\d+/monitor[^/]+/(?:workspace\d+/)?[^/]+',p))
    # XFCE 4.20 can ship only obsolete settings: create its actual monitor paths.
    if shutil.which('xrandr'):
        monitors = subprocess.run(['xrandr','--query'],env=env,capture_output=True,text=True,timeout=5).stdout
        count = query('xfwm4','-p','/general/workspace_count').stdout.strip()
        count = min(32,max(1,int(count))) if count.isdigit() else 1
        for monitor in re.findall(r'^([^\s/]+) connected\b',monitors,re.M):
            for workspace in range(count):
                backdrops.add(f'/backdrop/screen0/monitor{monitor}/workspace{workspace}')
    if not backdrops: raise RuntimeError('Desktop monitor settings are not ready')
    for prefix in sorted(backdrops):
        put('xfce4-desktop',prefix+'/last-image',image)
        for key in ('image-path','last-single-image'):
            if prefix+'/'+key in props: put('xfce4-desktop',prefix+'/'+key,image)
        put('xfce4-desktop',prefix+'/image-style',5,'int')
        put('xfce4-desktop',prefix+'/cycle-enable',False,'bool')
    put('xfce4-desktop','/desktop-icons/file-icons/show-home',False,'bool')
    put('xfce4-desktop','/desktop-icons/file-icons/show-filesystem',False,'bool')
    put('xfce4-desktop','/desktop-icons/file-icons/show-trash',False,'bool')

    panels = sorted(set(re.findall(r'/panels/panel-\d+',query('xfce4-panel','-l').stdout)))
    for index, panel in enumerate(panels):
        put('xfce4-panel',panel+'/size',32 if index == 0 else 44,'uint')
        put('xfce4-panel',panel+'/position-locked',True,'bool')
        put('xfce4-panel',panel+'/background-style',0,'uint')
        put('xfce4-panel',panel+'/enter-opacity',100,'uint')
        put('xfce4-panel',panel+'/leave-opacity',100,'uint')
    if len(panels) == 2:
        dock = panels[1]
        put('xfce4-panel',dock+'/mode',1,'uint')
        put('xfce4-panel',dock+'/position','p=7;x=0;y=0')
        put('xfce4-panel',dock+'/icon-size',32,'uint')
        put('xfce4-panel',dock+'/autohide-behavior',0,'uint')
    put('xfce4-panel','/panels/dark-mode',True,'bool')
    for prop in query('xfce4-panel','-l').stdout.splitlines():
        if re.fullmatch(r'/plugins/plugin-\d+',prop) and query('xfce4-panel','-p',prop).stdout.strip() == 'applicationsmenu':
            put('xfce4-panel',prop+'/button-title','Activities')
            put('xfce4-panel',prop+'/show-button-title',True,'bool')
            put('xfce4-panel',prop+'/show-menu-icons',True,'bool')
    subprocess.run(['xfdesktop','--reload'],env=env,capture_output=True,timeout=5)
    marker.write_text(REVISION)
    return {'status': 'configured', 'theme': gtk, 'icons': icons}


if __name__ == '__main__':
    print(json.dumps(install_assets() if '--install-assets' in sys.argv else apply()))
