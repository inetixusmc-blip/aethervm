"""No agent code ever executes on the API host."""
import os, subprocess, shlex, hashlib, json, threading

class UbuntuRequired(RuntimeError):
    def __init__(self, box):
        self.box=box
        super().__init__('Existing computer needs Ubuntu migration')

def verify_ubuntu(box):
    result=box.execute('. /etc/os-release && printf "%s:%s" "$ID" "$VERSION_ID"')
    if result['exit_code']!=0 or result.get('output','').strip()!='ubuntu:24.04':
        raise UbuntuRequired(box)
    box.os_name='Ubuntu 24.04 LTS'
    return box

class DockerSandbox:
    def __init__(self, user, existing=None):
        self.id = existing or 'aether-' + hashlib.sha256(user.encode()).hexdigest()[:24]
        found = subprocess.run(['docker','inspect',self.id], capture_output=True).returncode == 0
        if not found:
            subprocess.run(['docker','run','-d','--name',self.id,'--label','aethervm=true',
                '--cpus','1','--memory','1g','--pids-limit','256','--cap-drop','ALL',
                '--security-opt','no-new-privileges','--mount',f'type=volume,source={self.id},target=/workspace',
                os.getenv('SANDBOX_IMAGE','aethervm-sandbox:local'),'sleep','infinity'],check=True,capture_output=True)
        else:
            subprocess.run(['docker','start',self.id],check=True,capture_output=True)
    def execute(self, command):
        p = subprocess.run(['docker','exec','-w','/workspace',self.id,'timeout','-k','5','60','bash','-lc',command],
                           capture_output=True,timeout=70)
        return {'exit_code':p.returncode,'output':(p.stdout+p.stderr).decode(errors='replace')[:24000]}
    def stop(self):
        subprocess.run(['docker','stop',self.id],check=True,capture_output=True)
    def delete(self):
        subprocess.run(['docker','rm','-f',self.id],check=True,capture_output=True)
        subprocess.run(['docker','volume','rm',self.id],check=True,capture_output=True)

class DaytonaSandbox:
    def __init__(self, user, existing=None):
        from daytona import Daytona, CreateSandboxFromSnapshotParams
        self.client = Daytona()
        if existing:
            self.box = self.client.get(existing)
            if str(self.box.state).lower().split('.')[-1] != 'started': self.client.start(self.box)
        else:
            from ubuntu_snapshot import SNAPSHOT
            # Never silently fall back to Daytona's Debian default.
            params = CreateSandboxFromSnapshotParams(snapshot=os.getenv('DAYTONA_SNAPSHOT') or SNAPSHOT,
                auto_stop_interval=5, labels={'aethervm-user': hashlib.sha256(user.encode()).hexdigest(), 'aethervm-os':'ubuntu-24.04'})
            self.box = self.client.create(params)
        self.id = self.box.id
        # The default image has no /workspace. Bootstrap before any cd into it.
        bootstrap='test -d /workspace && test -w /workspace || { mkdir -p /workspace 2>/dev/null && test -w /workspace; } || sudo -n install -d -m 0755 -o "$(id -u)" -g "$(id -g)" /workspace'
        result=self.box.process.exec('bash -lc '+shlex.quote(bootstrap),timeout=20)
        if result.exit_code!=0: raise RuntimeError('Workspace directory is unavailable')
    def execute(self, command):
        r = self.box.process.exec('timeout -k 5 60 bash -lc ' + shlex.quote('cd /workspace && '+command), timeout=70)
        return {'exit_code':r.exit_code, 'output':r.result[:24000]}
    def computer(self): return self.box.computer_use
    def read_bytes(self,path): return self.box.fs.download_file(path)
    def write_bytes(self,data,path): return self.box.fs.upload_file(data,path)
    def stop(self): self.client.stop(self.box)
    def delete(self): self.client.delete(self.box)

def get_sandbox(user, existing=None):
    return verify_ubuntu((DaytonaSandbox if os.getenv('SANDBOX_PROVIDER','daytona') == 'daytona' else DockerSandbox)(user,existing))

def migrate_ubuntu(user,old):
    """Copy workspace to Ubuntu; retain the original machine as a recovery source."""
    import uuid
    archive='/tmp/aether-migration-'+uuid.uuid4().hex+'.tar.gz'
    r=old.execute('tar -czf '+shlex.quote(archive)+' -C /workspace . && stat -c %s '+shlex.quote(archive))
    if r['exit_code']!=0: raise RuntimeError('Could not back up the existing workspace')
    if int(r['output'].strip())>64*1024*1024:
        raise RuntimeError('Workspace needs a larger migration. The original computer and files are preserved.')
    data=old.read_bytes(archive)
    digest=hashlib.sha256(data).hexdigest()
    new=verify_ubuntu(DaytonaSandbox(user))
    try:
        new.write_bytes(data,archive)
        source=f'''import hashlib,tarfile
from pathlib import Path
p=Path({archive!r})
assert hashlib.sha256(p.read_bytes()).hexdigest()=={digest!r}
with tarfile.open(p) as t: t.extractall('/workspace',filter='data')
print('Workspace restored')
'''
        result=new.execute(python_command(source))
        if result['exit_code']!=0: raise RuntimeError('Workspace restore failed; original files preserved')
        return new
    except Exception:
        try:new.stop()
        except Exception:pass
        raise

desktop_locks={}
desktop_lock_guard=threading.Lock()

def python_command(source):
    return 'python3 -c ' + shlex.quote(source)

def start_desktop(box):
    with desktop_lock_guard: lock=desktop_locks.setdefault(box.id if hasattr(box,'id') else id(box),threading.Lock())
    with lock: return _start_desktop(box)

