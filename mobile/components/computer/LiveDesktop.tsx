import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Platform,View,StyleSheet,ActivityIndicator,Text} from 'react-native';
import {WebView} from 'react-native-webview';
import {desktopHTML} from './live.generated';
import {Api} from '../../types';
type Stream={url:string;password:string;width:number;height:number};
export default function LiveDesktop({stream,api,visible,trackpad,animations,command,onReady,onError}:{stream:Stream;api:Api;visible:boolean;trackpad:boolean;animations:boolean;command?:{kind:string;id:number};onReady:()=>void;onError:()=>void}){
 const native=useRef<WebView>(null),frame=useRef<any>(null),[ready,setReady]=useState(false),[live,setLive]=useState(false);
 const queue=useRef<any[]>([]),draining=useRef(false),last=useRef(0),mounted=useRef(true);
 const callbacks=useRef({onReady,onError});callbacks.current={onReady,onError};
 const apiRef=useRef(api);apiRef.current=api;
 useEffect(()=>{last.current=0},[api,stream.url]);
 const source=useMemo(()=>({html:desktopHTML}),[]);
 const apply=(payload:any)=>{if(Platform.OS==='web')frame.current?.contentWindow?.postMessage({desktopCommand:payload},'*');else native.current?.injectJavaScript(`window.__desktopApply(${JSON.stringify(payload)});true;`)};
 useEffect(()=>()=>{mounted.current=false;apply({kind:'close'})},[]);
 useEffect(()=>{if(ready&&visible){setLive(false);apply({kind:'configure',config:{...stream,reduced:!animations}})}else if(ready)apply({kind:'close'})},[ready,visible,stream]);
 useEffect(()=>{if(ready)apply({kind:'trackpad',enabled:trackpad})},[ready,trackpad]);
 useEffect(()=>{if(ready&&command)apply(command)},[ready,command]);
 useEffect(()=>{
   if(!ready||!visible)return;let alive=true,t:ReturnType<typeof setTimeout>;let initial=true;
   const poll=async()=>{try{const result=await api('/workspace/cursor?since='+last.current);if(alive&&result.events?.length){const events=initial?result.events.slice(-1):result.events;last.current=result.events.at(-1).id;apply({kind:'cursor',events})}initial=false}catch{}if(alive)t=setTimeout(poll,250)};poll();return()=>{alive=false;clearTimeout(t)};
 },[ready,visible,api]);
 const receive=(data:any)=>{
   if(data.kind==='ready')setReady(true);
   else if(data.kind==='connected'){setLive(true);callbacks.current.onReady()}
   else if(data.kind==='error'){setLive(false);callbacks.current.onError()}
   else if(data.kind==='input'){
     const {kind,...body}=data;
     // Never discard a mouse-up or click. Coalesce only queued movement.
     if(body.action==='move'&&queue.current.at(-1)?.action==='move')queue.current[queue.current.length-1]=body;
     else queue.current.push(body);
     if(!draining.current){
       draining.current=true;
       (async()=>{try{while(queue.current.length&&mounted.current){const next=queue.current.shift();try{await apiRef.current('/workspace/input','POST',next)}catch{callbacks.current.onError()}}}finally{draining.current=false}})();
     }
   }
 };
 useEffect(()=>{if(Platform.OS!=='web')return;const fn=(e:MessageEvent)=>{if(e.source===frame.current?.contentWindow&&e.data?.desktop)receive(e.data.desktop)};window.addEventListener('message',fn);return()=>window.removeEventListener('message',fn)},[]);
 return <View style={styles.stage} accessibilityLabel="Interactive live desktop">
   {Platform.OS==='web'?React.createElement('iframe',{ref:frame,srcDoc:desktopHTML,title:'Live Ubuntu desktop',style:{border:0,width:'100%',height:'100%',background:'#000'}}):<WebView ref={native} source={source} onMessage={e=>{try{receive(JSON.parse(e.nativeEvent.data))}catch{}}} originWhitelist={['about:blank']} onShouldStartLoadWithRequest={r=>r.url==='about:blank'} javaScriptEnabled scrollEnabled={false} bounces={false} overScrollMode="never" allowFileAccess={false} mixedContentMode="never" setSupportMultipleWindows={false} style={styles.stage}/>}
   {!live&&<View pointerEvents="none" style={styles.wait}><ActivityIndicator color="#8b929b"/><Text style={styles.caption}>Connecting live desktop…</Text></View>}
 </View>
}
const styles=StyleSheet.create({stage:{flex:1,backgroundColor:'#000'},wait:{...StyleSheet.absoluteFillObject,alignItems:'center',justifyContent:'center',gap:12},caption:{color:'#8b929b',fontSize:13}});
