"""Fixed-host routing, native tool history, private credentials, and retries."""
import base64,json,threading
from types import SimpleNamespace
import httpx
import pytest
from google.genai import types
from test_api import main,client,token
from test_chat_progress import wait_done
from ai_provider import GatewayClient,ProviderError,detect_provider,GATEWAY_CATALOG

KEY='vck_test-fixture-never-a-real-secret'
MODEL=GATEWAY_CATALOG[0][0]

def catalog(mid=MODEL,**overrides):
    return {'id':mid,'type':'language','tags':['tool-use','vision'],
            'modalities':{'input':['text','image'],'output':['text']},**overrides}

def install(monkeypatch,handler):
    made=[]
    def create(key,provider,timeout):
        assert provider=='vercel' and key.strip()==KEY
        gateway=GatewayClient(key,timeout)
        gateway.http.close()
        gateway.http=httpx.Client(base_url='https://ai-gateway.vercel.sh/v1/',headers={'Authorization':'Bearer '+key.strip()},transport=httpx.MockTransport(handler),follow_redirects=False)
        made.append(gateway)
        return gateway
    monkeypatch.setattr(main,'make_model_client',create)
    return made

@pytest.mark.parametrize('key,provider',[(' '+KEY+' ','vercel'),('AIza-not-real','gemini')])
def test_detect_prefix_without_network(key,provider):assert detect_provider(key)==provider

@pytest.mark.parametrize('key',['sk-other-provider-key','vcp_vercel-account-token','unknown-test-key'])
def test_unknown_key_is_never_sent_to_a_provider(monkeypatch,key):
    monkeypatch.setattr(main,'make_model_client',lambda *a:pytest.fail('Unrecognized key was transmitted'))
    h=token()
    for path,body in [('/provider/models',{}),('/provider/test',{}),('/tasks',{'prompt':'Hi'})]:
        r=client.post(path,headers=h,json={'api_key':key,**body})
        assert r.status_code==400 and key not in r.text

@pytest.mark.parametrize('key,model',[(KEY,'gemini-3.8-flash'),('AIza-not-real',MODEL),(KEY,'other/chat-model')])
def test_provider_model_mismatch_is_rejected_before_job(key,model):
    assert client.post('/tasks',headers=token(),json={'api_key':key,'model':model,'prompt':'Hello'}).status_code==400

def test_catalog_filters_non_visual_and_non_tool_models_and_close_drops_key(monkeypatch):
    requests=[]
    def handler(r):
        requests.append(r)
        assert r.url.host=='ai-gateway.vercel.sh' and r.headers['Authorization']=='Bearer '+KEY
        return httpx.Response(200,json={'data':[catalog(),catalog(GATEWAY_CATALOG[1][0],tags=['vision']),catalog(GATEWAY_CATALOG[2][0],modalities={'input':['text'],'output':['text']}),catalog('other/image',type='image')]})
    made=install(monkeypatch,handler)
    r=client.post('/provider/models',headers=token(),json={'api_key':KEY})
    assert r.status_code==200 and r.json()['provider']=='vercel'
    assert [m['id'] for m in r.json()['models']]==[MODEL]
    assert [r.url.path for r in requests]==['/v1/models']
    assert 'Authorization' not in made[0].http.headers and made[0].http.is_closed

def test_connection_probes_real_auth_and_tools_with_provider_model(monkeypatch):
    payloads=[]
    def handler(r):
        if r.method=='GET':return httpx.Response(200,json={'data':[catalog()]})
        payloads.append(json.loads(r.content))
        return httpx.Response(200,json={'choices':[{'message':{'role':'assistant','content':'OK'}}]})
    install(monkeypatch,handler)
    r=client.post('/provider/test',headers=token(),json={'api_key':KEY,'model':'gemini-3.8-flash'})
    assert r.status_code==200 and r.json()['model_checked']==MODEL
    assert len(payloads)==2 and all(p['model']==MODEL for p in payloads)
    assert 'tools' not in payloads[0] and len(payloads[1]['tools'])==len(main.TOOLS.function_declarations)
    assert payloads[1]['tools'][0]['function']['parameters']['type']=='object'
    assert KEY not in str(payloads)

