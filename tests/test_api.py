import os,sys,tempfile
os.environ['DB_PATH']=tempfile.mktemp(suffix='.sqlite3')
os.environ['DEV_AUTH']='true'
sys.path.insert(0,os.path.abspath('backend'))
from fastapi.testclient import TestClient
import main
client=TestClient(main.app)
def token(): return {'Authorization':'Bearer '+client.post('/auth/google',json={'id_token':'local-dev'}).json()['token']}
def test_auth_required(): assert client.get('/messages').status_code==403 or client.get('/messages').status_code==401
def test_login_logout():
    h=token(); assert client.get('/messages',headers=h).status_code==200
    assert client.post('/auth/logout',headers=h).status_code==200
    assert client.get('/messages',headers=h).status_code==401
def test_invalid_task():
    assert client.post('/tasks',headers=token(),json={'prompt':'','api_key':'short'}).status_code==422
def test_job_isolation():
    h=token()
    with main.db() as c:c.execute('INSERT INTO jobs(id,user,status,events,error) VALUES(?,?,?,?,?)',('private','someone-else','done','[]',None))
    assert client.get('/tasks/private',headers=h).status_code==404
    assert client.post('/tasks/private/cancel',headers=h).status_code==404
def test_tool_quotes():
    from sandboxes import tool
    class Box:
        def execute(self,command):self.command=command;return {'exit_code':0}
    box=Box(); tool(box,'write_file',{'path':'/workspace/a.txt','content':"x'; $(touch /host-file)"})
    import shlex
    assert shlex.split(box.command)[0:2]==['python3','-c']
    compile(shlex.split(box.command)[2],'<test>','exec')
def test_agent_loop(monkeypatch):
    import time
    from google.genai import types
    class Box:
        id='test-sandbox'
        def execute(self,c): return {'exit_code':0,'output':'hello'}
    class Models:
        count=0
        def generate_content(self,**kwargs):
            self.count+=1
            part=types.Part(function_call=types.FunctionCall(name='run_shell',args={'command':'echo hello'},id='call1')) if self.count==1 else types.Part(text='Created and checked your result.')
            return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(role='model',parts=[part]))])
    class Client:
        def __init__(self,**kwargs):self.models=Models()
        def close(self):pass
    monkeypatch.setattr(main,'workspace',lambda u:Box())
    monkeypatch.setattr(main.genai,'Client',Client)
    h=token(); r=client.post('/tasks',headers=h,json={'prompt':'Say hello','api_key':'test-key-not-real'})
    assert r.status_code==200
    for _ in range(100):
        result=client.get('/tasks/'+r.json()['id'],headers=h).json()
        if result['status']!='running':break
        time.sleep(.01)
    assert result['status']=='done'
    assert [e['kind'] for e in result['events']]==['status','status','status','tool','result','text']
    assert client.get('/messages',headers=h).json()[-1]['role']=='assistant'
def test_libsql_database_adapter(monkeypatch,tmp_path):
    import libsql,database
    actual=libsql.connect
    path=str(tmp_path/'remote.db')
    monkeypatch.setenv('TURSO_DATABASE_URL','libsql://test-host')
    monkeypatch.setenv('TURSO_AUTH_TOKEN','test-only')
    monkeypatch.setattr(libsql,'connect',lambda **kwargs:actual(path))
    with database.connect('unused') as c:
        c.executescript('CREATE TABLE things(id INTEGER PRIMARY KEY, value TEXT);')
        c.execute('INSERT INTO things(value) VALUES(?)',('persistent',))
    with database.connect('unused') as c:
        r=c.execute('SELECT * FROM things').fetchone()
        assert r['value']=='persistent' and r[0]==1
        assert dict(r)=={'id':1,'value':'persistent'}
def test_google_allowlist(monkeypatch):
    monkeypatch.setenv('DEV_AUTH','false')
    monkeypatch.setenv('GOOGLE_WEB_CLIENT_ID','web-client-id')
    monkeypatch.setenv('ALLOWED_GOOGLE_EMAILS','inetixus@gmail.com')
    monkeypatch.setattr(main.id_token,'verify_oauth2_token',lambda *a,**k:{'sub':'outsider','email':'outsider@example.com','email_verified':True})
    assert client.post('/auth/google',json={'id_token':'provider-id-token'}).status_code==403
    monkeypatch.setattr(main.id_token,'verify_oauth2_token',lambda *a,**k:{'sub':'owner','email':'inetixus@gmail.com','email_verified':True})
    assert client.post('/auth/google',json={'id_token':'provider-id-token'}).status_code==200

