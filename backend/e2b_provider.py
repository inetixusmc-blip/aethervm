"""E2B Desktop adapter. Commands and desktop actions run only in the sandbox."""
import base64
import hashlib
import os
import shlex
import threading
import secrets
import time
from types import SimpleNamespace

TEMPLATE = 'aethervm-ubuntu-24-04-e2b-v1'
_cached = {}
_cache_lock = threading.Lock()
_streams = {}
_stream_lock = threading.Lock()
_last_input={}

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
        with _stream_lock: _streams.pop(self.raw_id, None)

    def delete(self):
        from e2b import Sandbox
        Sandbox.kill(self.raw_id, **settings())
        with _cache_lock: _cached.pop(self.raw_id, None)
        with _stream_lock: _streams.pop(self.raw_id, None)

    def stream(self,reset=False):
        """Authenticated continuous RFB stream; all input stays on the serialized API.

        Works on existing v1 Ubuntu computers, without rebuilding or replacing files.
        Never use the SDK's unprotected default VNC server or passwords in URLs.
        """
        if self.box is None: raise RuntimeError('Start the computer first')
        with _stream_lock:
            if reset:_streams.pop(self.raw_id,None)
            if self.raw_id in _streams: return _streams[self.raw_id]
            password=secrets.token_hex(8)
            self.write_bytes(password.encode(),'/tmp/aether-stream-secret')
            source="""import os,subprocess,time
os.chmod('/tmp/aether-stream-secret',0o600)
secret=open('/tmp/aether-stream-secret').read()
subprocess.run(['x11vnc','-storepasswd',secret,'/tmp/aether-vnc-passwd'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
os.chmod('/tmp/aether-vnc-passwd',0o600)
# After API restart rotate authentication; stale viewers must reconnect.
subprocess.run(['pkill','-x','x11vnc'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['pkill','-f','^/usr/bin/python3 /usr/bin/websockify 6080'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.Popen(['x11vnc','-display',':0','-rfbauth','/tmp/aether-vnc-passwd','-localhost','-rfbport','5900','-forever','-shared','-viewonly','-nocursor','-wait','16','-noxdamage'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
subprocess.Popen(['/usr/bin/websockify','6080','localhost:5900'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
import socket
for _ in range(40):
 try:
  with socket.create_connection(('127.0.0.1',6080),timeout=.25): break
 except OSError: time.sleep(.1)
else: raise RuntimeError('Stream did not start')
"""
            result=self.execute('python3 -c '+shlex.quote(source))
            if result['exit_code']!=0: raise RuntimeError('Live desktop stream unavailable')
            config={'url':'wss://'+self.box.get_host(6080)+'/websockify', 'password':password[:8], 'width':1280,'height':800}
            _streams[self.raw_id]=config
            return config

    def input_activity(self):
        # Real human input keeps the desktop awake; passive streaming never renews it.
        if time.monotonic()-_last_input.get(self.raw_id,0)>30:
            self.box.set_timeout(lifetime());_last_input[self.raw_id]=time.monotonic()

    def pointer(self,action,x=0,y=0,button='left',smooth=False):
        button_id={'left':1,'middle':2,'right':3}[button]
        x=max(0,min(1279,int(x))); y=max(0,min(799,int(y)))
        if smooth:
            source=f"""import subprocess,time,re
p=subprocess.check_output(['xdotool','getmouselocation','--shell'],text=True)
start={{k:int(v) for k,v in re.findall(r'^(X|Y)=(\\d+)$',p,re.M)}}
for i in range(1,9):
 t=i/8; t=t*t*(3-2*t)
 subprocess.run(['xdotool','mousemove',str(round(start['X']+({x}-start['X'])*t)),str(round(start['Y']+({y}-start['Y'])*t))],check=True)
 time.sleep(.012)
"""
            result=self.execute('python3 -c '+shlex.quote(source))
            if result['exit_code']!=0: raise RuntimeError('Pointer move failed')
        else: self.box.move_mouse(x,y)
        if action=='click': self.box.commands.run(f'xdotool click {button_id}')
        elif action=='down': self.box.mouse_press(button)
        elif action=='up': self.box.mouse_release(button)

    def clipboard(self,text=None):
        check=self.execute("python3 -c 'import tkinter' >/dev/null 2>&1 || sudo -n apt-get install -y python3-tk >/dev/null 2>&1")
        if check['exit_code']!=0:raise RuntimeError('Clipboard service unavailable')
        source="import tkinter as tk; r=tk.Tk(); r.withdraw(); "
        if text is None:
            result=self.execute('python3 -c '+shlex.quote(source+"print(r.clipboard_get()); r.destroy()"))
            if result['exit_code']!=0:raise RuntimeError('Computer clipboard is empty or unavailable')
            return result['output'].rstrip('\n')
        # Keep ownership alive long enough for applications to request the selection.
        self.write_bytes(text.encode(),'/tmp/aether-clipboard-text')
        source+="r.clipboard_clear(); r.clipboard_append(open('/tmp/aether-clipboard-text').read()); r.after(30000,r.destroy); r.mainloop()"
        self.box.commands.run('python3 -c '+shlex.quote(source),background=True,timeout=0)

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
                mouse=SimpleNamespace(click=lambda x,y:self.pointer('click',x,y,smooth=True),scroll=self.scroll),
                keyboard=SimpleNamespace(type=lambda text:self.box.write(text,chunk_size=100,delay_in_ms=10),press=self.key))
        return self._computer
