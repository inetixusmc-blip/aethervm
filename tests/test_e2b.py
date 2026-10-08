"""Provider SDK contract and preservation tests; no cloud credentials required."""
import base64
import inspect
import json
import shlex
import struct
from types import SimpleNamespace
import pytest
import e2b
import e2b_desktop
import e2b_provider as adapter
import sandboxes
from test_api import main,client,token

@pytest.fixture
def sdk(monkeypatch):
    monkeypatch.setenv('SANDBOX_PROVIDER','e2b');monkeypatch.setenv('E2B_API_KEY','e2b_test_not_real')
    calls=[]; files={};status={'state':'running'}
    remote=SimpleNamespace(sandbox_id='test-e2b',set_timeout=lambda seconds:calls.append(('timeout',seconds)),
        commands=SimpleNamespace(run=lambda command,**kw:(calls.append(('run',command,kw)) or SimpleNamespace(exit_code=0,stdout='ubuntu:24.04' if '/etc/os-release' in command else '',stderr=''))),
        files=SimpleNamespace(read=lambda p,**kw:files[p],write=lambda p,d:files.update({p:d})),
        screenshot=lambda:b'\x89PNG\r\n\x1a\n'+b'\0'*8+struct.pack('>II',1280,800),
        left_click=lambda **kw:calls.append(('click',kw)),write=lambda t,**kw:calls.append(('type',t)),
        move_mouse=lambda *args:calls.append(('move',args)),scroll=lambda **kw:calls.append(('scroll',kw)))
    monkeypatch.setattr(e2b_desktop.Sandbox,'create',lambda **kw:(calls.append(('create',kw)) or remote))
    monkeypatch.setattr(e2b_desktop.Sandbox,'connect',lambda sid,**kw:(calls.append(('connect',sid,kw)) or remote))
    monkeypatch.setattr(e2b.Sandbox,'get_info',lambda sid,**kw:SimpleNamespace(state=status['state']))
    monkeypatch.setattr(e2b.Sandbox,'pause',lambda sid,**kw:(calls.append(('pause',sid)) or status.update(state='paused')))
    monkeypatch.setattr(e2b.Sandbox,'kill',lambda sid,**kw:calls.append(('kill',sid)))
    adapter._cached.clear()
    yield calls,remote,files,status
    adapter._cached.clear()

def test_e2b_create_uses_custom_ubuntu_and_persistent_lifecycle(sdk):
    box=sandboxes.get_sandbox('private-user:agent')
    calls,remote,files,status=sdk
    assert box.id=='e2b:test-e2b' and box.os_name=='Ubuntu 24.04 LTS'
    opts=calls[0][1]
    assert opts['template']==adapter.TEMPLATE and opts['lifecycle']=={'on_timeout':'pause','auto_resume':False}
    assert opts['timeout']<3600 and opts['allow_internet_access']
    assert 'private-user' not in json.dumps(opts['metadata'])

def test_missing_key_never_creates_computer(monkeypatch):
    monkeypatch.delenv('E2B_API_KEY',raising=False)
    monkeypatch.setattr(e2b_desktop.Sandbox,'create',lambda **kw:pytest.fail('must not create'))
    with pytest.raises(adapter.E2BConfigurationError):adapter.E2BSandbox('user')

def test_file_roundtrip_screen_and_input(sdk):
    box=adapter.E2BSandbox('user');calls,remote,files,status=sdk
    box.write_bytes(b'unchanged','/workspace/test');assert box.read_bytes('/workspace/test')==b'unchanged'
    cu=box.computer();result=sandboxes.capture_screen(cu)
    assert result['width']==1280 and result['height']==800
    cu.mouse.click(12,34);cu.keyboard.type('hello');sandboxes.press_key(cu,"ctrl+l; $(touch /unsafe)")
    command=[x[1] for x in calls if x[0]=='run'][-1]
    source=shlex.split(command)[-1]
    assert shlex.split(source.removeprefix('cd /workspace && '))==['xdotool','key','--',"ctrl+l; $(touch /unsafe)"]
    cu.mouse.scroll(1,2,'down',3);assert calls[-1]==('scroll',{'direction':'down','amount':3})

def test_polling_never_resumes_or_renews_cached_vm(sdk):
    box=adapter.E2BSandbox('user');calls,remote,files,status=sdk
    for _ in range(3):sandboxes.existing_sandbox(box.id).computer()
    assert not [x for x in calls if x[0]=='connect']
    before=len([x for x in calls if x[0]=='timeout'])
    sandboxes.existing_sandbox(box.id).computer().get_status()
    assert len([x for x in calls if x[0]=='timeout'])==before
    box.stop();assert status['state']=='paused'
    assert sandboxes.sandbox_state(box.id)=='stopped'
    sleeping=sandboxes.existing_sandbox(box.id)
    with pytest.raises(RuntimeError):sleeping.computer()
    assert not [x for x in calls if x[0]=='connect']
    box=adapter.E2BSandbox('user',box.id)
    assert [x for x in calls if x[0]=='connect'][-1][1]=='test-e2b'

def test_sdk_recovery_connect_only_running_once(sdk):
    calls,remote,files,status=sdk
    for _ in range(3):sandboxes.existing_sandbox('e2b:test-e2b')
    connects=[x for x in calls if x[0]=='connect']
    assert len(connects)==1 and connects[0][2]['timeout']==1

def test_command_failure_retains_exit_and_output(sdk):
    from e2b.sandbox.commands.command_handle import CommandExitException
    box=adapter.E2BSandbox('user');calls,remote,files,status=sdk
    def run(*a,**k):raise CommandExitException(exit_code=17,stdout='partial',stderr='failed',error=None)
    remote.commands.run=run
    assert box.execute('false')=={'exit_code':17,'output':'partialfailed'}

