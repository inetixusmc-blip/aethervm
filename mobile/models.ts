export type GeminiModel={id:string;name:string;description?:string};
// Available immediately; account discovery filters this without generating a request.
export const agentModels:GeminiModel[]=[
 {id:'gemini-3.8-flash',name:'Gemini 3.8 Flash',description:'Fast everyday work'},
 {id:'gemini-3.1-pro-preview',name:'Gemini 3.1 Pro',description:'Complex reasoning · preview'},
 {id:'gemini-2.5-flash',name:'Gemini 2.5 Flash',description:'Previous generation'},
 {id:'gemini-2.5-pro',name:'Gemini 2.5 Pro',description:'Previous generation reasoning'},
];
export function curateModels(items:GeminiModel[]){return agentModels.filter(m=>items.some(i=>i.id===m.id));}
