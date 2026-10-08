"""Chat replies avoid VM startup; real progress survives interruption."""
import threading,time
from types import SimpleNamespace
import pytest
from google.genai import types
from test_api import client,token,main

def response(*parts):
    return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(role='model',parts=list(parts)))])

def wait_done(h,job):
    for _ in range(200):
        result=client.get('/tasks/'+job,headers=h).json()
        if result['status']!='running':return result
        time.sleep(.01)
    raise AssertionError('Task did not finish')

def test_greeting_does_not_wake_computer(monkeypatch):
    woke=[]
    monkeypatch.setattr(main,'workspace',lambda *a:woke.append(True))
    monkeypatch.setattr(main.genai,'Client',lambda **k:SimpleNamespace(models=SimpleNamespace(generate_content=lambda **k:response(types.Part(text='Hey!'))),close=lambda:None))
    h=token();aid=client.post('/agents',headers=h,json={'name':'Quick greeting'}).json()['id']
    job=client.post('/tasks',headers=h,json={'agent_id':aid,'prompt':'Hi!','api_key':'test-only-key'}).json()['id']
    assert wait_done(h,job)['status']=='done' and woke==[]
    assert [m['text'] for m in client.get('/messages?agent_id='+aid,headers=h).json()]==['Hi!','Hey!']

@pytest.mark.parametrize('fail',[False,True])
def test_progress_is_saved_before_tool_finishes_without_duplicate_final(monkeypatch,fail):
    entered=threading.Event();release=threading.Event();woke=[];generated=[]
    def generate(**kwargs):
        generated.append(True)
        if len(generated)==1:
            return response(types.Part(text='I’ll check the project.'),types.Part(function_call=types.FunctionCall(name='run_shell',args={'command':'pwd'},id='check')))
        if fail:raise RuntimeError('private-key-must-not-appear')
        return response(types.Part(text='The project is ready.'))
    def action(*args):
        entered.set();assert release.wait(3);return {'output':'/workspace','exit_code':0}
    monkeypatch.setattr(main.genai,'Client',lambda **k:SimpleNamespace(models=SimpleNamespace(generate_content=generate),close=lambda:None))
    monkeypatch.setattr(main,'workspace',lambda *a:(woke.append(True) or SimpleNamespace(id='progress-box')))
    monkeypatch.setattr(main,'tool',action)
    h=token();aid=client.post('/agents',headers=h,json={'name':'Progress'}).json()['id']
    job=client.post('/tasks',headers=h,json={'agent_id':aid,'prompt':'Check this','api_key':'test-only-key'}).json()['id']
    try:
        assert entered.wait(3)
        running=client.get('/tasks/'+job,headers=h).json()
        saved=client.get('/messages?agent_id='+aid,headers=h).json()
        assert running['status']=='running'
        assert [m['text'] for m in saved]==['Check this','I’ll check the project.']
        assert [e['message_id'] for e in running['events'] if e['kind']=='text']==[saved[-1]['id']]
    finally:release.set()
    done=wait_done(h,job)
    assert done['status']==('error' if fail else 'done') and woke==[True]
    expected=['Check this','I’ll check the project.']+([] if fail else ['The project is ready.'])
    assert [m['text'] for m in client.get('/messages?agent_id='+aid,headers=h).json()]==expected
    assert 'private-key' not in str(done)

def test_desktop_action_returns_updated_screen_in_same_call(monkeypatch):
    import sandboxes
    actions=[]
    cu=SimpleNamespace(mouse=SimpleNamespace(click=lambda x,y:actions.append((x,y))))
    box=SimpleNamespace(computer=lambda:cu)
    monkeypatch.setattr(sandboxes,'start_desktop',lambda b:None)
    monkeypatch.setattr(sandboxes,'capture_screen',lambda c:(actions.append('screen') or {'image':'png','width':1280,'height':800}))
    result=sandboxes.tool(box,'computer_click',{'x':20,'y':30})
    assert actions==[(20,30),'screen'] and result=={'ok':True,'image':'png','width':1280,'height':800}
