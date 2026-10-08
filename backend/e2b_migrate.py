"""Explicit non-destructive import of old Daytona /workspace files into E2B."""
import hashlib
import os
import shlex
import uuid

MAX_ARCHIVE=64*1024*1024

def import_workspace(old,new):
    from sandboxes import python_command
    archive='/tmp/aether-transfer-'+uuid.uuid4().hex+'.tar.gz'
    folder='/workspace/imports/daytona-'+hashlib.sha256(old.id.encode()).hexdigest()[:16]
    result=old.execute('tar -czf '+shlex.quote(archive)+' -C /workspace . && stat -c %s '+shlex.quote(archive))
    if result['exit_code']!=0: raise RuntimeError('Could not archive old files; original computer preserved')
    if int(result['output'].strip())>MAX_ARCHIVE: raise RuntimeError('Old workspace exceeds 64 MiB automatic import limit; original files preserved')
    data=old.read_bytes(archive)
    if len(data)>MAX_ARCHIVE: raise RuntimeError('Archive exceeds import limit')
    digest=hashlib.sha256(data).hexdigest()
    new.write_bytes(data,archive)
    result=new.execute(python_command(f'''import hashlib,tarfile
from pathlib import Path
p=Path({archive!r})
assert hashlib.sha256(p.read_bytes()).hexdigest()=={digest!r}
target=Path({folder!r})
assert not target.exists(), 'Import already exists; keep it and choose a manual destination'
target.mkdir(parents=True)
with tarfile.open(p) as t: t.extractall(target,filter='data')
print('Imported into',target)
'''))
    if result['exit_code']!=0: raise RuntimeError('Import incomplete; original files preserved and target not overwritten')
    return folder

if __name__=='__main__':
    os.environ['AETHERVM_MAINTENANCE']='true'
    import main
    from sandboxes import DaytonaSandbox,provider,record_provider
    if provider()!='e2b': raise SystemExit('Select the E2B provider before importing files.')
    with main.db() as c:
        rows=[dict(r) for r in c.execute('SELECT user,agent_id,sandbox FROM previous_workspaces ORDER BY created DESC')]
    seen=set();failed=0;done=0
    for row in rows:
        key=row['user']+':'+row['agent_id']
        if key in seen or record_provider(row['sandbox'])!='daytona': continue
        seen.add(key)
        with main.db() as c:
            active=c.execute("SELECT 1 FROM jobs WHERE user=? AND agent_id=? AND status='running'",(row['user'],row['agent_id'])).fetchone()
            removed=c.execute('SELECT 1 FROM removed_agents WHERE agent_id=?',(row['agent_id'],)).fetchone()
        if active or removed:
            print('Skipped a working or removed assistant.',flush=True);continue
        old=None
        try:
            with main.provision_file_lock(key):
                new=main.provision_workspace(key)
                old=DaytonaSandbox(key,row['sandbox'])
                print(import_workspace(old,new),flush=True)
                done+=1
        except Exception as exc:
            failed+=1;print('File import failed: '+type(exc).__name__+'. Original files preserved.',flush=True)
        finally:
            if old:
                try: old.stop()
                except Exception: pass
    print(f'Workspaces imported: {done}; incomplete: {failed}',flush=True)
    raise SystemExit(1 if failed else 0)