@pytest.mark.parametrize('code',[401,402,403,429,504])
def test_errors_are_provider_specific_and_do_not_echo_key(monkeypatch,code):
    def handler(r):
        if r.method=='GET':return httpx.Response(200,json={'data':[catalog()]})
        return httpx.Response(code,json={'error':{'message':KEY}})
    install(monkeypatch,handler)
    monkeypatch.setattr(main.time,'sleep',lambda *a:None)
    r=client.post('/provider/test',headers=token(),json={'api_key':KEY})
    assert r.status_code==400 and 'Vercel AI Gateway' in r.text and KEY not in r.text
    if code==402:assert 'credits' in r.text
    if code==504:assert 'not mean your API key is invalid' in r.text

def test_gateway_tool_round_keeps_ids_signature_screenshot_and_retries_only_model(monkeypatch):
    payloads=[];actions=[]
    original={'role':'assistant','content':'I’ll inspect the desktop.','reasoning_content':'opaque-provider-history',
        'tool_calls':[{'id':'call-1','type':'function','function':{'name':'computer_click','arguments':'{"x":20,"y":30}'},'extra_content':{'google':{'thought_signature':'opaque-signature'}}}]}
    def handler(r):
        payload=json.loads(r.content);payloads.append(payload)
        if len(payloads)==1:return httpx.Response(200,json={'choices':[{'message':original}]})
        if len(payloads)==2:return httpx.Response(504,json={'error':{'message':KEY}})
        return httpx.Response(200,json={'choices':[{'message':{'role':'assistant','content':'Done.'}}]})
    made=install(monkeypatch,handler)
    monkeypatch.setattr(main,'workspace',lambda *a:SimpleNamespace(id='ubuntu-test'))
    monkeypatch.setattr(main,'tool',lambda *a:(actions.append(a[1:]) or {'ok':True,'image':base64.b64encode(b'png-test').decode()}))
    monkeypatch.setattr(threading.Event,'wait',lambda self,timeout=None:self.is_set())
    h=token();aid=client.post('/agents',headers=h,json={'name':'Gateway test'}).json()['id']
    result=client.post('/tasks',headers=h,json={'agent_id':aid,'prompt':'Inspect desktop','api_key':KEY,'model':MODEL})
    assert result.status_code==200
    done=wait_done(h,result.json()['id'])
    assert done['status']=='done' and len(actions)==1 and len(payloads)==3
    messages=payloads[1]['messages']
    assert messages[-3]==original
    assert messages[-2]=={'role':'tool','tool_call_id':'call-1','content':'{"ok": true}'}
    assert messages[-1]['content'][0]['image_url']['url']=='data:image/png;base64,cG5nLXRlc3Q='
    assert payloads[1]==payloads[2] and KEY not in json.dumps(done)
    assert any('Vercel AI Gateway' in e.get('text','') for e in done['events'] if e['kind']=='status')
    assert [m['text'] for m in client.get('/messages?agent_id='+aid,headers=h).json()]==['Inspect desktop','I’ll inspect the desktop.','Done.']
    assert made[0].raw_content=={} and 'Authorization' not in made[0].http.headers

def test_gateway_greeting_does_not_start_vm(monkeypatch):
    install(monkeypatch,lambda r:httpx.Response(200,json={'choices':[{'message':{'role':'assistant','content':'Hi!'}}]}))
    monkeypatch.setattr(main,'workspace',lambda *a:pytest.fail('Greeting woke VM'))
    h=token();aid=client.post('/agents',headers=h,json={'name':'Gateway greeting'}).json()['id']
    r=client.post('/tasks',headers=h,json={'agent_id':aid,'prompt':'Hello','api_key':KEY,'model':MODEL})
    assert wait_done(h,r.json()['id'])['status']=='done'

def test_unexpected_value_error_cannot_leak_credentials():
    assert KEY not in main.task_error(ValueError(KEY),'model','vercel')
