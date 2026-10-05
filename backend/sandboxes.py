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
    def stop(self): self.client.stop(self.box)
    def delete(self): self.client.delete(self.box)

def get_sandbox(user, existing=None):
    return (DaytonaSandbox if os.getenv('SANDBOX_PROVIDER','daytona') == 'daytona' else DockerSandbox)(user,existing)

def python_command(source):
    return 'python3 -c ' + shlex.quote(source)

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
    raise ValueError('Unknown tool')
