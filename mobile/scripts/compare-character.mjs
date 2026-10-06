import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const upstream=process.env.GROKBOT_SOURCE || path.resolve(root,'../../grokbot-animation/component');
const vendored=path.join(root,'components/character/vendor');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)])}
for(const file of files(vendored)){if(!file.endsWith('.js'))continue;const relative=path.relative(vendored,file);assert.equal(fs.readFileSync(file,'utf8'),fs.readFileSync(path.join(upstream,relative),'utf8'),relative+' differs from source')}
class FakeStyle {
  setProperty(name, value) { this[name] = value; }
}

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.children = [];
    this.style = new FakeStyle();
    this.hidden = false;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  insertBefore(child) { this.children.push(child); return child; }
  remove() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 390 }; }
}

const nodes = {
  head: new FakeElement(),
  clip: new FakeElement(),
  transform: new FakeElement(),
  eyes: [new FakeElement(), new FakeElement()],
  morphHeads: [new FakeElement(), new FakeElement()],
  rings: Array.from({ length: 5 }, () => new FakeElement()),
  parts: Array.from({ length: 5 }, () => new FakeElement()),
  glyphs: Array.from({ length: 3 }, () => new FakeElement()),
  badge: new FakeElement(),
  particlesBack: new FakeElement(),
  particlesFront: new FakeElement(),
};

const svg = new FakeElement();
svg.dataset = {};
svg.querySelector = (selector) => ({
  "#head-path": nodes.head,
  "#head-clip-path": nodes.clip,
  "#bot-transform": nodes.transform,
  "#notify-badge": nodes.badge,
  "#particles-back": nodes.particlesBack,
  "#particles-front": nodes.particlesFront,
})[selector];
svg.querySelectorAll = (selector) => ({
  ".eye-path": nodes.eyes,
  ".morph-head": nodes.morphHeads,
  ".morph-ring": nodes.rings,
  ".morph-part": nodes.parts,
  ".morph-glyph": nodes.glyphs,
})[selector] || [];

globalThis.window = {
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = {
  documentElement: { addEventListener() {}, removeEventListener() {} },
  createElementNS: () => new FakeElement(),
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};


const generated=fs.readFileSync(path.join(root,'components/character/runtime.generated.ts'),'utf8');
const html=JSON.parse(generated.slice(generated.indexOf('= ')+2).trim().replace(/;$/,''));
const script=html.match(/<script>([\s\S]*)<\/script>/)[1].replaceAll('<\\/script','</script');
const seed=()=>{let n=0x5f3759df;return()=>((n=(1664525*n+1013904223)>>>0)/0x100000000)};
const host={set innerHTML(v){},querySelector:()=>svg};
let clock=0;
const nativeMath=Object.create(Math);nativeMath.random=seed();
const native=vm.createContext({Math:nativeMath,performance:{now:()=>clock},window:{addEventListener(){},removeEventListener(){}},document:{...globalThis.document,getElementById:()=>host},requestAnimationFrame:()=>0,cancelAnimationFrame(){},structuredClone,console,Map,Set});
native.globalThis=native;
vm.runInContext(script,native);
const bundled=native.window.__aetherEngine;
function record(e){return {snapshot:JSON.parse(JSON.stringify(e.getSnapshot())),head:e.head.getAttribute('d'),eyes:e.eyes.map(x=>[x.getAttribute('d'),x.getAttribute('transform')]),transform:e.transformGroup.getAttribute('transform'),rings:e.rings.map(x=>Object.fromEntries(x.attributes)),parts:e.parts.map(x=>Object.fromEntries(x.attributes)),glyphs:e.glyphs.map(x=>Object.fromEntries(x.attributes))}}
// Record the actual shipped document over successive state/shape transitions.
const {STATE_IDS,SHAPE_IDS,MORPH_BY_STATE}=await import(path.join(upstream,'catalog.js'));
const {ORIGINAL_STATE_DATA,EXPRESSIONS,SHAPES}=await import(path.join(upstream,'original-data.js'));
assert.equal(STATE_IDS.length,39);assert.equal(SHAPE_IDS.length,18);assert.equal(EXPRESSIONS.length,25);
assert.equal(SHAPES.blob.ring.length,96);assert.equal(EXPRESSIONS[0][0].length,48);
const traces=[];
for(const shape of SHAPE_IDS)for(const state of STATE_IDS){native.window.__aetherApply({state,shape,size:390,finish:{material:'solid',color:'#eef1f8',eyeColor:'#17203c'}});for(let f=0;f<36;f++){clock+=1000/60;bundled.frame(clock)}traces.push(record(bundled))}
// Reinitialize DOM and run the unmodified upstream engine with original defaults.
for(const value of Object.values(nodes)){for(const node of Array.isArray(value)?value:[value]){node.attributes.clear();node.hidden=false;}}
clock=0;Math.random=seed();globalThis.performance={now:()=>clock};
const {GrokBotEngine}=await import(path.join(upstream,'grok-bot-engine.js'));
let state='idle',shape='blob';
const config=()=>({...native.window.__aetherConfig(),shape,expressionPool:ORIGINAL_STATE_DATA.EXPRESSION_POOLS[state],expressionCadence:ORIGINAL_STATE_DATA.EXPRESSION_CADENCE[state],blinkCadence:ORIGINAL_STATE_DATA.BLINK_CADENCE[state]||null,morph:MORPH_BY_STATE[state]||'none'});
const original=new GrokBotEngine(svg,config);
let index=0;
for(const sh of SHAPE_IDS)for(const st of STATE_IDS){shape=sh;state=st;original.setState(state);for(let f=0;f<36;f++){clock+=1000/60;original.frame(clock)}assert.deepEqual(JSON.parse(JSON.stringify(record(original))),JSON.parse(JSON.stringify(traces[index++])),shape+'/'+state)}
console.log(`Source versus shipped runtime: ${index} shape/state transitions match exactly (25 eye poses, 96/48-point loops).`);
