import {GrokBotEngine} from './vendor/grok-bot-engine.js';
import {ORIGINAL_STATE_DATA} from './vendor/original-data.js';
import {STATE_IDS,SHAPE_IDS,MORPH_BY_STATE} from './vendor/catalog.js';
import {DEFAULT_MATERIAL} from './vendor/materials.js';
const reduced=window.__aetherReduce;
function svgTemplate(id) {
  const clipId = `${id}-head-clip`;
  return `
    <style>
      :host {
        --morph-bot-size: 96px;
        display: inline-grid;
        width: var(--morph-bot-size);
        height: var(--morph-bot-size);
        place-items: center;
        contain: layout style;
        vertical-align: middle;
      }
      svg {
        --fg: #0b0b0b;
        --bg: #fff;
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .grok-bot-mark__head,
      .morph-part { fill: var(--fg); }
      .grok-bot-mark__eye { fill: var(--bg); }
      .eye-path { transform-origin: 0 0; }
      .morph-ring { fill: none; stroke: var(--fg); }
      .morph-glyph { fill: var(--fg); }
      [hidden] { display: none !important; }
      @media (prefers-reduced-motion: reduce) {
        svg { transition: none; }
      }
    </style>
    <svg id="${id}" class="grok-bot-mark" data-state="idle" viewBox="-15 -15 259 259" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="${clipId}"><path id="head-clip-path"></path></clipPath></defs>
      <g id="particles-back" aria-hidden="true"></g>
      <path class="grok-bot-mark__head morph-head" hidden></path>
      <path class="grok-bot-mark__head morph-head" hidden></path>
      ${Array.from({ length: 5 }, () => '<circle class="morph-ring" cx="114.2705" cy="114.2705" r="0" hidden></circle>').join("")}
      ${Array.from({ length: 5 }, () => '<circle class="grok-bot-mark__head morph-part" cx="114.2705" cy="114.2705" r="0" hidden></circle>').join("")}
      ${Array.from({ length: 3 }, () => '<path class="morph-glyph" hidden></path>').join("")}
      <g id="bot-transform">
        <path id="head-path" class="grok-bot-mark__head"></path>
        <g clip-path="url(#${clipId})">
          <path class="grok-bot-mark__eye eye-path"></path>
          <path class="grok-bot-mark__eye eye-path"></path>
        </g>
        <circle id="notify-badge" cx="114.2705" cy="114.2705" r="0" hidden></circle>
      </g>
      <g id="particles-front" aria-hidden="true"></g>
    </svg>`;
}

// Same geometry template and state defaults as MorphBotElement; no remote assets.
const host=document.getElementById('character');
host.innerHTML=svgTemplate('aether-character');
const svg=host.querySelector('svg');
let props={state:'idle',shape:'blob',size:180,finish:{material:'solid',color:'#eef1f8',eyeColor:'#17203c'}};
function config(){
 const id=STATE_IDS.includes(props.state)?props.state:'idle';
 const blink=ORIGINAL_STATE_DATA.BLINK_CADENCE[id];
 return {...DEFAULT_MATERIAL,...props.finish,shape:props.shape,size:props.size,flipX:false,pointer:true,
 badgeColor:'#1d9bf0',badgeScale:1,
 expressionPool:ORIGINAL_STATE_DATA.EXPRESSION_POOLS[id],expressionWeights:{},
 expressionCadence:ORIGINAL_STATE_DATA.EXPRESSION_CADENCE[id],blinkCadence:blink||null,
 morph:MORPH_BY_STATE[id]||'none',headX:0,headY:0,headRotation:0,scaleX:1,scaleY:1,
 eyeOpen:1,eyeScale:1,gazeScale:1,motionScale:1,tempo:1,particlesEnabled:props.size>=80};
}
const engine=new GrokBotEngine(svg,config);
let halted=false;
window.__aetherApply=p=>{
 const previous=props.state; props={...props,...p};
 if(!STATE_IDS.includes(props.state))props.state='idle';
 if(!SHAPE_IDS.includes(props.shape))props.shape='blob';
 reduced.matches=!!props.reduced;
 engine.setPaused(!!props.paused);
 if(previous!==props.state)engine.setState(props.state);
 if(props.paused){cancelAnimationFrame(engine.frameId);halted=true;}
 else if(halted){halted=false;engine.lastTime=performance.now();engine.frameId=requestAnimationFrame(engine.boundFrame);}
};
window.__aetherEngine=engine;
window.__aetherConfig=config;
window.__aetherCatalog={states:STATE_IDS,shapes:SHAPE_IDS};
window.ReactNativeWebView?.postMessage('ready');