def _start_desktop(box):
    if not getattr(box,'_desktop_started',False):
        cu=box.computer()
        # A new SDK object is made per HTTP request; avoid restarting a running display.
        try: running=str(cu.get_status().status).lower()=='running'
        except Exception: running=False
        if not running: cu.start()
        box._desktop_started=True
        if hasattr(box,'execute'):
            # Styling runs inside this agent's own sandbox and persists on disk.
            # A theme failure must never prevent shell/files/desktop automation.
            from pathlib import Path
            try:
                source=Path(__file__).with_name('desktop_theme.py').read_text()
                if isinstance(box,DaytonaSandbox):
                    # Known apt packages only; existing installs return immediately.
                    # Run outside the 60-second interactive-command limit.
                    try:
                        box.box.process.exec('timeout -k 5 75 '+python_command(source)+' --install-assets',timeout=85)
                    except Exception as exc:
                        import logging
                        logging.getLogger(__name__).warning('Desktop assets unavailable: %s',type(exc).__name__)
                result=box.execute(python_command(source))
                box._desktop_theme_ready=result.get('exit_code')==0
                if not box._desktop_theme_ready:
                    import logging
                    logging.getLogger(__name__).warning('Desktop appearance failed with exit code %s',result.get('exit_code'))
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning('Desktop appearance failed: %s',type(exc).__name__)
                box._desktop_theme_ready=False

def tool(box, name, args):
    if name == 'run_shell': return box.execute(args['command'])
    if name == 'write_file':
        source = f"from pathlib import Path; p=Path({args['path']!r}); p.parent.mkdir(parents=True,exist_ok=True); p.write_text({args['content']!r}); print('Saved',p)"
        return box.execute(python_command(source))
    if name == 'read_file':
        return box.execute(python_command(f"from pathlib import Path; print(Path({args['path']!r}).read_text()[:24000])"))
    if name == 'browse':
        # Chromium executes only inside the sandbox, including any downloaded page content.
        source = f'''from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox'])
 page=b.new_page()
 page.goto({args['url']!r},wait_until='domcontentloaded',timeout=30000)
 print('TITLE:',page.title())
 print('URL:',page.url)
 print(page.locator('body').inner_text()[:20000])
 b.close()
'''
        return box.execute(python_command(source))
    if name.startswith('computer_') or name=='browser_open':
        if not hasattr(box,'computer'): return {'error':'Desktop tools unavailable for this provider'}
        start_desktop(box); cu=box.computer()
        if name=='computer_screenshot':
            return capture_screen(cu)
        if name=='computer_click': cu.mouse.click(int(args['x']),int(args['y']))
        elif name=='computer_type': cu.keyboard.type(args['text'])
        elif name=='computer_key': press_key(cu,args['key'])
        elif name=='browser_open':
            import urllib.parse
            url=args['url']
            if urllib.parse.urlparse(url).scheme not in ('https','http'): raise ValueError('Use an HTTP or HTTPS address')
            # The visible browser keeps its profile on sandbox disk between tasks.
            return box.execute('DISPLAY=:0 nohup sh -c '+shlex.quote('exec $(command -v chromium || command -v chromium-browser || command -v google-chrome) --no-sandbox --user-data-dir=/workspace/.browser '+shlex.quote(url))+' >/tmp/aether-browser.log 2>&1 & sleep 1; cat /tmp/aether-browser.log | tail -3')
        return {'ok':True}
    raise ValueError('Unknown tool')

def sandbox_state(sandbox_id):
    if os.getenv('SANDBOX_PROVIDER','daytona')=='daytona':
        from daytona import Daytona
        return str(Daytona().get(sandbox_id).state).lower().split('.')[-1]
    r=subprocess.run(['docker','inspect','--format','{{.State.Running}}',sandbox_id],capture_output=True,text=True)
    return 'started' if r.stdout.strip()=='true' else 'stopped'

def existing_sandbox(sandbox_id):
    # Read-only access: unlike provisioning, screen polling never restarts a stopped computer.
    if os.getenv('SANDBOX_PROVIDER','daytona')!='daytona': raise RuntimeError('Desktop unavailable')
    from daytona import Daytona
    box=object.__new__(DaytonaSandbox)
    box.client=Daytona(); box.box=box.client.get(sandbox_id); box.id=sandbox_id
    return box

def docker_read(self,path):
    r=subprocess.run(['docker','exec',self.id,'python3','-c',f"import sys; sys.stdout.buffer.write(open({path!r},'rb').read())"],capture_output=True,timeout=30,check=True)
    return r.stdout
def docker_write(self,data,path):
    subprocess.run(['docker','exec','-i',self.id,'python3','-c',f"import sys; open({path!r},'wb').write(sys.stdin.buffer.read())"],input=data,capture_output=True,timeout=30,check=True)
DockerSandbox.read_bytes=docker_read
DockerSandbox.write_bytes=docker_write


def capture_screen(cu):
    import base64,struct
    shot=cu.screenshot.take_full_screen()
    image=shot.screenshot or ''
    if image.startswith('data:'): image=image.split(',',1)[1]
    data=base64.b64decode(image)
    if data[:8]!=b'\x89PNG\r\n\x1a\n': raise RuntimeError('Desktop did not return a PNG image')
    width,height=struct.unpack('>II',data[16:24])
    return {'image':image,'width':width,'height':height}

def press_key(cu,key):
    parts=key.split('+')
    cu.keyboard.press(parts[-1],modifiers=parts[:-1] or None)
