import React from 'react';
import {Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import AetherCharacter from './character/AetherCharacter';
import {MotionContext} from './MotionContext';
import {C} from '../design';
export default function StartupScreen({motion,onReady}:{motion:boolean;onReady:()=>void}) {
 return <MotionContext.Provider value={motion}><SafeAreaView style={{flex:1,backgroundColor:C.bg,alignItems:'center',justifyContent:'center'}}>
  <StatusBar style="light"/><View style={{marginBottom:20}}><AetherCharacter shape="blob" material="pearl" size={150} state="bouncing" onReady={onReady}/></View>
  <Text style={{color:C.text,fontSize:24,fontWeight:'600',letterSpacing:-.7}}>AetherVM</Text>
  <Text accessibilityRole="progressbar" style={{color:C.muted,fontSize:13,marginTop:12}}>Getting your Aethers ready…</Text>
 </SafeAreaView></MotionContext.Provider>;
}
