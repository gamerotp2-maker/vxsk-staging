/* VXSK V12.8.33 — scoped cover images; this UI does not grant any privileges. */
'use strict';
(() => {
  const BUCKET='vxsk-event-covers';
  const validPath=path=>typeof path==='string' && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i.test(path);
  function url(api,path){
    if(!validPath(path) || !api?.storage)return '';
    const r=api.storage.from(BUCKET).getPublicUrl(path);
    return r?.data?.publicUrl||'';
  }
  function image(api,path,cls='vxsk-event-cover'){
    const src=url(api,path);if(!src)return null;
    const img=document.createElement('img');img.className=cls;img.alt='Event cover poster';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.src=src;
    img.onerror=()=>{const fallback=document.createElement('div');fallback.className='vxsk-poster-fallback';fallback.textContent='VXSK';img.replaceWith(fallback);};return img;
  }
  async function prepare(file){
    if(!file)return null;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose PNG, JPG or WebP.');
    if(file.size>3*1024*1024)throw Error('Image must be 3 MB or less.');
    const bitmap=await createImageBitmap(file);
    try{
      if(bitmap.width<280||bitmap.height<155)throw Error('Use an image at least 280 × 155 pixels.');
      const ratio=16/9;
      let w=bitmap.width,h=bitmap.height,sx=0,sy=0;
      if(w/h>ratio){const nw=h*ratio;sx=(w-nw)/2;w=nw;}
      else{const nh=w/ratio;sy=(h-nh)/2;h=nh;}
      const outW=Math.min(1440,Math.round(w)),outH=Math.round(outW/ratio);
      const canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;
      canvas.getContext('2d').drawImage(bitmap,sx,sy,w,h,0,0,outW,outH);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));
      if(!blob||blob.size>2*1024*1024)throw Error('Could not prepare a small poster. Try another image.');
      return blob;
    }finally{bitmap.close?.();}
  }
  function newUuid(){
    if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
    const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  async function upload(api,file){
    const {data:{user}={},error:authError}=await api.auth.getUser();
    if(authError||!user)throw Error('Please sign in first.');
    const blob=await prepare(file);
    const uuid=newUuid();const path=`${user.id}/${uuid}.webp`;
    const {error}=await api.storage.from(BUCKET).upload(path,blob,{contentType:'image/webp',upsert:false,cacheControl:'3600'});
    if(error)throw Error('Cover upload denied. Check V12.8.33 SQL + staff 2FA. ('+(error.message||error.statusCode||'storage')+')');
    return path;
  }
  async function discard(api,path){
    if(!validPath(path))return;
    try{await api.storage.from(BUCKET).remove([path]);}catch(_){/* old image may belong to another editor */}
  }
  function preview(input,holder,removeButton,previous=''){
    if(!holder)return;
    let objectUrl='';let removed=false;
    const paint=()=>{
      if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}
      holder.replaceChildren();let src='';
      if(input?.files?.[0]){objectUrl=URL.createObjectURL(input.files[0]);src=objectUrl;}
      else if(!removed&&previous)src=previous;
      if(src){const img=document.createElement('img');img.src=src;img.alt='Chosen event poster preview';holder.append(img);}
      else holder.textContent='No image selected · VXSK default card style';
    };
    const clear=()=>{removed=true;input.value='';paint();};
    input?.addEventListener('change',()=>{removed=false;paint();});
    removeButton?.addEventListener('click',clear);
    paint();
    return {set:(next)=>{previous=next||'';removed=false;input.value='';paint();},get removed(){return removed;},reset:()=>{previous='';removed=false;input.value='';paint();}};
  }
  window.VXSKCover=Object.freeze({BUCKET,validPath,url,image,prepare,upload,discard,preview});
})();
