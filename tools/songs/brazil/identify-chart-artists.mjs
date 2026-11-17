import {join} from 'node:path';
import {CACHE_DIR,readJson,writeJson,USER_AGENT} from '../lib.mjs';
const recordings=await readJson(join(CACHE_DIR,'br','chart-pilot-recordings.json'));
const path=join(CACHE_DIR,'br','chart-pilot-artists.json');const cache=await readJson(path,{});
for(const id of new Set(Object.values(recordings).flatMap(x=>x.recordings.flatMap(r=>r.artistIds)))){
 if(cache[id])continue;
 await new Promise(r=>setTimeout(r,1600));
 try{
  let response;
  for(let attempt=0;attempt<4;attempt++){
   response=await fetch(`https://musicbrainz.org/ws/2/artist/${id}?fmt=json`,{headers:{'User-Agent':USER_AGENT},signal:AbortSignal.timeout(20000)});
   if(response.ok||![429,503].includes(response.status))break;
   await new Promise(r=>setTimeout(r,2500*2**attempt));
  }
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  let a=await response.json();cache[id]={mbid:id,name:a.name,type:a.type,country:a.country??null,area:a.area?.name??null,sourceUrl:`https://musicbrainz.org/artist/${id}`,checkedAt:new Date().toISOString()};
  await writeJson(path,cache);console.log(a.name,a.country??a.area?.name??'UNKNOWN');
 }catch(e){console.error(id,e.message)}
}
