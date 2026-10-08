// Disposable local Ubuntu fixture; production WSS is mapped to a local CI WS endpoint.
import {createRequire} from 'node:module';import fs from 'node:fs';import assert from 'node:assert/strict';
import http from 'node:http';
const require=createRequire(import.meta.url),{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const config=JSON.parse(fs.readFileSync('stream-auth.json','utf8'));
const exported=fs.readFileSync('mobile/components/computer/live.generated.ts','utf8');
const html=JSON.parse(exported.slice(exported.indexOf('= ')+2).trim().replace(/;$/,''));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const p=await browser.newPage({viewport:{width:390,height:620}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('Viewer:',m.text().slice(0,400))});
await p.addInitScript(()=>{window.events=[];window.ReactNativeWebView={postMessage:s=>window.events.push(JSON.parse(s))};const Original=window.WebSocket;window.WebSocket=function(url,protocols){return new Original('ws://127.0.0.1:6080/websockify',protocols)};window.WebSocket.prototype=Original.prototype;Object.assign(window.WebSocket,{CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3})});
// A loopback origin is a secure context and is allowed to reach the local fixture.
// An opaque about:blank document triggers Chrome's local network protections.
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html.replace('connect-src wss://*.e2b.app','connect-src ws://127.0.0.1:6080'))});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
await p.goto(`http://127.0.0.1:${server.address().port}`);
await p.waitForFunction(()=>typeof window.__desktopApply==='function');
await p.evaluate(config=>window.__desktopApply({kind:'configure',config}),config);
try{await p.waitForFunction(()=>window.events.some(e=>e.kind==='connected'),{},{timeout:15000})}catch(e){console.log('Stream events:',await p.evaluate(()=>window.events));throw e}
assert.equal(await p.locator('canvas').count(),1);
const checksum=()=>p.locator('canvas').evaluate(c=>{const bytes=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let sum=0;for(let i=0;i<bytes.length;i+=4)sum=(sum+bytes[i]+bytes[i+1]*3+bytes[i+2]*5)>>>0;return sum});
const before=await checksum();await p.waitForTimeout(450);assert.notEqual(await checksum(),before,'Continuous frames redraw as the desktop changes');
await p.evaluate(()=>window.__desktopApply({kind:'cursor',events:[{id:1,x:500,y:300,kind:'click',actor:'agent'}]}));await p.waitForTimeout(180);
assert(await p.locator('#cursor').evaluate(c=>c.style.opacity==='1'&&!c.classList.contains('human')));
assert(await p.locator('#halo').evaluate(c=>c.classList.contains('pulse')));
await p.evaluate(()=>{const t=document.getElementById('touch');const point=new Touch({identifier:1,target:t,clientX:190,clientY:300});t.dispatchEvent(new TouchEvent('touchstart',{touches:[point],changedTouches:[point],bubbles:true,cancelable:true}));t.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[point],bubbles:true,cancelable:true}))});
assert(await p.evaluate(()=>window.events.some(e=>e.kind==='input'&&e.action==='click')),'Direct tap is input, no takeover');
await p.evaluate(()=>window.__desktopApply({kind:'trackpad',enabled:true}));await p.evaluate(()=>window.__desktopApply({kind:'recenter'}));assert(await p.evaluate(()=>window.events.some(e=>e.action==='move'&&e.x===640&&e.y===400)));
await p.screenshot({path:'live-stream-390.png'});
// Wrong credentials never display the computer.
await p.evaluate(config=>window.__desktopApply({kind:'configure',config:{...config,password:'invalid!'}}),config);await p.waitForFunction(()=>window.events.some(e=>e.kind==='error'),{},{timeout:15000});
assert.deepEqual(errors,[]);await browser.close();server.close();console.log('Live stream checks passed: authenticated RFB, continuous frames, blue cursor, click pulse, direct input, trackpad, wrong password rejected.');
