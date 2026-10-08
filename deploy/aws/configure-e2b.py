#!/usr/bin/env python3
"""Interactive server-only setup. The key is never printed or put in shell history."""
import getpass
import os
import re
from pathlib import Path
import tempfile

if os.geteuid()!=0: raise SystemExit('Run this configuration command with sudo.')
path=Path('/etc/aethervm/backend.env')
if not path.is_file(): raise SystemExit('Existing backend.env is required; configure Google login first.')
key=getpass.getpass('Paste your E2B API key (hidden): ').strip()
if len(key)<10 or not re.fullmatch(r'[A-Za-z0-9_.-]+',key): raise SystemExit('Invalid key; configuration unchanged.')
updates={'SANDBOX_PROVIDER':'e2b','E2B_API_KEY':key,'E2B_TEMPLATE':'aethervm-ubuntu-24-04-e2b-v1','E2B_TIMEOUT_SECONDS':'600'}
lines=[]
for line in path.read_text().splitlines():
    name=line.split('=',1)[0].strip()
    if name not in updates: lines.append(line)
lines.extend(name+'='+value for name,value in updates.items())
fd,tmp=tempfile.mkstemp(prefix='.backend-e2b-',dir=path.parent)
try:
    with os.fdopen(fd,'w') as handle:
        handle.write('\n'.join(lines)+'\n');handle.flush();os.fsync(handle.fileno())
    os.chmod(tmp,0o600);os.replace(tmp,path)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
print('E2B configured. Google login, AI settings and legacy recovery credentials retained.')
