// Disposable local Ubuntu fixture; production WSS is mapped to a local CI WS endpoint.
import {createRequire} from 'node:module';import fs from 'node:fs';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const config=JSON.parse(fs.readFileSync('stream-auth.json','utf8'));
const exported=fs.readFileSync('mobile/components/computer/live.generated.ts','utf8');
const html=JSON.parse(exported.slice(exported.indexOf('= ')+2).trim().replace(/;$/,''));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const p=await browser.newPage({viewport:{width:390,height:620}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{window.events=[];window.ReactNativeWebView={postMessage:s=>window.events.push(JSON.parse(s))};const Original=window.WebSocket;window.WebSocket=class extends Original{constructor(url,protocols){super('ws://127.0.0.1:6080/websockify',protocols)}}});
await p.goto('about:blank');
await p.setContent(html.replace('connect-src wss://*.e2b.app','connect-src ws://127.0.0.1:6080'));
await p.waitForFunction(()=>typeof window.__desktopApply==='function');
await p.evaluate(config=>window.__desktopApply({kind:'configure',config}),config);
await p.waitForFunction(()=>window.events.some(e=>e.kind==='connected'),{},{timeout:15000});
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
assert.deepEqual(errors,[]);await browser.close();console.log('Live stream checks passed: authenticated RFB, continuous frames, blue cursor, click pulse, direct input, trackpad, wrong password rejected.');
