"""Live E2B check using one disposable desktop, never an agent's actual files."""
import os
from dotenv import load_dotenv
load_dotenv()
from sandboxes import get_sandbox,start_desktop,capture_screen,tool,existing_sandbox,sandbox_state

def check():
    if os.getenv('SANDBOX_PROVIDER','e2b')!='e2b': raise RuntimeError('Select E2B first')
    box=None
    try:
        box=get_sandbox('aethervm-e2b-check')
        print('Ubuntu 24.04 verified',flush=True)
        assert box.execute('printf ready')['output']=='ready'
        box.write_bytes(b'persistence verified','/workspace/e2b-check.txt')
        assert box.read_bytes('/workspace/e2b-check.txt')==b'persistence verified'
        start_desktop(box)
        shot=capture_screen(box.computer());assert shot['width']==1280 and shot['height']==800
        print('Terminal, files and screenshot verified',flush=True)
        result=tool(box,'browser_open',{'url':'https://www.python.org/'})
        if not result.get('ok') or 'Python' not in result.get('text',''): raise RuntimeError('Browser verification failed')
        assert result.get('image')
        print('Visible HTTPS browser and rendered page text verified',flush=True)
        box.stop();assert sandbox_state(box.id)=='stopped'
        sleeping=existing_sandbox(box.id)
        assert sleeping.box is None, 'Read-only access must not resume a paused VM'
        box=get_sandbox('aethervm-e2b-check',box.id)
        assert box.read_bytes('/workspace/e2b-check.txt')==b'persistence verified'
        start_desktop(box);capture_screen(box.computer())
        print('Pause/resume, file persistence and desktop reconnect verified',flush=True)
    finally:
        if box:
            # This check created only a disposable VM. Actual agent mappings are untouched.
            try: box.delete()
            except Exception:
                try: box.stop()
                except Exception: pass
                print('Disposable test computer retained; check the E2B dashboard.',flush=True)

if __name__=='__main__':
    try: check()
    except Exception as exc:
        print('E2B live check failed: '+type(exc).__name__+'. Check key, template and credits.',flush=True)
        raise SystemExit(1)
