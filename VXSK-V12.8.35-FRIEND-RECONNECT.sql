-- VXSK V12.8.35 — current GitHub Pages Supabase project only.
-- Target project ID: opzqnmahfgehaewgciwg
-- Safe: no existing friend links, chat history, blocks or roles are removed.
-- When a user DECLINES an invitation, only that user can initiate a new
-- invitation to the former requester; the rejected sender cannot retry it.
BEGIN;
CREATE OR REPLACE FUNCTION public.vxsk_social_request(p_peer uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
 IF uid IS NULL OR p_peer IS NULL OR uid=p_peer THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.vxsk_social_profiles WHERE user_id=uid) OR
    NOT EXISTS(SELECT 1 FROM public.vxsk_social_profiles p JOIN auth.users u ON u.id=p.user_id
      WHERE p.user_id=p_peer AND u.email_confirmed_at IS NOT NULL) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.vxsk_social_blocks b WHERE
   (b.blocker=uid AND b.blocked=p_peer) OR (b.blocker=p_peer AND b.blocked=uid)) THEN RETURN false; END IF;
 -- Old row may persist after rejection; count fresh initiations by latest update.
 IF (SELECT count(*) FROM public.vxsk_social_links l
      WHERE l.requested_by=uid AND l.updated_at>now()-interval '1 day')>=20 THEN RETURN false; END IF;
 INSERT INTO public.vxsk_social_links(user_low,user_high,requested_by,status)
 VALUES(least(uid,p_peer),greatest(uid,p_peer),uid,'pending')
 ON CONFLICT (user_low,user_high) DO UPDATE
   SET requested_by=EXCLUDED.requested_by,status='pending',updated_at=now()
   WHERE public.vxsk_social_links.status='rejected'
     AND public.vxsk_social_links.requested_by<>EXCLUDED.requested_by;
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.vxsk_social_request(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vxsk_social_request(uuid) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
