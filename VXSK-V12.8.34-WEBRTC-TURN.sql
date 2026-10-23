-- VXSK V12.8.34 — CURRENT GITHUB PAGES SUPABASE PROJECT ONLY.
-- opzqnmahfgehaewgciwg · install before deploying vxsk-turn-credentials Edge Function.
-- Private tables stay private. RLS/revokes remain enforced; no roles are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.vxsk_turn_issuances (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vxsk_turn_issuances_actor_time ON public.vxsk_turn_issuances(actor,issued_at DESC);
ALTER TABLE public.vxsk_turn_issuances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vxsk_turn_issuances FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.vxsk_turn_authorize(p_kind text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid:=auth.uid(); ok boolean:=false;
BEGIN
 IF uid IS NULL OR p_id IS NULL OR p_kind NOT IN ('friend','group') THEN RETURN false; END IF;
 -- Accepted calls only: no tokens for an invitation that has not been accepted.
 IF p_kind='friend' THEN
  SELECT EXISTS(
   SELECT 1 FROM public.vxsk_friend_calls c
   WHERE c.id=p_id AND c.state='accepted' AND c.expires_at>now() AND uid IN (c.caller,c.callee)
     AND c.updated_at>now()-interval '12 hours'
     AND public.vxsk_friend_call_allowed(c.caller,c.callee)
  ) INTO ok;
 ELSE
  SELECT EXISTS(
   SELECT 1 FROM public.vxsk_group_call_presence p
   JOIN public.vxsk_group_members m ON m.group_id=p.group_id AND m.user_id=p.user_id AND m.status='active'
   WHERE p.group_id=p_id AND p.user_id=uid AND p.last_seen>now()-interval '75 seconds'
  ) INTO ok;
 END IF;
 IF NOT ok THEN RETURN false; END IF;
 -- Advisory transaction lock serializes concurrent requests from this user.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,9487));
 IF (SELECT count(*) FROM public.vxsk_turn_issuances x
      WHERE x.actor=uid AND x.issued_at>now()-interval '10 minutes') >= 12 THEN RETURN false; END IF;
 INSERT INTO public.vxsk_turn_issuances(actor) VALUES(uid);
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.vxsk_turn_authorize(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vxsk_turn_authorize(text,uuid) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
