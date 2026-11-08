/** Bounded, foreground diagnostic burst. No recurring task or background schedule. */
export function validSeriesCount(value:unknown):boolean{return value===undefined||(typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=5)}
export async function runPushSeries(count:number,send:(index:number)=>Promise<void>,clock:{now:()=>number;sleep:(ms:number)=>Promise<void>}={now:()=>Date.now(),sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 let previousStart:number|null=null;
 for(let index=1;index<=count;index++){
  if(previousStart!==null){const remaining=5000-(clock.now()-previousStart);if(remaining>0)await clock.sleep(remaining)}
  previousStart=clock.now();await send(index);
 }
}
