/* VXSK V12.8.34 TURN credential broker.
   Deploy to CURRENT Supabase project after VXSK-V12.8.34-WEBRTC-TURN.sql.
   Secrets (set ONLY in Supabase Edge Functions): TWILIO_ACCOUNT_SID,
   TWILIO_AUTH_TOKEN. Users must have an active VXSK friend/group call.
   These credentials are never returned to unauthorized users. */
import { createClient } from 'npm:@supabase/supabase-js@2.117.1';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Cache-Control':'no-store'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  const authHeader=req.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(authHeader))return json({error:'Authentication required'},401);
  let body:unknown;
  try{body=await req.json();}catch(_){return json({error:'Invalid request'},400);}
  const value=body&&typeof body==='object'?body as Record<string,unknown>:{};
  const kind=value.kind,id=value.id;
  if((kind!=='friend'&&kind!=='group')||typeof id!=='string'||!uuid.test(id))return json({error:'Invalid call scope'},400);
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_ANON_KEY')||'';
  const sid=Deno.env.get('TWILIO_ACCOUNT_SID')||'';
  const token=Deno.env.get('TWILIO_AUTH_TOKEN')||'';
  if(!url||!key||!sid||!token)return json({error:'TURN service not configured'},503);
  const client=createClient(url,key,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
  const jwt=authHeader.replace(/^Bearer\s+/i,'');
  const {data:{user}={},error:authError}=await client.auth.getUser(jwt);
  if(authError||!user)return json({error:'Invalid login'},401);
  // SECURITY DEFINER SQL verifies live call membership and atomically rate-limits issuance.
  const {data:allowed,error:checkError}=await client.rpc('vxsk_turn_authorize',{p_kind:kind,p_id:id});
  if(checkError||allowed!==true)return json({error:'No active authorized call or rate limit reached'},403);
  try{
    const url=`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Tokens.json`;
    const response=await fetch(url,{
      method:'POST',headers:{Authorization:`Basic ${btoa(`${sid}:${token}`)}`,'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({Ttl:'7200'}),signal:AbortSignal.timeout(6000)
    });
    if(!response.ok)return json({error:'TURN provider unavailable'},502);
    const data=await response.json();
    const source=Array.isArray(data.ice_servers)?data.ice_servers:[];
    const servers=source.filter((s:unknown)=>{
      if(!s||typeof s!=='object')return false;
      const v=s as Record<string,unknown>;
      const urls=Array.isArray(v.urls)?v.urls:[v.urls];
      if(!urls.length||!urls.every(u=>typeof u==='string'&&/^(stun|turn|turns):\S+$/i.test(u)&&u.length<255))return false;
      return !urls.some(u=>/^turns?:/i.test(String(u)))||(typeof v.username==='string'&&typeof v.credential==='string');
    }).map((s:Record<string,unknown>)=>({urls:s.urls,username:s.username,credential:s.credential})).slice(0,10);
    if(!servers.some((s:{urls:string|string[]})=>(Array.isArray(s.urls)?s.urls:[s.urls]).some(u=>/^turns?:/i.test(u))))return json({error:'Provider returned no relay'},502);
    return json({iceServers:servers,expiresIn:7200});
  }catch(_){return json({error:'TURN provider request failed'},502);}
});