def test_agent_conversation_ownership():
    h=token()
    atlas=client.get('/agents',headers=h).json()[0]
    nova=client.post('/agents',headers=h,json={'name':'Nova','role':'Research','instructions':'Cite sources.','avatar':1}).json()
    with main.db() as c:
        c.execute('INSERT INTO messages(user,role,text,agent_id,created) VALUES(?,?,?,?,?)',('local-dev','user','Atlas only',atlas['id'],1))
        c.execute('INSERT INTO messages(user,role,text,agent_id,created) VALUES(?,?,?,?,?)',('local-dev','user','Nova only',nova['id'],2))
        c.execute('INSERT INTO agents VALUES(?,?,?,?,?,?,?,?)',('other-agent','other-user','Private','Research','Private',0,'',1))
    assert [m['text'] for m in client.get('/messages?agent_id='+nova['id'],headers=h).json()]==['Nova only']
    assert client.get('/messages?agent_id=other-agent',headers=h).status_code==404
    assert client.put('/agents/other-agent',headers=h,json={'name':'Nope'}).status_code==404
    assert client.post('/agents/other-agent/skills',headers=h,json={'name':'Nope','instructions':'Nope'}).status_code==404

def test_memory_and_skills_persist():
    h=token(); a=client.post('/agents',headers=h,json={'name':'Scout','memory':'Prefer primary sources'}).json()
    assert client.put('/agents/'+a['id'],headers=h,json={**a,'memory':'Use Italian'}).json()['memory']=='Use Italian'
    r=client.post('/agents/'+a['id']+'/skills',headers=h,json={'name':'Verify','instructions':'Run tests before reporting.'})
    assert r.status_code==200
    assert client.get('/agents/'+a['id']+'/skills',headers=h).json()[0]['instructions']=='Run tests before reporting.'

def test_control_blocks_agent_and_manual_input(monkeypatch):
    h=token()
    assert client.post('/workspace/input',headers=h,json={'action':'click','x':1,'y':1}).status_code==409
    assert client.post('/workspace/control',headers=h,json={'owner':'user'}).status_code==200
    assert client.post('/tasks',headers=h,json={'prompt':'Hello','api_key':'not-a-real-key'}).status_code==409
    assert client.post('/workspace/control',headers=h,json={'owner':'agent'}).status_code==200
    main.operation_lock(main.scope('local-dev')).acquire()
    try: assert client.post('/workspace/control',headers=h,json={'owner':'user'}).status_code==409
    finally: main.operation_lock(main.scope('local-dev')).release()

def test_read_only_status_never_provisions(monkeypatch):
    h=token()
    with main.db() as c:c.execute('DELETE FROM workspaces WHERE user=?',('local-dev',))
    monkeypatch.setattr(main,'workspace',lambda u:(_ for _ in ()).throw(AssertionError('Must not provision')))
    assert client.get('/workspace/status',headers=h).json()['state']=='not_created'

def test_workspace_path_validation():
    import pytest
    from fastapi import HTTPException
    for path in ('../secret','/etc/passwd','folder/../../secret'):
        with pytest.raises(HTTPException): main.file_path(path)
    assert main.file_path('src/auth.ts')=='/workspace/src/auth.ts'

def test_real_sdk_screenshot_shape():
    import base64,struct
    from types import SimpleNamespace
    from sandboxes import capture_screen
    data=b'\x89PNG\r\n\x1a\n'+b'\x00\x00\x00\x0dIHDR'+struct.pack('>II',1280,720)
    cu=SimpleNamespace(screenshot=SimpleNamespace(take_full_screen=lambda:SimpleNamespace(screenshot=base64.b64encode(data).decode())))
    assert capture_screen(cu)['width']==1280 and capture_screen(cu)['height']==720

