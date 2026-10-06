"""Failure recovery must not repeat executed computer actions or leak keys."""
from types import SimpleNamespace
import threading
import pytest
from google.genai.errors import ServerError, ClientError
from test_api import main


def api_error(code):
    cls = ServerError if code >= 500 else ClientError
    return cls(code, {'error': {'code': code, 'message': 'private-test-key'}})


def test_transient_generation_retries_without_replaying_tool(monkeypatch):
    import time
    from google.genai import types
    from test_api import client, token
    calls = []
    class Box: id = 'retry-box'
    class Models:
        count = 0
        def generate_content(self, **kwargs):
            self.count += 1
            if self.count in (1,3): raise api_error(503)
            if self.count == 2:
                part = types.Part(function_call=types.FunctionCall(name='run_shell',args={'command':'echo once'},id='once'))
            else: part = types.Part(text='Done.')
            return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(role='model',parts=[part]))])
    model = Models()
    class Client:
        def __init__(self, **kwargs):
            assert kwargs['http_options'].retry_options.attempts == 1
            self.models = model
        def close(self): pass
    monkeypatch.setattr(main.genai,'Client',Client)
    monkeypatch.setattr(main,'workspace',lambda key:Box())
    monkeypatch.setattr(main,'tool',lambda *args:(calls.append(args[1]) or {'ok':True}))
    monkeypatch.setattr(main.random,'uniform',lambda *args:0)
    # Make waits immediate while retaining real cancellation behavior.
    monkeypatch.setattr(threading.Event,'wait',lambda self,timeout=None:self.is_set())
    h = token()
    response = client.post('/tasks',headers=h,json={'prompt':'Run one command','api_key':'test-not-a-real-key'})
    for _ in range(200):
        result = client.get('/tasks/'+response.json()['id'],headers=h).json()
        if result['status'] != 'running': break
        time.sleep(.01)
    assert result['status'] == 'done'
    assert calls == ['run_shell']
    assert model.count == 4
    assert sum('Retrying' in e.get('text','') for e in result['events']) == 2
    assert 'private-test-key' not in str(result)


@pytest.mark.parametrize('code',[400,401,403,404,429])
def test_non_transient_errors_do_not_retry(monkeypatch,code):
    calls = []
    def generate(**kwargs): calls.append(True); raise api_error(code)
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    with pytest.raises(ClientError): main.generate_with_retries(client)
    assert len(calls) == 1


def test_retry_limit_and_safe_final_error(monkeypatch):
    calls = []
    monkeypatch.setattr(main.time,'sleep',lambda seconds:None)
    def generate(**kwargs): calls.append(True); raise api_error(500)
    with pytest.raises(ServerError) as result:
        main.generate_with_retries(SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    assert len(calls) == 3
    assert '(500)' in main.task_error(result.value,'model')
    assert 'private-test-key' not in main.task_error(result.value,'model')


def test_cancel_during_retry_stops_next_request(monkeypatch):
    event = threading.Event()
    main.cancelled['retry-cancel-test'] = event
    calls = []
    def generate(**kwargs): calls.append(True); event.set(); raise api_error(503)
    monkeypatch.setattr(main,'emit',lambda *args:None)
    try:
        with pytest.raises(RuntimeError,match='cancelled'):
            main.generate_with_retries(SimpleNamespace(models=SimpleNamespace(generate_content=generate)), 'retry-cancel-test')
        assert len(calls) == 1
    finally: del main.cancelled['retry-cancel-test']


def test_wallpaper_is_valid_png(tmp_path):
    from desktop_theme import wallpaper
    import struct,zlib
    target = tmp_path/'wallpaper.png'
    wallpaper(target,64,40)
    data = target.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II',data[16:24]) == (64,40)
    offset = 8
    compressed = bytearray()
    while offset < len(data):
        size = struct.unpack('>I',data[offset:offset+4])[0]
        kind = data[offset+4:offset+8]
        content = data[offset+8:offset+8+size]
        assert zlib.crc32(kind+content) & 0xffffffff == struct.unpack('>I',data[offset+8+size:offset+12+size])[0]
        if kind == b'IDAT': compressed.extend(content)
        offset += 12+size
    pixels = zlib.decompress(compressed)
    assert len(pixels) == (64*3+1)*40
    assert pixels[36*193+1+4*3:36*193+1+4*3+3] != pixels[4*193+1+60*3:4*193+1+60*3+3]


def test_desktop_theme_failure_keeps_computer_available(monkeypatch):
    import sandboxes
    calls = []
    box = SimpleNamespace(computer=lambda:SimpleNamespace(start=lambda:calls.append(True)),execute=lambda command: {'exit_code':1})
    sandboxes.start_desktop(box)
    sandboxes.start_desktop(box)
    assert calls == [True]
    assert box._desktop_started and not box._desktop_theme_ready
