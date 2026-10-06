import React,{useRef,useState} from 'react';
import {FlatList,Pressable,Text,View} from 'react-native';
import AetherCharacter from './AetherCharacter';
import {Appearance,appearance,finishes,shapes} from './appearance';
export default function AppearancePicker({value,onChange}: {value:Appearance;onChange:(v:{shape:string;material:string})=>void}) {
 const selected=appearance(value);
 const [visible,setVisible]=useState<string[]>(shapes.slice(0,5));
 const onVisible=useRef(({viewableItems}:any)=>setVisible(viewableItems.map((v:any)=>v.item))).current;
 return <View>
  <FlatList horizontal onViewableItemsChanged={onVisible} data={[...shapes]} initialNumToRender={5} windowSize={3} showsHorizontalScrollIndicator={false} keyExtractor={s=>s} contentContainerStyle={{gap:4,paddingVertical:8}} renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={`${item} shape`} accessibilityState={{selected:selected.shape===item}} onPress={()=>onChange({shape:item,material:selected.finish.id})} style={{width:78,alignItems:'center',paddingVertical:8,borderRadius:18,backgroundColor:selected.shape===item?'#222629':'transparent'}}><AetherCharacter shape={item} visible={visible.includes(item)} material={selected.finish.id} size={64}/><Text style={{color:selected.shape===item?'#ECEFF1':'#949CA4',fontSize:12,marginTop:6,textTransform:'capitalize'}}>{item}</Text></Pressable>}/>
  <View style={{flexDirection:'row',justifyContent:'center',gap:8,marginVertical:18}}>{finishes.map(f=><Pressable key={f.id} accessibilityRole="button" accessibilityLabel={`${f.label} material`} accessibilityState={{selected:f.id===selected.finish.id}} onPress={()=>onChange({shape:selected.shape,material:f.id})} style={{width:42,height:44,justifyContent:'center',alignItems:'center',borderRadius:22,borderWidth:1,borderColor:f.id===selected.finish.id?'#ECEFF1':'transparent'}}><View style={{width:26,height:26,borderRadius:13,backgroundColor:f.color}}/></Pressable>)}</View>
  <Text style={{color:'#949CA4',textAlign:'center',fontSize:12,marginBottom:20}}>{selected.finish.label} · swipe to explore shapes</Text>
 </View>;
}
