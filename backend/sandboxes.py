"""No agent code ever executes on the API host."""
import os, subprocess, shlex, hashlib, json

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
            params = CreateSandboxFromSnapshotParams(auto_stop_interval=5, labels={'aethervm-user': hashlib.sha256(user.encode()).hexdigest()})
            if os.getenv('DAYTONA_SNAPSHOT'): params.snapshot = os.environ['DAYTONA_SNAPSHOT']
            self.box = self.client.create(params)
        self.id = self.box.id
        self.execute('mkdir -p /workspace')
    def execute(self, command):
        r = self.box.process.exec('timeout -k 5 60 bash -lc ' + shlex.quote('cd /workspace && '+command), timeout=70)
        return {'exit_code':r.exit_code, 'output':r.result[:24000]}
    def computer(self): return self.box.computer_use
    def read_bytes(self,path): return self.box.fs.download_file(path)
    def write_bytes(self,data,path): return self.box.fs.upload_file(data,path)
    def stop(self): self.client.stop(self.box)
    def delete(self): self.client.delete(self.box)

def get_sandbox(user, existing=None):
    return (DaytonaSandbox if os.getenv('SANDBOX_PROVIDER','daytona') == 'daytona' else DockerSandbox)(user,existing)

def python_command(source):
    return 'python3 -c ' + shlex.quote(source)

def start_desktop(box):
    if not getattr(box,'_desktop_started',False):
        box.computer().start()
        box._desktop_started=True

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
