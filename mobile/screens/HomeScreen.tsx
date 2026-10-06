import React,{useMemo,useState} from 'react';
import {View,Text,TextInput,Pressable,FlatList,StyleSheet} from 'react-native';
import AetherCharacter from '../components/character/AetherCharacter';
import ProfileImage from '../components/ProfileImage';
import {taskState} from '../components/character/appearance';
import {Icon} from '../ui';
import {C} from '../design';
export type HomeAgent={id:string;name:string;role:string;avatar:number;shape?:string;material?:string;preview?:string;last_activity?:number;job?:{id:string;status:string;created:number;control?:string;events?:any[]}|null};
function dateLabel(timestamp?:number){
 if(!timestamp)return '';
 const date=new Date(timestamp*1000),today=new Date();
 if(date.toDateString()===today.toDateString())return date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
 const yesterday=new Date(today);yesterday.setDate(today.getDate()-1);
 return date.toDateString()===yesterday.toDateString()?'Yesterday':date.toLocaleDateString([],{day:'numeric',month:'short'});
}
export default function HomeScreen({name,photo,agents,onOpen,onCreate,onAccount,mode='home'}:{name:string;photo?:string;agents:HomeAgent[];onOpen:(id:string)=>void;onCreate:()=>void;onAccount:()=>void;mode?:'home'|'agents'|'activity'}){
 const [searching,setSearching]=useState(false),[query,setQuery]=useState('');
 const items=useMemo(()=>agents.filter(a=>(mode!=='activity'||!!a.job)&&(!query.trim()||`${a.name} ${a.role} ${a.preview||''}`.toLowerCase().includes(query.trim().toLowerCase()))).sort((a,b)=>(b.last_activity||b.job?.created||0)-(a.last_activity||a.job?.created||0)),[agents,mode,query]);
 return <View style={s.page}>
  <View style={s.toolbar}>
   <Pressable onPress={onAccount} accessibilityRole="button" accessibilityLabel="Open account menu" style={s.profile}><ProfileImage name={name} photo={photo} size={44}/></Pressable>
   <View style={{flex:1}}/>
   <Pressable onPress={()=>{setSearching(!searching);setQuery('')}} accessibilityRole="button" accessibilityLabel={searching?'Close search':'Search agents'} style={s.action}><Icon name={searching?'close':'search'} size={23} color={C.text}/></Pressable>
   <Pressable onPress={onCreate} accessibilityRole="button" accessibilityLabel="Create Aether" style={s.action}><Icon name="plus" size={26} color={C.text}/></Pressable>
  </View>
  {searching&&<View style={s.search}><Icon name="search" size={18}/><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search your Aethers" accessibilityLabel="Search your Aethers" placeholderTextColor={C.subtle} style={s.searchInput}/></View>}
  {mode==='activity'&&<Text style={s.heading}>Activity</Text>}
  <FlatList data={items} keyExtractor={a=>a.id} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled" initialNumToRender={7} windowSize={5} renderItem={({item:a})=>{
   const status=a.job?.status,attention=['waiting','error','interrupted'].includes(status||'');
   const preview=status==='running'?'Working on your task…':status==='waiting'?'Needs your help':a.preview||a.role;
   return <Pressable onPress={()=>onOpen(a.id)} accessibilityRole="button" accessibilityLabel={`Open ${a.name}`} style={({pressed})=>[s.row,pressed&&{backgroundColor:C.surface}]}>
    <View style={s.character}><AetherCharacter shape={a.shape} material={a.material} variant={a.avatar} size={56} state={taskState(a.job)}/>{(attention||status==='running')&&<View style={[s.badge,{backgroundColor:attention?C.amber:C.green}]}><Icon name={attention?'alert':'spark'} size={10} color={C.bg}/></View>}</View>
    <View style={s.summary}><View style={s.rowTop}><Text numberOfLines={1} style={s.name}>{a.name}</Text><Text style={s.date}>{dateLabel(a.last_activity||a.job?.created)}</Text></View><Text numberOfLines={1} style={[s.preview,attention&&{color:C.amber}]}>{preview.replace(/\s+/g,' ').trim()}</Text></View>
   </Pressable>;
  }} ListEmptyComponent={<View style={s.empty}><Text style={s.emptyTitle}>{query?'No matches':mode==='activity'?'No tasks yet':'Meet your first Aether'}</Text><Text style={s.emptyText}>{query?'Try another name or keyword.':mode==='activity'?'Your recent work will appear here.':'Tap + to create a companion.'}</Text></View>}/>
 </View>;
}
const s=StyleSheet.create({page:{flex:1,width:'100%',maxWidth:760,alignSelf:'center'},toolbar:{paddingHorizontal:20,paddingTop:14,paddingBottom:20,flexDirection:'row',alignItems:'center',gap:10},profile:{width:46,height:46,borderRadius:23,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#414141'},action:{width:46,height:46,borderRadius:23,backgroundColor:'#262626',borderWidth:1,borderColor:'#404040',alignItems:'center',justifyContent:'center'},list:{paddingHorizontal:12,paddingBottom:30},row:{flexDirection:'row',alignItems:'center',gap:15,paddingHorizontal:8,paddingVertical:16,borderRadius:15},character:{width:56,height:56},badge:{position:'absolute',right:0,bottom:0,width:18,height:18,borderRadius:9,borderWidth:2,borderColor:C.bg,alignItems:'center',justifyContent:'center'},summary:{flex:1,minWidth:0},rowTop:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:5},name:{flex:1,color:C.text,fontSize:17,fontWeight:'600',letterSpacing:-.2},date:{color:'#777777',fontSize:12},preview:{color:'#949494',fontSize:15,lineHeight:21},search:{marginHorizontal:20,marginBottom:12,backgroundColor:C.surface,borderRadius:14,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10},searchInput:{flex:1,minHeight:48,color:C.text,fontSize:15},heading:{color:C.text,fontSize:26,fontWeight:'600',marginHorizontal:20,marginBottom:12},empty:{padding:24,paddingTop:48,alignItems:'center'},emptyTitle:{color:C.text,fontSize:18,fontWeight:'500',marginBottom:8},emptyText:{color:C.muted,fontSize:14}});