def test_human_request_is_not_a_completed_task(monkeypatch):
    import time
    from google.genai import types
    class Box: id='test-sandbox'
    class Models:
        count=0
        def generate_content(self,**kwargs):
            self.count+=1
            assert self.count==1, 'A human handoff must stop further model calls'
            parts=[types.Part(function_call=types.FunctionCall(name='request_user_control',args={'reason':'Finish the website login.'},id='help1')),types.Part(function_call=types.FunctionCall(name='run_shell',args={'command':'echo should-not-run'},id='shell1'))]
            return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(role='model',parts=parts))])
    class Client:
        def __init__(self,**kwargs):self.models=Models()
        def close(self):pass
    monkeypatch.setattr(main,'workspace',lambda u:Box())
    monkeypatch.setattr(main.genai,'Client',Client)
    h=token(); r=client.post('/tasks',headers=h,json={'prompt':'Open my account','api_key':'test-key-not-real'})
    assert r.status_code==200
    for _ in range(100):
        result=client.get('/tasks/'+r.json()['id'],headers=h).json()
        if result['status']!='running':break
        time.sleep(.01)
    assert result['status']=='waiting'
    assert any(e['kind']=='attention' for e in result['events'])
    assert not any(e.get('name')=='run_shell' for e in result['events'])
    assert client.get('/messages',headers=h).json()[-1]['text']=='Finish the website login.'

def test_parameterless_tool_has_no_empty_object_schema():
    wire=main.TOOLS.model_dump(exclude_none=True,by_alias=True)
    declarations=wire.get('functionDeclarations',wire.get('function_declarations'))
    shot=next(d for d in declarations if d['name']=='computer_screenshot')
    assert 'parameters' not in shot

def test_provider_errors_are_specific_without_leaking_secrets():
    from types import SimpleNamespace
    key='private-test-key'
    quota=SimpleNamespace(code=429,message='quota exceeded '+key)
    assert 'quota' in main.task_error(quota,'model').lower()
    assert key not in main.task_error(quota,'model')
    schema=SimpleNamespace(code=400,message='function properties must be non-empty '+key)
    assert 'tool configuration' in main.task_error(schema,'model')
    assert '404' in main.task_error(SimpleNamespace(code=404,message=key),'model')
    assert key not in main.task_error(SimpleNamespace(code=400,message=key),'model')

def test_watch_running_computer_does_not_wait_for_agent_command(monkeypatch):
    from types import SimpleNamespace
    import sandboxes
    monkeypatch.setenv('SANDBOX_PROVIDER','daytona')
    with main.db() as c:c.execute('INSERT OR REPLACE INTO workspaces VALUES(?,?)',('local-dev','running-box'))
    starts=[]
    box=SimpleNamespace(box=SimpleNamespace(state='started'),execute=lambda c:{'exit_code':0,'output':'ubuntu:24.04'},computer=lambda:SimpleNamespace(start=lambda:starts.append(True)))
    monkeypatch.setattr(sandboxes,'existing_sandbox',lambda sid:box)
    h=token(); main.operation_lock(main.scope('local-dev')).acquire()
    try:
        r=client.post('/workspace/start',headers=h)
        assert r.status_code==200 and r.json()['control']=='agent'
    finally:main.operation_lock(main.scope('local-dev')).release()
    assert starts==[True]

def test_desktop_starts_once_per_task_box():
    from types import SimpleNamespace
    from sandboxes import start_desktop
    calls=[]
    cu=SimpleNamespace(start=lambda:calls.append('started'))
    box=SimpleNamespace(computer=lambda:cu)
    start_desktop(box); start_desktop(box)
    assert calls==['started']

def test_image_tool_response_preserves_signature_and_orders_response_first(monkeypatch):
    import time,base64
    from google.genai import types
    class Box:id='image-box'
    class Models:
        count=0
        def generate_content(self,**kw):
            self.count+=1
            if self.count==1:
                part=types.Part(function_call=types.FunctionCall(name='computer_screenshot',args={},id='img1'),thought_signature=b'opaque-signature')
            else:
                assert kw['contents'][-2].parts[0].thought_signature==b'opaque-signature'
                parts=kw['contents'][-1].parts
                assert parts[0].function_response.id=='img1'
                assert parts[1].inline_data.mime_type=='image/png'
                part=types.Part(text='I can see the computer.')
            return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(role='model',parts=[part]))])
    class Client:
        def __init__(self,**kw):self.models=Models()
        def close(self):pass
    monkeypatch.setattr(main,'workspace',lambda user:Box())
    monkeypatch.setattr(main,'tool',lambda *args:{'image':base64.b64encode(b'png').decode(),'width':64,'height':64})
    monkeypatch.setattr(main.genai,'Client',Client)
    h=token();r=client.post('/tasks',headers=h,json={'prompt':'See my desktop','api_key':'not-a-real-api-key'})
    for _ in range(100):
        result=client.get('/tasks/'+r.json()['id'],headers=h).json()
        if result['status']!='running':break
        time.sleep(.01)
    assert result['status']=='done'

