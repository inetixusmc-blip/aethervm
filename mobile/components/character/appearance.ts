export const shapes = ['blob','pebble','bean','egg','squircle','tablet','capsule','cylinder','hex','gem','crystal','wedge','shield','dome','arch','cloud','teardrop','leaf'] as const;
export type Shape = typeof shapes[number];
export const states = ['idle','sleeping','waking','listening','thinking','searching','working','excited','surprised','suspicious','angry','drowsy','happy','curious','confused','bored','proud','shy','sad','laughing','scared','playful','celebrate','orbit','radar','progress','spawning','humming','loading','dictating','writing','sending','receiving','uploading','notifying','alerting','dragging','bouncing','powering-down'] as const;
export type CharacterState = typeof states[number];
export const finishes = [
  {id:'pearl', label:'Pearl', material:'solid', color:'#eef1f8', eyeColor:'#17203c'},
  {id:'mint', label:'Mint', material:'solid', color:'#27b98b', eyeColor:'#ffffff'},
  {id:'coral', label:'Coral', material:'solid', color:'#f9705c', eyeColor:'#ffffff'},
  {id:'ultraviolet', label:'Violet', material:'solid', color:'#705cff', eyeColor:'#ffffff'},
  {id:'blue-milk', label:'Blue milk', material:'gradient', gradientPreset:'blue-milk', color:'#f2f7fa', eyeColor:'#142544'},
  {id:'iridescent-orb', label:'Glass', material:'rainbow-glass', glassPreset:'iridescent-orb', color:'#3d80df', eyeColor:'#ffffff'},
] as const;
export type Appearance = {shape?: string; material?: string; avatar?: number};
export function appearance(a: Appearance = {}) {
  return {shape: shapes.includes(a.shape as Shape) ? a.shape as Shape : shapes[(a.avatar || 0) % shapes.length], finish: finishes.find(f=>f.id===a.material) || finishes[0]};
}
type Event = {kind:string; text?:string; name?:string; args?:Record<string,any>};
type Task = {status:string; control?:string; created?:number; events?:Event[]};
export function taskState(job?: Task | null): CharacterState {
  if (!job) return 'idle';
  if (job.control==='user' || job.status==='waiting') return 'notifying';
  if (job.status==='error' || job.status==='interrupted') return 'confused';
  if (job.status==='cancelled') return 'idle';
  if (job.status==='done') return (job.events?.filter(e=>e.kind==='tool'&&e.name==='write_file').length||0)>=3 ? 'celebrate' : 'happy';
  const e=job.events?.filter(e=>['status','tool','result','text','attention'].includes(e.kind)).at(-1);
  if (e?.kind==='attention') return 'notifying';
  if (e?.kind==='result') return 'thinking';
  if (e?.kind==='text') return 'receiving';
  if (e?.kind==='status') {
    if (/wak|start|load/i.test(e.text||'')) return 'loading';
    if (/background/i.test(e.text||'')) return 'humming';
    if (/stop|sleep/i.test(e.text||'')) return 'powering-down';
    return 'thinking';
  }
  switch(e?.name) {
    case 'browser_open': case 'browse': return 'searching';
    case 'write_file': case 'remember': return 'writing';
    case 'read_file': case 'computer_screenshot': return 'receiving';
    case 'request_user_control': return 'notifying';
    case 'run_shell': {
      const command=e.args?.command||'';
      if (/\b(curl|wget|git clone)\b/.test(command)) return 'receiving';
      if (/\b(scp|upload)\b/.test(command)) return 'uploading';
      return 'working';
    }
    default: return 'thinking';
  }
}
