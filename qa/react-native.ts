export * from 'react-native-web';
export function useWindowDimensions(){const p=new URLSearchParams(location.search);return {width:Number(p.get('width'))||window.innerWidth,height:Number(p.get('height'))||window.innerHeight,scale:1,fontScale:1};}

import React from 'react';
import {View} from 'react-native-web';
// Static document QA renders native modal contents inline, with the same dimensions.
export function Modal({children,visible=true}:any){return visible?React.createElement(View,{style:{position:'absolute',inset:0,zIndex:100}},children):null;}
