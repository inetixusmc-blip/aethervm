import threading,time
from types import SimpleNamespace
from test_api import client,token,main

def test_removal_is_recoverable_and_cannot_access_archived_agent(monkeypatch):
    h=token();a=client.post('/agents',headers=h,json={'name':'Removable'}).json();aid=a['id']
    with main.db() as c:
        c.execute('INSERT INTO messages(user,role,text,agent_id,created) VALUES(?,?,?,?,?)',('local-dev','user','Keep my files',aid,1))
    assert client.delete('/agents/'+aid,headers=h).status_code==200
    assert aid not in [a['id'] for a in client.get('/agents',headers=h).json()]
    assert client.get('/messages?agent_id='+aid,headers=h).status_code==404
    assert aid in [a['id'] for a in client.get('/removed-agents',headers=h).json()]
    assert client.post('/agents/'+aid+'/restore',headers=h).status_code==200
    assert client.get('/messages?agent_id='+aid,headers=h).json()[0]['text']=='Keep my files'
    assert client.delete('/agents/other-agent',headers=h).status_code==404

def test_cannot_remove_working_agent():
    h=token();a=client.post('/agents',headers=h,json={'name':'Busy'}).json();lock=main.user_lock('local-dev:'+a['id'])
    lock.acquire()
    try:assert client.delete('/agents/'+a['id'],headers=h).status_code==409
    finally:lock.release()

def test_edit_latest_user_turn_is_scoped_and_replaces_answer(monkeypatch):
    h=token();a=client.post('/agents',headers=h,json={'name':'Editor'}).json();aid=a['id']
    with main.db() as c:
        for role,text in [('user','First'),('assistant','First answer'),('user','Last'),('assistant','Old answer')]:
            c.execute('INSERT INTO messages(user,role,text,agent_id,created) VALUES(?,?,?,?,?)',('local-dev',role,text,aid,1))
    msgs=client.get('/messages?agent_id='+aid,headers=h).json()
    payload={'prompt':'Edited last','api_key':'AIza-test-fixture-not-real','agent_id':aid,'edit_message_id':msgs[0]['id']}
    assert client.post('/tasks',headers=h,json=payload).status_code==409
    assert client.get('/messages?agent_id='+aid,headers=h).json()==msgs
    # No worker for this test: verify atomic submission and preserved earlier turns.
    monkeypatch.setattr(main.pool,'submit',lambda *args:None)
    payload['edit_message_id']=msgs[-2]['id']
    r=client.post('/tasks',headers=h,json=payload)
    assert r.status_code==200
    result=client.get('/messages?agent_id='+aid,headers=h).json()
    assert [m['text'] for m in result]==['First','First answer','Edited last']
    assert result[-1]['id']==msgs[-2]['id']
    main.cancelled.pop(r.json()['id']);main.user_lock('local-dev:'+aid).release();main.capacity.release()

def test_model_discovery_does_not_generate_and_excludes_specialist_models(monkeypatch):
    names=['gemini-3.8-flash','gemini-3.1-pro-preview','gemini-3.8-flash-tts','gemini-embedding-001','gemini-3.8-live','gemini-2.5-flash-image']
    def generate(**kwargs):raise AssertionError('Discovery must not generate')
    models=SimpleNamespace(list=lambda:[SimpleNamespace(name='models/'+n,supported_actions=['generateContent']) for n in names],generate_content=generate)
    monkeypatch.setattr(main.genai,'Client',lambda **kwargs:SimpleNamespace(models=models,close=lambda:None))
    r=client.post('/provider/models',headers=token(),json={'api_key':'AIza-test-fixture-not-real'})
    assert r.status_code==200
    assert [m['id'] for m in r.json()['models']]==names[:2]

def test_ubuntu_gate_checks_actual_release_and_keeps_legacy_box():
    import sandboxes
    import pytest
    ubuntu=SimpleNamespace(execute=lambda c:{'exit_code':0,'output':'ubuntu:24.04'})
    assert sandboxes.verify_ubuntu(ubuntu).os_name=='Ubuntu 24.04 LTS'
    debian=SimpleNamespace(execute=lambda c:{'exit_code':0,'output':'debian:13'})
    with pytest.raises(sandboxes.UbuntuRequired) as error:sandboxes.verify_ubuntu(debian)
    assert error.value.box is debian

def test_running_desktop_is_not_restarted(monkeypatch):
    import sandboxes
    starts=[]
    cu=SimpleNamespace(get_status=lambda:SimpleNamespace(status='running'),start=lambda:starts.append(True))
    box=SimpleNamespace(computer=lambda:cu,execute=lambda c:{'exit_code':0})
    sandboxes.start_desktop(box)
    assert starts==[] and box._desktop_started