def test_wrong_os_pauses_new_vm_instead_of_losing_files(sdk):
    calls,remote,files,status=sdk
    remote.commands.run=lambda *a,**k:SimpleNamespace(exit_code=0,stdout='debian:13',stderr='')
    with pytest.raises(sandboxes.UbuntuRequired):sandboxes.get_sandbox('user')
    assert ('pause','test-e2b') in calls and not [x for x in calls if x[0]=='kill']

def test_provider_ids_cannot_be_mixed(sdk):
    with pytest.raises(RuntimeError):sandboxes.get_sandbox('user','old-daytona-id')
    assert sandboxes.record_provider('old-daytona-id')=='daytona'
    assert sandboxes.record_provider('e2b:test-e2b')=='e2b'

def test_switch_preserves_old_mapping_until_e2b_created(monkeypatch,sdk):
    user='switch-user';aid='switch-agent';key=user+':'+aid
    with main.db() as c:c.execute('INSERT OR REPLACE INTO agent_workspaces VALUES(?,?,?)',(user,aid,'old-daytona-id'))
    calls=[]
    monkeypatch.setattr(main,'get_sandbox',lambda *a:(_ for _ in ()).throw(RuntimeError('not available')))
    with pytest.raises(RuntimeError):main.provision_workspace(key)
    assert main.workspace_record(key)['sandbox']=='old-daytona-id'
    monkeypatch.setattr(main,'get_sandbox',lambda scope,existing=None:(calls.append(existing) or SimpleNamespace(id='e2b:replacement')))
    monkeypatch.setattr(sandboxes,'existing_sandbox',lambda sid:SimpleNamespace(stop=lambda:calls.append(('stop',sid))))
    main.provision_workspace(key)
    assert calls==[None,('stop','old-daytona-id')]
    assert main.workspace_record(key)['sandbox']=='e2b:replacement'
    with main.db() as c:assert c.execute('SELECT sandbox FROM previous_workspaces WHERE user=? AND agent_id=?',(user,aid)).fetchone()['sandbox']=='old-daytona-id'
    main.provision_workspace(key);assert calls[-1]=='e2b:replacement'

def test_old_provider_screen_is_not_shown_after_switch(monkeypatch,sdk):
    h=token();a=client.post('/agents',headers=h,json={'name':'Provider test'}).json();aid=a['id']
    with main.db() as c:c.execute('INSERT OR REPLACE INTO agent_workspaces VALUES(?,?,?)',('local-dev',aid,'daytona-old'))
    assert client.get('/workspace/status?agent_id='+aid,headers=h).json()['state']=='not_created'
    monkeypatch.setattr(sandboxes,'existing_sandbox',lambda sid:pytest.fail('must not show old provider'))
    assert client.get('/workspace/screen?agent_id='+aid,headers=h).status_code==409

def test_live_sdk_arguments_and_template_match_pinned_sdk():
    from e2b_template import definition
    from e2b import Template
    data=json.loads(Template.to_json(definition()))
    assert data['fromImage']=='ubuntu:24.04'
    assert any('/opt/aethervm-venv' in ' '.join(step['args']) for step in data['steps'])
    assert {'template','resolution','display','timeout','lifecycle','allow_internet_access'}<=set(inspect.signature(e2b_desktop.Sandbox.create).parameters)
    assert {'timeout','request_timeout'}<=set(inspect.signature(e2b_desktop.Sandbox.connect).parameters) or 'opts' in inspect.signature(e2b_desktop.Sandbox.connect).parameters

def test_transfer_size_limit_preserves_source(monkeypatch):
    from e2b_migrate import import_workspace,MAX_ARCHIVE
    old=SimpleNamespace(id='original',execute=lambda c:{'exit_code':0,'output':str(MAX_ARCHIVE+1)},read_bytes=lambda p:pytest.fail('must not download'))
    new=SimpleNamespace(write_bytes=lambda *a:pytest.fail('must not replace files'))
    with pytest.raises(RuntimeError):import_workspace(old,new)

def test_switch_back_reuses_preserved_provider_vm(monkeypatch,sdk):
    user='rollback-user';aid='rollback-agent'
    with main.db() as c:
        c.execute('INSERT OR REPLACE INTO agent_workspaces VALUES(?,?,?)',(user,aid,'daytona-returned'))
        c.execute('INSERT INTO previous_workspaces VALUES(?,?,?,?)',(user,aid,'e2b:preserved',1))
    calls=[]
    monkeypatch.setattr(main,'get_sandbox',lambda key,existing:(calls.append(existing) or SimpleNamespace(id=existing)))
    monkeypatch.setattr(sandboxes,'existing_sandbox',lambda sid:SimpleNamespace(stop=lambda:None))
    box=main.provision_workspace(user+':'+aid)
    assert calls==['e2b:preserved'] and box.id=='e2b:preserved'

def test_legacy_workspace_import_checks_hash_and_avoids_overwrite():
    from e2b_migrate import import_workspace
    calls=[]
    old=SimpleNamespace(id='source-id',execute=lambda c:{'exit_code':0,'output':'3'},read_bytes=lambda p:b'old')
    new=SimpleNamespace(write_bytes=lambda data,path:calls.append(('upload',data,path)),execute=lambda command:(calls.append(('restore',command)) or {'exit_code':0}))
    target=import_workspace(old,new)
    assert target.startswith('/workspace/imports/daytona-')
    script=shlex.split(calls[-1][1])[2]
    assert 'sha256' in script and "filter='data'" in script and 'assert not target.exists()' in script
    assert calls[0][1]==b'old'
