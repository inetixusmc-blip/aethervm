import React from 'react';
import {Modal,View,Text,Pressable,ScrollView,useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {C} from '../design';
import {IconButton,Icon} from '../ui';
import ProfileImage from './ProfileImage';
import AetherCharacter from './character/AetherCharacter';
import SlideSurface from './SlideSurface';
import {Agent} from '../types';
export default function Sidebar({name,email,photo,agents,onClose,onHome,onOpen,onCreate,onSettings,onRemoved}:{name:string;email:string;photo:string;agents:Agent[];onClose:()=>void;onHome:()=>void;onOpen:(id:string)=>void;onCreate:()=>void;onSettings:()=>void;onRemoved:()=>void}){
 const {width}=useWindowDimensions();
 const item=(label:string,icon:string,action:()=>void)=><Pressable accessibilityRole="button" onPress={action} style={{flexDirection:'row',alignItems:'center',gap:14,padding:15,borderRadius:18}}><Icon name={icon} color={C.text}/><Text style={{color:C.text,fontSize:16}}>{label}</Text></Pressable>;
 return <Modal transparent animationType="none" onRequestClose={onClose}><View style={{flex:1,flexDirection:'row',backgroundColor:'#00000070'}}>
  <Pressable accessibilityLabel="Close sidebar" onPress={onClose} style={{position:'absolute',inset:0}}/>
  <SlideSurface from="left" style={{width:Math.min(width*.86,340),height:'100%',backgroundColor:'#1a1a1a',borderTopRightRadius:26,borderBottomRightRadius:26}}><SafeAreaView style={{flex:1,padding:16}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:10}}><ProfileImage name={name} photo={photo} size={44}/><View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={{color:C.text,fontSize:17,fontWeight:'600'}}>{name||'Your account'}</Text><Text numberOfLines={1} style={{color:C.muted,fontSize:12,marginTop:4}}>{email}</Text></View><IconButton name="close" label="Close sidebar" onPress={onClose}/></View>
   {item('Home','home',onHome)}{item('New assistant','plus',onCreate)}
   <Text style={{color:C.muted,fontSize:12,padding:15,paddingTop:26}}>YOUR ASSISTANTS</Text>
   <ScrollView style={{flex:1}}>{agents.map(a=><Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`Open ${a.name} from sidebar`} onPress={()=>onOpen(a.id)} style={{flexDirection:'row',gap:12,alignItems:'center',paddingVertical:10,paddingHorizontal:8}}><AetherCharacter shape={a.shape} material={a.material} size={36}/><Text numberOfLines={1} style={{color:C.text,fontSize:16,flex:1}}>{a.name}</Text></Pressable>)}</ScrollView>
   {item('Removed assistants','trash',onRemoved)}{item('Settings','settings',onSettings)}
  </SafeAreaView></SlideSurface>
 </View></Modal>;
}
