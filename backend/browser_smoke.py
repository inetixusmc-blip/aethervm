"""Real headless + visible browser checks inside the disposable Ubuntu CI VM."""
import json
import ssl
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from browser_tools import browser_command

def run_action(action,args):
    # Match the cloud sandbox execute: login shell, then its bounded output channel.
    command='cd /workspace && '+browser_command(action,args)
    result=subprocess.run(['bash','-lc',command],capture_output=True,text=True,timeout=60)
    assert result.returncode==0, (action,result.stderr[-300:])
    return json.loads(result.stdout[:24000])

class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        if self.path == '/empty': body=''; code=200
        elif self.path == '/blocked': body='<title>Just a moment...</title>Verify you are human to continue.'; code=403
        elif self.path == '/missing': body='<title>Missing</title>This page does not exist.'; code=404
        elif self.path.startswith('/results'):
            body='<title>Results</title><h1>Search result verified</h1><p>'+self.path+'</p>';code=200
        else:
            body='''<title>Browser fixture</title><body>Loading...
<script>setTimeout(()=>document.body.innerHTML=`<h1>Rendered browser page</h1>
<form action="/results"><label>Search<input name="q" aria-label="Search"></label><button>Find</button></form>
<a href="/results?clicked=yes">Open result</a>`,250)</script></body>''';code=200
        self.send_response(code);self.send_header('Content-type','text/html');self.end_headers();self.wfile.write(body.encode())

server=ThreadingHTTPServer(('127.0.0.1',0),Fixture)
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
checks=[]
def check(label,result):
    assert result.get('ok'), (label,result)
    checks.append(label)
    return result

read=check('headless waits for hydration and returns content',run_action('browse',{'url':base}))
assert 'Rendered browser page' in read['text'] and read['links'][0]['url'].endswith('clicked=yes')
assert run_action('browse',{'url':base+'/empty'})['error_code']=='empty_page'
checks.append('empty page is a failure')
assert run_action('browse',{'url':base+'/missing'})['status']==404
assert run_action('browse',{'url':base+'/blocked'})['needs_user_control']
checks.append('HTTP failures and human verification are explicit')
opened=check('visible bundled Chromium opens without Chrome onboarding',run_action('browser_open',{'url':base}))
assert 'Rendered browser page' in opened['text']
old=next(e['ref'] for e in opened['elements'] if e['name']=='Search')
typed=check('browser fills a field and submits a search',run_action('browser_type',{'ref':old,'text':'simple task','submit':True}))
assert 'Search result verified' in typed['text'] and 'simple+task' in typed['url']
assert run_action('browser_type',{'ref':old,'text':'stale'})['error_code']=='stale_reference'
checks.append('stale controls cannot trigger a different action')
opened=check('visible process reconnects across independent calls',run_action('browser_open',{'url':base}))
link=next(e['ref'] for e in opened['elements'] if e['name']=='Open result')
clicked=check('browser clicks an observed link and returns new page',run_action('browser_click',{'ref':link}))
assert 'clicked=yes' in clicked['url']
assert clicked['cursor']['kind']=='click' and 0<=clicked['cursor']['x']<1280 and 0<clicked['cursor']['y']<800
assert typed['cursor']['kind']=='move' and typed['cursor']['x']!=clicked['cursor']['x']
checks.append('visible cursor follows actual browser controls')
read=check('read reconnects to the same browser page',run_action('browser_read',{}))
assert read['url']==clicked['url']
check('keyboard returns a fresh observation',run_action('browser_key',{'key':'Tab'}))

with tempfile.TemporaryDirectory() as directory:
    cert=Path(directory)/'cert.pem';key=Path(directory)/'key.pem'
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-keyout',str(key),'-out',str(cert)],check=True,capture_output=True)
    tls=ThreadingHTTPServer(('127.0.0.1',0),Fixture)
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(cert,key)
    tls.socket=context.wrap_socket(tls.socket,server_side=True)
    threading.Thread(target=tls.serve_forever,daemon=True).start()
    result=run_action('browse',{'url':'https://127.0.0.1:'+str(tls.server_port)})
    assert result['error_code']=='certificate_error',result
    checks.append('untrusted TLS certificates are rejected')
    tls.shutdown()

live=check('public HTTPS navigation with verified certificates',run_action('browse',{'url':'https://www.python.org/'}))
assert 'python' in live['title'].lower() and 'python' in live['text'].lower(), {k:live.get(k) for k in ('url','title','text')}
Path('/workspace/browser-checks.json').write_text(json.dumps(checks,indent=2))
subprocess.run(['scrot','/workspace/browser-desktop.png'],check=True)
print('Browser checks passed:',len(checks),'; rendered text, visible search/click, persistent reconnect, failures and TLS.')
server.shutdown()
