import React from 'react';
import {View,Text,Pressable} from 'react-native';
import Svg,{Path} from 'react-native-svg';
const icons=['M3 10 12 3l9 7v11h-6v-7H9v7H3z','M8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M1 21v-3a7 7 0 0 1 14 0v3M16 4a4 4 0 0 1 0 7M18 14a6 6 0 0 1 5 6','M3 12h4l3-8 4 16 3-8h4','M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z'];
export default function BottomNavigation({selected,onSelect}: {selected:string;onSelect:(s:'home'|'agents'|'activity'|'settings')=>void}) {
 return <View style={{flexDirection:'row',backgroundColor:'#111315',paddingTop:8,paddingBottom:4}}>{(['home','agents','activity','settings'] as const).map((id,i)=><Pressable key={id} accessibilityRole="tab" accessibilityLabel={id[0].toUpperCase()+id.slice(1)} accessibilityState={{selected:selected===id}} onPress={()=>onSelect(id)} style={{flex:1,alignItems:'center',paddingVertical:10,gap:5}}><Svg width={22} height={22} viewBox="0 0 24 24"><Path d={icons[i]} fill="none" stroke={selected===id?'#ECEFF1':'#69737D'} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/></Svg><Text style={{fontSize:11,color:selected===id?'#ECEFF1':'#949CA4',textTransform:'capitalize'}}>{id}</Text></Pressable>)}</View>;
}
