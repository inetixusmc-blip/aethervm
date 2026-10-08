"""Runs inside the agent's Ubuntu sandbox, never on the API host.

The visible Chromium process survives tool calls; CDP listens on loopback only.
TLS verification stays enabled. Browser failures return categories, not traces.
"""
import json
import os
import subprocess
import shlex
import time
import re
import uuid
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import ProxyHandler, build_opener

ENDPOINT = 'http://127.0.0.1:9222'
ERRORS = {
    'certificate_error': 'The site certificate could not be verified. Do not bypass TLS checks or retry with insecure curl flags. Check the computer clock and trusted certificates.',
    'dns_error': 'The computer could not resolve this website hostname.',
    'connection_error': 'The computer could not connect to this website.',
    'timeout': 'The page did not finish loading within the browser time limit.',
    'dependencies_missing': 'The computer is missing the installed Playwright browser or its libraries. This needs a server/browser installation fix.',
    'browser_start_failed': 'The managed browser could not start or reconnect. Check the computer connection.',
    'empty_page': 'The page returned no readable content after waiting for rendering. This is not a successful page read.',
    'verification_required': 'The website requires human verification or is blocking automated access. Stop retries and request user control of the visible browser.',
    'stale_reference': 'This page control is no longer current. Read the page again and use a new control reference.',
    'invalid_url': 'Use a complete HTTP or HTTPS URL without embedded credentials.',
    'action_failed': 'The browser action failed. Read the current page before trying a different action.',
}

def failure(code, **extra):
    return {'ok': False, 'error_code': code, 'error': ERRORS[code], **extra}

def error_category(exc):
    # Inspect locally, but never return raw exception text/URLs/profile data.
    message = str(exc).lower()
    if 'err_cert_' in message or 'certificate_verify_failed' in message: return 'certificate_error'
    if 'err_name_not_resolved' in message: return 'dns_error'
    if any(s in message for s in ('err_connection_', 'err_internet_disconnected', 'err_proxy_connection', 'err_tunnel_connection')): return 'connection_error'
    if any(s in message for s in ('executable doesn\'t exist', 'missing dependencies', 'error while loading shared libraries', 'no module named', 'libnss3.so')): return 'dependencies_missing'
    if type(exc).__name__ == 'TimeoutError' or 'timeout' in message: return 'timeout'
    return 'action_failed'

def valid_url(url):
    try:
        p = urlparse(url)
        return p.scheme in ('http', 'https') and bool(p.hostname) and not p.username and not p.password
    except ValueError: return False

def blocked(title, text):
    title = title.lower().strip()
    text = text[:1200].lower()
    return (title in ('just a moment...', 'just a moment', 'access denied', 'verify you are human')
            or any(s in text for s in ('our systems have detected unusual traffic', 'verify you are human', 'please verify that you are human', 'checking your browser before accessing')))

SNAPSHOT = r'''(observation) => {
  const visible = e => !!e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  const map = {}; const elements = [];
  for (const e of document.querySelectorAll('a[href],button,input:not([type=hidden]),textarea,select,[role=button],[role=link],[contenteditable=true]')) {
    if (!visible(e) || elements.length >= 60) continue;
    const ref = observation + ':' + elements.length;
    map[ref] = e;
    const label = e.getAttribute('aria-label') || (e.labels && [...e.labels].map(l=>l.innerText).join(' ')) || e.getAttribute('placeholder') || e.innerText || e.getAttribute('title') || e.getAttribute('name') || e.tagName;
    elements.push({ref, role:e.getAttribute('role') || e.tagName.toLowerCase(), name:label.trim().slice(0,110)});
  }
  window.__aetherControls = map;
  const links = [...document.querySelectorAll('a[href]')].filter(visible).filter(e=>/^https?:/.test(e.href)).slice(0,20).map(e=>({text:(e.innerText || e.title || '').trim().slice(0,100),url:e.href.slice(0,400)}));
  return {url:location.href,title:document.title,text:(document.body?.innerText || '').trim().slice(0,12000),elements,links};
}'''

def read_page(page, wait=True):
    if wait:
        # DOMContentLoaded can precede hydration; wait for meaningful content.
        try:
            page.wait_for_function("() => {const t=(document.body?.innerText || '').trim(); return (t.length >= 20 && !/^(loading[. ]*|please wait[. ]*)$/i.test(t)) || !!document.querySelector('input:not([type=hidden]),textarea');}", timeout=7000)
        except Exception: pass
    result = page.evaluate(SNAPSHOT, uuid.uuid4().hex)
    if blocked(result['title'], result['text']):
        return failure('verification_required', needs_user_control=True, **result)
    if (not result['text'] or re.fullmatch(r'(loading[. ]*|please wait[. ]*)', result['text'], re.I)) and not result['elements']:
        return failure('empty_page', **result)
    return {'ok': True, **result}

def ready():
    try:
        # CDP itself is local: never route browser control through a proxy.
        with build_opener(ProxyHandler({})).open(ENDPOINT+'/json/version', timeout=.4) as r:
            return bool(json.load(r).get('webSocketDebuggerUrl'))
    except Exception: return False

