"""E2B Desktop adapter. Commands and desktop actions run only in the sandbox."""
import base64
import hashlib
import os
import shlex
import threading
from types import SimpleNamespace

TEMPLATE = 'aethervm-ubuntu-24-04-e2b-v1'
_cached = {}
_cache_lock = threading.Lock()

class E2BConfigurationError(RuntimeError):
    pass

def settings():
    if not os.getenv('E2B_API_KEY', '').strip():
        raise E2BConfigurationError('E2B API key is missing on the server. Run the E2B configuration command.')
    return {'api_key':os.environ['E2B_API_KEY'].strip(), 'request_timeout':30}

def lifetime():
    # Keep Hobby-compatible. The persistent lifecycle pauses instead of deleting files.
    return max(120, min(3300, int(os.getenv('E2B_TIMEOUT_SECONDS', '600'))))

def state(sandbox_id):
    from e2b import Sandbox
    info = Sandbox.get_info(sandbox_id, **settings())
    return str(info.state).lower().split('.')[-1]

class E2BSandbox:
    def __init__(self, user, existing=None, resume=True):
        from e2b_desktop import Sandbox
        options = settings()
        self.raw_id = existing.removeprefix('e2b:') if existing else None
        if self.raw_id:
            with _cache_lock: self.box = _cached.get(self.raw_id)
            if resume:
                # Only explicit task/start/terminal/file use extends the runtime or resumes.
                self.box = Sandbox.connect(self.raw_id, timeout=lifetime(), **options)
                with _cache_lock: _cached[self.raw_id] = self.box
            elif self.box is None and state(self.raw_id) == 'running':
                # Once after an API restart, recover SDK access to an already running VM.
                # Repeated screen polling reuses this object and does not renew its timeout.
                self.box = Sandbox.connect(self.raw_id, timeout=1, **options)
                with _cache_lock: _cached[self.raw_id] = self.box
        else:
            self.box = Sandbox.create(
                template=os.getenv('E2B_TEMPLATE') or TEMPLATE,
                resolution=(1280,800), display=':0', timeout=lifetime(),
                allow_internet_access=True,
                lifecycle={'on_timeout':'pause','auto_resume':False},
                metadata={'aethervm-user':hashlib.sha256(user.encode()).hexdigest(), 'aethervm-os':'ubuntu-24.04'},
                **options)
            self.raw_id = self.box.sandbox_id
            with _cache_lock: _cached[self.raw_id] = self.box
        self.id = 'e2b:' + self.raw_id
        self._computer = None
        self._read_only = not resume

    def execute(self, command):
        from e2b.sandbox.commands.command_handle import CommandExitException
        if self.box is None: raise RuntimeError('Computer is paused; start it first')
        if not self._read_only: self.box.set_timeout(lifetime())
        try:
            result = self.box.commands.run('timeout -k 5 60 bash -lc '+shlex.quote('cd /workspace && '+command),
                timeout=70, request_timeout=80, envs={'DISPLAY':':0'})
        except CommandExitException as result:
            return {'exit_code':result.exit_code,'output':((result.stdout or '')+(result.stderr or ''))[:24000]}
        return {'exit_code':result.exit_code,'output':((result.stdout or '')+(result.stderr or ''))[:24000]}

    def read_bytes(self, path):
        if not self._read_only: self.box.set_timeout(lifetime())
        return self.box.files.read(path, format='bytes')
    def write_bytes(self, data, path):
        if not self._read_only: self.box.set_timeout(lifetime())
        return self.box.files.write(path, data)

    def stop(self):
        from e2b import Sandbox
        # No connect/resume before pausing. Killed/missing instances remain an explicit error.
        if state(self.raw_id) != 'paused': Sandbox.pause(self.raw_id, **settings())
        with _cache_lock: _cached.pop(self.raw_id, None)

    def delete(self):
        from e2b import Sandbox
        Sandbox.kill(self.raw_id, **settings())
        with _cache_lock: _cached.pop(self.raw_id, None)

    def ensure_display(self):
        if self.box is None: raise RuntimeError('Computer is paused; start it first')
        # Resume may restore memory or cold-boot a disk snapshot. Never duplicate a display.
        check=self.execute('xdpyinfo -display :0 >/dev/null 2>&1 && pgrep -x xfce4-session >/dev/null && pgrep -x xfwm4 >/dev/null && pgrep -x xfdesktop >/dev/null')
        if check['exit_code']==0: return
        for command in [
            'xdpyinfo -display :0 >/dev/null 2>&1 || { nohup Xvfb :0 -ac -screen 0 1280x800x24 -nolisten tcp >/tmp/aether-xvfb.log 2>&1 </dev/null & }',
            'pgrep -x xfce4-session >/dev/null || { nohup dbus-run-session -- xfce4-session >/tmp/aether-xfce.log 2>&1 </dev/null & }',
            'for i in $(seq 1 40); do xdpyinfo -display :0 >/dev/null 2>&1 && pgrep -x xfwm4 >/dev/null && pgrep -x xfdesktop >/dev/null && exit 0; sleep 0.25; done; exit 1',
        ]:
            if self.execute(command)['exit_code']!=0: raise RuntimeError('Ubuntu display did not start')

    def screenshot(self):
        # SDK screenshot cleans up its temporary PNG after download.
        image=base64.b64encode(self.box.screenshot()).decode()
        return SimpleNamespace(screenshot=image)

    def key(self, key, modifiers=None):
        # Shell-quote keys; the upstream SDK press() interpolates key text directly.
        keys='+'.join((modifiers or [])+[key])
        result=self.execute('xdotool key -- '+shlex.quote(keys))
        if result['exit_code']!=0: raise RuntimeError('Key input failed')

    def scroll(self,x,y,direction,amount):
        self.box.move_mouse(int(x),int(y))
        self.box.scroll(direction=direction,amount=int(amount))

    def computer(self):
        if self.box is None: raise RuntimeError('Computer is paused; start it first')
        if self._computer is None:
            self._computer=SimpleNamespace(
                get_status=lambda:SimpleNamespace(status='running' if self.execute('xdpyinfo -display :0 >/dev/null 2>&1')['exit_code']==0 else 'stopped'),
                start=self.ensure_display,
                screenshot=SimpleNamespace(take_full_screen=self.screenshot),
                mouse=SimpleNamespace(click=lambda x,y:self.box.left_click(x=int(x),y=int(y)),scroll=self.scroll),
                keyboard=SimpleNamespace(type=lambda text:self.box.write(text,chunk_size=100,delay_in_ms=10),press=self.key))
        return self._computer
