'use client';
import {useEffect,useState} from 'react';
import {Gem,X} from 'lucide-react';
export const fontOptions=[
 {id:'thmanyah',name:'ثمانية',family:'Thmanyah',description:'بسيط، واضح، وقريب من هويتك'},
 {id:'cairo',name:'كايرو',family:'Cairo',description:'هندسي ومتوازن للعمل اليومي'},
 {id:'messiri',name:'المسيري',family:'El Messiri',description:'طابع عربي أنيق وتفاصيل مميزة'},
];
export function Welcome({play,enabled,storeName}:{play:number;enabled:boolean;storeName:string}){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  if(!enabled||!play||window.matchMedia('(prefers-reduced-motion: reduce)').matches){setVisible(false);return}
  setVisible(true);const timer=window.setTimeout(()=>setVisible(false),3200);return()=>window.clearTimeout(timer);
 },[play,enabled]);
 if(!visible)return null;
 return <aside key={play} className="welcome-note" role="status" aria-live="polite" aria-label="ترحيب ياقوت"><div className="welcome-emblem"><Gem size={25}/><span className="welcome-glint">✦</span></div><div className="welcome-copy"><span>أهلاً بعودتك إلى ياقوت</span><strong>يوم جديد، وإنجازات أجمل.</strong><small>{storeName}</small></div><button className="icon-button" aria-label="إغلاق الترحيب" onClick={()=>setVisible(false)}><X size={16}/></button><span className="welcome-progress" aria-hidden="true"/></aside>
}
