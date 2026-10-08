export type AIProvider='gemini'|'vercel';
export type AIModel={id:string;name:string;description?:string};
export type GeminiModel=AIModel;
export const agentModels:AIModel[]=[
 {id:'gemini-3.8-flash',name:'Gemini 3.8 Flash',description:'Fast everyday work'},
 {id:'gemini-3.1-pro-preview',name:'Gemini 3.1 Pro',description:'Complex reasoning · preview'},
 {id:'gemini-2.5-flash',name:'Gemini 2.5 Flash',description:'Previous generation'},
 {id:'gemini-2.5-pro',name:'Gemini 2.5 Pro',description:'Previous generation reasoning'},
];
export const gatewayModels:AIModel[]=[
 {id:'anthropic/claude-sonnet-5.5',name:'Claude Sonnet 5.5',description:'Computer tools · image input'},
 {id:'anthropic/claude-sonnet-5',name:'Claude Sonnet 5',description:'Computer tools · image input'},
 {id:'openai/gpt-6.1-sol',name:'GPT 6.1 Sol',description:'Computer tools · image input'},
 {id:'openai/gpt-5.4',name:'GPT 5.4',description:'Computer tools · image input'},
 {id:'google/gemini-3.8-flash',name:'Gemini 3.8 Flash',description:'Computer tools · image input'},
 {id:'google/gemini-2.5-flash',name:'Gemini 2.5 Flash',description:'Computer tools · image input'},
];
export function detectProvider(key:string):AIProvider|undefined {
 const value=key.trim();return value.startsWith('vck_')?'vercel':value.startsWith('AIza')?'gemini':undefined;
}
export function providerLabel(key:string){return detectProvider(key)==='vercel'?'Vercel AI Gateway':detectProvider(key)==='gemini'?'Google Gemini':'AI provider';}
export function modelsForKey(key:string){return detectProvider(key)==='vercel'?gatewayModels:agentModels;}
export function curateModels(items:AIModel[],provider:AIProvider='gemini'){return (provider==='vercel'?gatewayModels:agentModels).filter(m=>items.some(i=>i.id===m.id));}
export function modelForKey(key:string,model:string){const choices=modelsForKey(key);return choices.some(m=>m.id===model)?model:choices[0].id;}
export function keyError(key:string){return detectProvider(key)?'':'Paste a Gemini key (AIza…) or Vercel AI Gateway key (vck_…). Vercel account tokens are not Gateway keys.';}
