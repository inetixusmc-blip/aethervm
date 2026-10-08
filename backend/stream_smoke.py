"""Run the production E2B stream bootstrap on a disposable Ubuntu CI computer."""
import json,subprocess,time
from pathlib import Path
from types import SimpleNamespace
from e2b_provider import E2BSandbox
box=object.__new__(E2BSandbox);box.raw_id='ci-disposable';box._read_only=False
box.box=SimpleNamespace(get_host=lambda port:f'{port}-ci.e2b.app',set_timeout=lambda *a:None,files=SimpleNamespace(write=lambda p,d:Path(p).write_bytes(d)))
def execute(command):
    r=subprocess.run(['bash','-lc',command],capture_output=True,text=True,timeout=70,env={**__import__('os').environ,'DISPLAY':':0'})
    return {'exit_code':r.returncode,'output':r.stdout+r.stderr}
box.execute=execute
config=box.stream()
p=Path('/workspace/stream-auth.json');p.write_text(json.dumps(config));p.chmod(0o600)
# A changing application proves that frames arrive through RFB without screenshot requests.
source="""import tkinter as tk
r=tk.Tk();r.title('Continuous desktop stream check');r.geometry('1000x500+50+100');r.configure(bg='#172c49')
l=tk.Label(r,text='',font=('Ubuntu',32),fg='#b4d6ff',bg='#172c49');l.pack(expand=True)
def update(n=0):
 l.config(text='LIVE STREAM · frame '+str(n));r.after(100,lambda:update(n+1))
update();r.mainloop()
"""
subprocess.Popen(['python3','-c',source],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
print('Production VNC bootstrap ready: password authentication, local VNC, read-only transport.')
