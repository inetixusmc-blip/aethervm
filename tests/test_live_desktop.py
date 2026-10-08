"""Continuous stream authentication, automatic input arbitration, and real deletion."""
import json,threading,time,shlex
from types import SimpleNamespace
import pytest
from test_api import client,token,main
import sandboxes
from test_e2b import sdk
import e2b_provider as adapter

@pytest.fixture(autouse=True)
def isolated_database(monkeypatch,tmp_path):
    with main.db() as c:schema=[r['sql'] for r in c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    monkeypatch.setattr(main,'DB',str(tmp_path/'live.sqlite3'))
    with main.db() as c:c.executescript(';'.join(schema))

def agent(h,name='Live'):
    aid=client.post('/agents',headers=h,json={'name':name}).json()['id']
    with main.db() as c:c.execute('INSERT INTO agent_workspaces VALUES(?,?,?)',('local-dev',aid,'e2b:live-'+aid))
    return aid

def test_direct_input_needs_no_takeover_and_is_scoped(monkeypatch):
    h=token();aid=agent(h);calls=[]
    box=SimpleNamespace(pointer=lambda *a:calls.append(a),computer=lambda:SimpleNamespace())
    monkeypatch.setattr(sandboxes,'existing_sandbox',lambda sid:box)
    assert client.post('/workspace/input?agent_id='+aid,headers=h,json={'action':'click','x':0,'y':0}).status_code==200
    key='local-dev:'+aid
    assert calls==[('click',0,0,'left')]
    assert 0<main.control_until[key]-time.time()<=3
    event=client.get('/workspace/cursor?agent_id='+aid,headers=h).json()['events'][-1]
    assert event['actor']=='user' and event['x']==0
    assert client.get('/workspace/cursor?agent_id=not-owned',headers=h).status_code==404
    assert client.post('/workspace/input?agent_id=not-owned',headers=h,json={'action':'click'}).status_code==404

def test_drag_moves_hold_ai_and_release_restores_short_pause(monkeypatch):
    h=token();aid=agent(h);calls=[];key='local-dev:'+aid
    monkeypatch.setattr(sandboxes,'existing_sandbox',lambda sid:SimpleNamespace(pointer=lambda *a:calls.append(a),computer=lambda:SimpleNamespace()))
    for action in ['down','move']:
        assert client.post('/workspace/input?agent_id='+aid,headers=h,json={'action':action,'x':20,'y':30}).status_code==200
        assert main.control_until[key]-time.time()>7
    assert client.post('/workspace/input?agent_id='+aid,headers=h,json={'action':'up','x':40,'y':50}).status_code==200
    assert key not in main.manual_drag and main.control_until[key]-time.time()<=3
    assert [x[0] for x in calls]==['down','move','up']

def test_stream_is_authenticated_cached_and_never_puts_password_in_url(sdk):
    box=adapter.E2BSandbox('user');calls,remote,files,status=sdk
    remote.get_host=lambda port:f'{port}-test.e2b.app'
    adapter._streams.clear()
    result=box.stream();before=len(calls)
    assert box.stream()==result and len(calls)==before
    assert result['url']=='wss://6080-test.e2b.app/websockify' and len(result['password'])==8
    assert result['password'] not in result['url']
    command=[x[1] for x in calls if x[0]=='run'][-1]
    assert result['password'] not in command
    script=shlex.split(command)[-1]
    inner=shlex.split(script.removeprefix('cd /workspace && '))[-1]
    assert "'-viewonly'" in inner and "'-localhost'" in inner and "'-rfbauth'" in inner
    assert '-nopw' not in inner and result['password'].encode() in files['/tmp/aether-stream-secret']
    box.stop();assert box.raw_id not in adapter._streams

def test_stream_endpoint_never_provisions_or_leaks_key(monkeypatch):
    h=token();aid=agent(h);monkeypatch.setattr(main,'workspace',lambda *a:pytest.fail('must not provision'))
    monkeypatch.setattr(sandboxes,'existing_sandbox',lambda sid:SimpleNamespace(stream=lambda **kw:{'url':'wss://test.e2b.app/websockify','password':'temporary'}))
    result=client.post('/workspace/stream?agent_id='+aid,headers=h)
    assert result.status_code==200 and result.json()['password']=='temporary'
    assert client.post('/workspace/stream?agent_id='+aid).status_code in (401,403)

def test_cursor_sequence_is_bounded_private_and_no_cloud_access(monkeypatch):
    h=token();aid=agent(h);key='local-dev:'+aid
    monkeypatch.setattr(sandboxes,'existing_sandbox',lambda *a:pytest.fail('metadata must not touch cloud'))
    for n in range(100):main.cursor_event(key,n,n,'click')
    events=client.get('/workspace/cursor?agent_id='+aid+'&since=97',headers=h).json()['events']
    assert [e['id'] for e in events]==[98,99,100] and len(main.cursor_events[key])==80

def test_permanent_delete_removes_scoped_data_and_all_recorded_computers(monkeypatch):
    h=token();aid=agent(h,'Delete');other=agent(h,'Keep');calls=[]
    with main.db() as c:
        c.execute('INSERT INTO previous_workspaces VALUES(?,?,?,?)',('local-dev',aid,'daytona-previous',1))
        c.execute('INSERT INTO messages(user,role,text,agent_id) VALUES(?,?,?,?)',('local-dev','user','private',aid))
        c.execute('INSERT INTO skills VALUES(?,?,?,?,?)',('delete-skill','local-dev',aid,'Skill','Do it'))
    monkeypatch.setattr(sandboxes,'delete_sandbox',calls.append)
    result=client.delete('/agents/'+aid+'?permanent=true',headers=h)
    assert result.json()['deletion']=='complete' and set(calls)=={'e2b:live-'+aid,'daytona-previous'}
    with main.db() as c:
        for table in ('messages','skills','agent_workspaces','previous_workspaces'):
            assert c.execute('SELECT 1 FROM '+table+' WHERE agent_id=?',(aid,)).fetchone() is None
        assert c.execute('SELECT 1 FROM agents WHERE id=?',(aid,)).fetchone() is None
        assert c.execute('SELECT 1 FROM agents WHERE id=?',(other,)).fetchone()
    assert client.post('/agents/'+aid+'/restore',headers=h).status_code!=200
    assert client.delete('/agents/'+aid+'?permanent=true',headers=h).json()['deletion']=='complete'

def test_busy_deletion_cancels_then_cleans_newly_provisioned_computer(monkeypatch):
    h=token();aid=agent(h);key='local-dev:'+aid;job='delete-job-'+aid;lock=main.user_lock(key);lock.acquire();main.cancelled[job]=threading.Event();calls=[]
    with main.db() as c:c.execute('INSERT INTO jobs(id,user,status,events,agent_id) VALUES(?,?,?,?,?)',(job,'local-dev','running','[]',aid))
    monkeypatch.setattr(sandboxes,'delete_sandbox',calls.append)
    try:
        r=client.delete('/agents/'+aid+'?permanent=true',headers=h)
        assert r.json()['deletion']=='pending' and main.cancelled[job].is_set()
        assert aid not in [a['id'] for a in client.get('/agents',headers=h).json()]
        with main.db() as c:c.execute('INSERT INTO previous_workspaces VALUES(?,?,?,?)',('local-dev',aid,'e2b:finished-provisioning',1))
        assert calls==[]
    finally:lock.release()
    assert main.finish_agent_deletion(aid,'local-dev')
    assert set(calls)=={'e2b:live-'+aid,'e2b:finished-provisioning'}
    main.cancelled.pop(job)

def test_failed_cloud_delete_remains_retryable_and_unrestorable(monkeypatch):
    h=token();aid=agent(h)
    monkeypatch.setattr(sandboxes,'delete_sandbox',lambda sid:(_ for _ in ()).throw(RuntimeError('private key details')))
    r=client.delete('/agents/'+aid+'?permanent=true',headers=h)
    assert r.json()['deletion']=='pending' and 'private key' not in r.text
    assert client.post('/agents/'+aid+'/restore',headers=h).status_code==409
    with main.db() as c:assert 'private key' not in c.execute('SELECT error FROM agent_deletions WHERE agent_id=?',(aid,)).fetchone()['error']
    monkeypatch.setattr(sandboxes,'delete_sandbox',lambda sid:None)
    assert main.finish_agent_deletion(aid,'local-dev')

def test_delete_unknown_is_not_success_and_never_calls_provider(monkeypatch):
    monkeypatch.setattr(sandboxes,'delete_sandbox',lambda *a:pytest.fail('no access'))
    assert client.delete('/agents/not-owned?permanent=true',headers=token()).status_code==404
