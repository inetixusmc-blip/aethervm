import React from 'react';
const memory:Record<string,string>={'onboarding-v4':'done',settings:JSON.stringify({url:'https://aethervm-api.onrender.com',model:'gemini-2.5-flash',key:'qa-fixture-key',animations:true}),session:'qa-fixture',name:'Workspace preview',email:'preview@example.test',agent:'atlas'};
export const getItemAsync=async(k:string)=>window.location.search.includes('login')?null:k==='onboarding-v4'&&location.search.includes('onboarding')?null:k==='google-photo'&&location.search.includes('photo')?'https://profile.example.test/avatar.svg':memory[k]||null;
export const setItemAsync=async(k:string,v:string)=>{memory[k]=v;};export const deleteItemAsync=async(k:string)=>{delete memory[k];};
export const StatusBar=()=>null;
export const GoogleSignin={configure:()=>{},getCurrentUser:()=>null,hasPlayServices:async()=>true,signIn:async()=>({type:'cancelled'}),signOut:async()=>{}};
export const isSuccessResponse=(r:any)=>r.type==='success';
export const setStringAsync=async(s:string)=>{await navigator.clipboard.writeText(s);};
export const getDocumentAsync=async()=>({canceled:true});
export const readAsStringAsync=async()=>'';export const writeAsStringAsync=async()=>{};export const cacheDirectory='';export const EncodingType={Base64:'base64'};
export const isAvailableAsync=async()=>false;export const shareAsync=async()=>{};

export const WebView=()=>null;
