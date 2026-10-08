import json
import shlex
from types import SimpleNamespace
import pytest
from test_api import main,client,token
from browser_tools import blocked,encode_result,error_category,failure,read_page,run_action
import sandboxes

@pytest.mark.parametrize('url',['file:///etc/passwd','data:text/html,test','https://user:secret@example.com','not a url'])
def test_invalid_navigation_is_rejected_before_launch(url):
    assert run_action('browse',{'url':url})['error_code']=='invalid_url'

@pytest.mark.parametrize('message,code',[
    ('page.goto: net::ERR_CERT_AUTHORITY_INVALID secret','certificate_error'),
    ('net::ERR_NAME_NOT_RESOLVED secret','dns_error'),
    ('net::ERR_CONNECTION_REFUSED secret','connection_error'),
    ("Executable doesn't exist secret",'dependencies_missing'),
    ('Timeout 25000ms exceeded secret','timeout'),
])
def test_errors_are_specific_without_returning_raw_private_messages(message,code):
    assert error_category(RuntimeError(message))==code
    assert 'secret' not in str(failure(code))

def test_reader_waits_and_empty_output_is_not_success():
    waited=[]
    page=SimpleNamespace(wait_for_function=lambda *a,**k:waited.append(k['timeout']),evaluate=lambda *a:dict(url='https://example.com',title='',text='',elements=[],links=[]))
    assert read_page(page)['error_code']=='empty_page' and waited==[7000]
    page.evaluate=lambda *a:dict(url='https://example.com',title='',text='Loading...',elements=[],links=[])
    assert read_page(page)['error_code']=='empty_page'
    assert blocked('Just a moment...','Verify you are human')
    assert not blocked('CAPTCHA research','This paper compares CAPTCHA designs.')

def test_command_output_is_structured_and_truncated_safely():
    result={'ok':True,'text':'x'*18000,'elements':[{'ref':str(i),'name':'x'*110} for i in range(60)],'links':[{'url':'https://example.com/'+('a'*400)} for _ in range(20)]}
    encoded=encode_result(result)
    assert len(encoded)<=22000 and json.loads(encoded)['ok']
    class Box:
        def execute(self,command):
            assert shlex.split(command)[:2]==['python3','-c']
            compile(shlex.split(command)[2],'<sandbox>','exec')
            return {'exit_code':0,'output':encoded}
    assert sandboxes.tool(Box(),'browse',{'url':"https://example.com/?q=';$(echo injected)"})==result

@pytest.mark.parametrize('execution',[{'exit_code':0,'output':''},{'exit_code':0,'output':'not JSON'},{'exit_code':0,'output':'[]'},{'exit_code':1,'output':'private traceback'}])
def test_missing_or_failed_browser_output_never_reports_success(execution):
    result=sandboxes.tool(SimpleNamespace(execute=lambda _:execution),'browse',{'url':'https://example.com'})
    assert result['ok'] is False and 'private traceback' not in str(result)

def test_visible_browser_returns_page_data_and_sdk_screenshot(monkeypatch):
    monkeypatch.setattr(sandboxes,'start_desktop',lambda _:None)
    monkeypatch.setattr(sandboxes,'capture_screen',lambda _:{'image':'png','width':1280,'height':800})
    box=SimpleNamespace(execute=lambda _:{'exit_code':0,'output':json.dumps({'ok':True,'text':'Real page','elements':[]})},computer=lambda:None)
    assert sandboxes.tool(box,'browser_open',{'url':'https://example.com'})=={'ok':True,'text':'Real page','elements':[],'image':'png','width':1280,'height':800}

@pytest.mark.parametrize('code,attempts',[('certificate_error',1),('dependencies_missing',2),('empty_page',2)])
def test_worker_stops_environment_failures_without_repetitive_tool_loop(monkeypatch,code,attempts):
    from google.genai import types
    from test_chat_progress import response,wait_done
    calls=[]
    monkeypatch.setattr(main,'workspace',lambda *a:SimpleNamespace(id='browser-test'))
    def action(*a): calls.append(a[1]);return failure(code)
    monkeypatch.setattr(main,'tool',action)
    monkeypatch.setattr(main.genai,'Client',lambda **k:SimpleNamespace(models=SimpleNamespace(generate_content=lambda **k:response(types.Part(function_call=types.FunctionCall(name='browse',args={'url':'https://example.com'},id='read')))),close=lambda:None))
    h=token();aid=client.post('/agents',headers=h,json={'name':'Browser guard'}).json()['id']
    job=client.post('/tasks',headers=h,json={'agent_id':aid,'prompt':'Read a website','api_key':'AIza-test-fixture-not-real'}).json()['id']
    done=wait_done(h,job)
    assert done['status']=='waiting' and len(calls)==attempts
    assert any(e['kind']=='attention' for e in done['events'])
    assert '24-step' not in str(done)

def test_blocked_headless_page_is_shown_for_user_handoff(monkeypatch):
    from google.genai import types
    from test_chat_progress import response,wait_done
    calls=[]
    monkeypatch.setattr(main,'workspace',lambda *a:SimpleNamespace(id='browser-test'))
    def action(*a):calls.append(a[1]);return failure('verification_required',needs_user_control=True)
    monkeypatch.setattr(main,'tool',action)
    monkeypatch.setattr(main.genai,'Client',lambda **k:SimpleNamespace(models=SimpleNamespace(generate_content=lambda **k:response(types.Part(function_call=types.FunctionCall(name='browse',args={'url':'https://example.com'},id='read')))),close=lambda:None))
    h=token();aid=client.post('/agents',headers=h,json={'name':'Browser handoff'}).json()['id']
    job=client.post('/tasks',headers=h,json={'agent_id':aid,'prompt':'Read website','api_key':'AIza-test-fixture-not-real'}).json()['id']
    assert wait_done(h,job)['status']=='waiting' and calls==['browse','browser_open']