def test_appearance_roundtrip_and_legacy_update():
    h=token()
    with main.db() as c:c.execute("DELETE FROM agents WHERE user='local-dev'")
    for shape in main.SHAPES:
        r=client.post('/agents',headers=h,json={'name':shape,'shape':shape,'material':'blue-milk'})
        assert r.status_code==200
        a=r.json()
        assert a['shape']==shape and a['material']=='blue-milk'
        edit=client.put('/agents/'+a['id'],headers=h,json={'name':'Renamed','avatar':2}).json()
        assert edit['shape']==shape and edit['material']=='blue-milk'
    assert client.post('/agents',headers=h,json={'name':'Bad','shape':'circle'}).status_code==422
    assert client.post('/agents',headers=h,json={'name':'Bad','material':'custom-secret'}).status_code==422

def test_four_workers_isolated_and_api_responsive(monkeypatch):
    import time,threading
    from google.genai import types
    with main.db() as c:c.execute("DELETE FROM agents WHERE user='local-dev'")
    h=token()
    agents=[client.post('/agents',headers=h,json={'name':'Worker '+str(i),'shape':main.SHAPES[i]}).json() for i in range(5)]
    all_entered=threading.Event();release=threading.Event();seen=[];guard=threading.Lock()
    class Box:
        def __init__(self,key):self.id=key
    def workspace(key):
        with guard:
            seen.append(key)
            if len(seen)==4:all_entered.set()
        assert release.wait(5)
        if key.endswith(agents[0]['id']):raise RuntimeError('isolated failure')
        return Box(key)
    class Models:
        count=0
        def generate_content(self,**kw):
            self.count+=1
            part=types.Part(function_call=types.FunctionCall(name='run_shell',args={'command':'pwd'},id='check')) if self.count==1 else types.Part(text='Verified done.')
            return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(role='model',parts=[part]))])
    class Client:
        def __init__(self,**kw):self.models=Models()
        def close(self):pass
    monkeypatch.setattr(main,'workspace',workspace);monkeypatch.setattr(main.genai,'Client',Client)
    monkeypatch.setattr(main,'tool',lambda *args:{'output':'/workspace','exit_code':0})
    jobs=[]
    try:
        for a in agents[:4]:
            r=client.post('/tasks',headers=h,json={'agent_id':a['id'],'prompt':'Do work','api_key':'test-only-key'})
            assert r.status_code==200;jobs.append(r.json()['id'])
        assert all_entered.wait(2), 'All four must execute concurrently'
        start=time.monotonic();assert client.get('/health').status_code==200
        assert client.get('/agents',headers=h).status_code==200
        assert time.monotonic()-start<1
        assert len(set(seen))==4
        assert client.post('/tasks',headers=h,json={'agent_id':agents[4]['id'],'prompt':'Fifth','api_key':'test-only-key'}).status_code==429
        assert client.post('/tasks',headers=h,json={'agent_id':agents[1]['id'],'prompt':'Duplicate','api_key':'test-only-key'}).status_code==409
    finally:release.set()
    deadline=time.monotonic()+3
    while time.monotonic()<deadline:
        results=[client.get('/tasks/'+j,headers=h).json() for j in jobs]
        if all(r['status']!='running' for r in results):break
        time.sleep(.01)
    assert [r['status'] for r in results]==['error','done','done','done']
    keys=[main.scope('local-dev',a['id']) for a in agents]
    assert client.post('/workspace/control?agent_id='+agents[0]['id'],headers=h,json={'owner':'user'}).status_code==200
    assert main.user_controls(keys[0]) and not main.user_controls(keys[1])
    client.post('/workspace/control?agent_id='+agents[0]['id'],headers=h,json={'owner':'agent'})
