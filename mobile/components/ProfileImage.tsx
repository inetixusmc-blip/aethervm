import React,{useEffect,useState} from 'react';
import {Image,Text,View} from 'react-native';
import {C} from '../design';
export default function ProfileImage({photo,name,size=44}:{photo?:string;name:string;size?:number}) {
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[photo]);
 const valid=!!photo&&/^https:\/\//i.test(photo);
 return <View style={{width:size,height:size,borderRadius:size/2,overflow:'hidden',backgroundColor:C.raised,alignItems:'center',justifyContent:'center'}}>
  {valid&&!failed?<Image source={{uri:photo}} onError={()=>setFailed(true)} accessibilityLabel="Google account profile photo" style={{width:size,height:size}}/>:<Text accessibilityLabel="Account initial" style={{color:C.text,fontSize:size*.4,fontWeight:'500'}}>{name.trim().charAt(0).toUpperCase()||'A'}</Text>}
 </View>;
}