def connect(p):
    if not ready():
        executable = p.chromium.executable_path
        if not Path(executable).is_file(): raise FileNotFoundError("Executable doesn't exist")
        # Keep the previous Chrome profile untouched. This profile persists per VM.
        Path('/workspace/.aether-browser').mkdir(exist_ok=True)
        with open('/tmp/aether-managed-browser.log', 'ab') as log:
            process = subprocess.Popen([executable, '--no-sandbox', '--no-first-run', '--no-default-browser-check',
                '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9222',
                '--user-data-dir=/workspace/.aether-browser', '--window-size=1280,760',
                '--disable-dev-shm-usage', 'about:blank'], stdout=log, stderr=log,
                env={**os.environ, 'DISPLAY': ':0'}, start_new_session=True)
        deadline = time.monotonic()+8
        while not ready() and time.monotonic()<deadline:
            if process.poll() is not None: raise RuntimeError('Browser start failed')
            time.sleep(.1)
        if not ready(): raise RuntimeError('Browser start failed')
    return p.chromium.connect_over_cdp(ENDPOINT, timeout=5000)

def active_page(browser):
    context = browser.contexts[0]
    pages = context.pages
    for page in reversed(pages):
        if page.evaluate('() => document.visibilityState === "visible"'): return page
    return pages[-1] if pages else context.new_page()

def run_action(action, args):
    if action in ('browse', 'browser_open') and not valid_url(str(args.get('url', ''))): return failure('invalid_url')
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            if action == 'browse':
                browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
                try:
                    page = browser.new_page()
                    response = page.goto(args['url'], wait_until='domcontentloaded', timeout=25000)
                    result = read_page(page)
                    # These references belong to a temporary browser that closes.
                    result.pop('elements', None)
                    if result.get('ok') and not result.get('text'): result.update(failure('empty_page'))
                    if response and response.status >= 400 and result.get('ok'):
                        result.update(ok=False, error_code='http_error', error='The website returned an HTTP error.', status=response.status)
                    return result
                finally: browser.close()
            browser = connect(p)
            page = active_page(browser)
            page.set_default_timeout(8000)
            page.set_default_navigation_timeout(25000)
            if action == 'browser_open':
                response = page.goto(args['url'], wait_until='domcontentloaded')
                page.bring_to_front()
                result = read_page(page)
                if response and response.status >= 400 and result.get('ok'):
                    result.update(ok=False, error_code='http_error', error='The website returned an HTTP error.', status=response.status)
                return result
            if action in ('browser_click', 'browser_type'):
                element = page.evaluate_handle('(ref) => window.__aetherControls?.[ref] || null', str(args.get('ref', ''))).as_element()
                if element is None or not element.evaluate('(e) => e.isConnected'): return failure('stale_reference')
                if action == 'browser_click': element.click()
                else:
                    element.fill(str(args.get('text', '')))
                    if args.get('submit'): element.press('Enter')
            elif action == 'browser_key': page.keyboard.press(str(args.get('key', 'Enter')))
            elif action != 'browser_read': return failure('action_failed')
            result=read_page(page)
            if action in ('browser_click','browser_type'):
                import subprocess,re
                try:
                    position=subprocess.check_output(['xdotool','getmouselocation','--shell'],text=True)
                    coords={k:int(v) for k,v in re.findall(r'^(X|Y)=(\d+)$',position,re.M)}
                    result['cursor']={'x':coords['X'],'y':coords['Y'],'kind':'click' if action=='browser_click' else 'move'}
                except Exception:pass
            return result
            # Do not close the persistent browser. Leaving Playwright disconnects.
    except Exception as exc:
        code = error_category(exc)
        if code == 'action_failed' and action not in ('browse', 'browser_click', 'browser_type', 'browser_key'):
            code = 'browser_start_failed'
        return failure(code)

def encode_result(result):
    # Sandbox command responses are capped at 24k characters. Always return valid JSON.
    while len(json.dumps(result, ensure_ascii=False)) > 22000:
        if len(result.get('text', '')) > 4000: result['text'] = result['text'][:-1000]
        elif result.get('links'): result['links'].pop()
        elif result.get('elements'): result['elements'].pop()
        else: break
    return json.dumps(result, ensure_ascii=False)

def browser_command(action, args):
    """Build a sandbox-only command that survives Ubuntu login-shell PATH resets."""
    source=Path(__file__).read_text()
    source+='\nprint(encode_result(run_action('+repr(action)+', json.loads('+repr(json.dumps(args))+'))))\n'
    bootstrap="""import os,sys
python=next((p for p in ['/opt/aethervm-venv/bin/python3','/home/daytona/.venv/bin/python3'] if os.path.isfile(p)),sys.executable)
cache=next((p for p in ['/opt/aethervm-browsers','/home/daytona/.cache/ms-playwright'] if os.path.isdir(p)),'')
if cache: os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH',cache)
os.execv(python,[python,'-c',SOURCE])
""".replace('SOURCE',repr(source))
    return 'python3 -c '+shlex.quote(bootstrap)
