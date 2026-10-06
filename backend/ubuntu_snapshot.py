"""Run once on the configured server: python ubuntu_snapshot.py."""
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()
SNAPSHOT = 'aethervm-ubuntu-24-04-v1'

def ensure_snapshot():
    from daytona import Daytona, CreateSnapshotParams, Image, Resources
    from daytona.common.errors import DaytonaNotFoundError
    client = Daytona()
    try:
        snapshot = client.snapshot.get(SNAPSHOT)
    except DaytonaNotFoundError:
        print('Building Ubuntu 24.04 desktop snapshot. This first build takes several minutes.', flush=True)
        snapshot = client.snapshot.create(CreateSnapshotParams(
            name=SNAPSHOT, image=Image.from_dockerfile(Path(__file__).with_name('Dockerfile.ubuntu')),
            resources=Resources(cpu=2, memory=4, disk=10)), timeout=1200)
    state = str(snapshot.state).lower().split('.')[-1]
    if state != 'active':
        raise RuntimeError('Ubuntu snapshot is not active. Check the Daytona snapshot build before retrying.')
    print('Ubuntu desktop snapshot ready: '+SNAPSHOT, flush=True)

if __name__ == '__main__':
    try:
        ensure_snapshot()
        import sys
        if '--migrate-existing' in sys.argv:
            os.environ['AETHERVM_MAINTENANCE']='true'
            import main
            from sandboxes import start_desktop,capture_screen
            with main.db() as c:
                agents=[dict(r) for r in c.execute('SELECT user,id FROM agents WHERE id NOT IN (SELECT agent_id FROM removed_agents)')]
            checked=0;failed=0
            for agent in agents:
                key=agent['user']+':'+agent['id']
                if not main.workspace_record(key): continue
                with main.db() as c:
                    running=c.execute("SELECT 1 FROM jobs WHERE user=? AND agent_id=? AND status='running' LIMIT 1",(agent['user'],agent['id'])).fetchone()
                if running:
                    failed+=1
                    print('A computer is working; finish its task and rerun the update to verify it.',flush=True)
                    continue
                try:
                    box=main.workspace(key)
                    start_desktop(box)
                    capture_screen(box.computer())
                    checked+=1
                except Exception as exc:
                    failed+=1
                    print('Computer migration/check failed: '+type(exc).__name__+'. Original files preserved.',flush=True)
            print(f'Ubuntu computers verified: {checked}; incomplete: {failed}',flush=True)
            if failed: raise SystemExit(1)
    except Exception as exc:
        # Provider exceptions can contain headers; never print their raw text.
        print('Ubuntu snapshot setup failed: '+type(exc).__name__+'. Check Daytona credentials, build status and quota.', flush=True)
        raise SystemExit(1)
