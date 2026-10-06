import React, {memo,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Platform,View,Pressable,StyleSheet} from 'react-native';
import {WebView} from 'react-native-webview';
import {MotionContext} from '../MotionContext';
import {appearance,Appearance,CharacterState} from './appearance';
import {characterHTML} from './runtime.generated';

function AetherCharacter({shape,material,variant=0,size=96,state='idle',interactive=false,visible=true,onReady}: Appearance & {variant?:number;size?:number;state?:CharacterState;interactive?:boolean;visible?:boolean;onReady?:()=>void}) {
 const motion=useContext(MotionContext),ref=useRef<WebView>(null),frame=useRef<any>(null);
 const [ready,setReady]=useState(false),[active,setActive]=useState(AppState.currentState!=='background'&&AppState.currentState!=='inactive'),[reaction,setReaction]=useState<CharacterState|null>(null),[rest,setRest]=useState<CharacterState>('idle');
 const idleSince=useRef(Date.now());
 const p=appearance({shape,material,avatar:variant});
 const success=['happy','proud','celebrate'].includes(state);
 const displayed=reaction || (state==='idle' || success ? rest : state);
 const payload=JSON.stringify({shape:p.shape,finish:p.finish,size,state:displayed,compact:size<=64,reduced:!motion,paused:!active||!visible});
 const source=useMemo(()=>({html:characterHTML}),[]);
 const readyCallback=useRef(onReady);readyCallback.current=onReady;
 useEffect(()=>{if(ready)readyCallback.current?.()},[ready]);
 useEffect(()=>{const sub=AppState.addEventListener('change',s=>setActive(s==='active'));return()=>sub.remove()},[]);
 useEffect(()=>{if(!ready)return; const script=`window.__aetherApply(${payload});true;`;if(Platform.OS==='web')frame.current?.contentWindow?.postMessage({aether:JSON.parse(payload)},'*');else ref.current?.injectJavaScript(script)},[payload,ready]);
 useEffect(()=>{if(!reaction)return;const t=setTimeout(()=>setReaction(null),1400);return()=>clearTimeout(t)},[reaction]);
 useEffect(()=>{
   idleSince.current=Date.now();
   setRest(success?state:'idle');
   const proud=setTimeout(()=>setRest('proud'),state==='celebrate'?2600:2147483647);
   const happy=setTimeout(()=>setRest('idle'),state==='celebrate'?4200:success?2600:0);
   const drowsy=setTimeout(()=>setRest('drowsy'),120000);
   const sleep=setTimeout(()=>setRest('sleeping'),240000);
   return()=>{clearTimeout(proud);clearTimeout(happy);clearTimeout(drowsy);clearTimeout(sleep)};
 },[state]);
 useEffect(()=>{if(active&&Date.now()-idleSince.current>240000&&state==='idle'){setRest('idle');setReaction('waking');idleSince.current=Date.now()}},[active,state]);
 useEffect(()=>{
   if(!motion||!active||!visible||!ready||!(state==='idle'||success))return;
   let t:ReturnType<typeof setTimeout>;
   const schedule=()=>{t=setTimeout(()=>{if(Date.now()-idleSince.current<120000){setReaction('bouncing');schedule()}},22000+Math.random()*22000)};
   schedule();return()=>clearTimeout(t);
 },[motion,active,visible,ready,state]);
 // Browser preview uses the same offline document as Android's WebView.
 const webHTML=useMemo(()=>characterHTML.replace('</body>',`<script>addEventListener('message',e=>{if(e.source===parent&&e.data?.aether)window.__aetherApply(e.data.aether)});</script></body>`),[]);
 const Wrapper=interactive?Pressable:View;
 return <Wrapper accessible accessibilityRole={interactive?'button':undefined} accessibilityLabel={`Aether, ${p.shape}, ${displayed}`} style={{width:size,height:size,flexShrink:0,overflow:'visible'}} onPress={(e:any)=>{e.stopPropagation();setRest('idle');setReaction(rest==='sleeping'?'waking':'bouncing');idleSince.current=Date.now()}}>
  {Platform.OS==='web' ? React.createElement('iframe',{ref:frame,srcDoc:webHTML,onLoad:()=>setReady(true),title:'Animated Aether',style:{border:0,width:size,height:size,background:'transparent',pointerEvents:'none'}}) :
   <WebView ref={ref} source={source} originWhitelist={['about:blank']} onMessage={e=>{if(e.nativeEvent.data==='ready')setReady(true)}} onLoadEnd={()=>setReady(true)} javaScriptEnabled scrollEnabled={false} overScrollMode="never" setSupportMultipleWindows={false} allowFileAccess={false} mixedContentMode="never" onShouldStartLoadWithRequest={r=>r.url==='about:blank'} style={{width:size,height:size,flex:0,backgroundColor:'transparent'}} containerStyle={{width:size,height:size,flex:0,backgroundColor:'transparent'}} pointerEvents="none" />}
 </Wrapper>;
}
export default memo(AetherCharacter);
