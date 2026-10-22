-- VXSK V12.8.23: OPTIONAL INCREMENTAL MIGRATION, STAGING ONLY.
-- Requires existing V12.8.11 friend-call and V12.8.22 group-call schemas.
-- Verify target project BEFORE running. Does NOT grant anonymous access to any data.
BEGIN;

-- Prevent a second browser tab from replacing an active room session and
-- unexpectedly kicking the first tab off the group call. A stale session
-- can be replaced after 75 seconds without a heartbeat.
CREATE OR REPLACE FUNCTION public.vxsk_group_call_join(p_group uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE uid uuid:=auth.uid(); sid uuid:=gen_random_uuid();
BEGIN
 IF uid IS NULL OR p_group IS NULL OR NOT EXISTS(SELECT 1 FROM public.vxsk_group_members m
   WHERE m.group_id=p_group AND m.user_id=uid AND m.status='active') THEN RETURN NULL; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('vxsk-group-call:'||p_group::text));
 IF EXISTS(SELECT 1 FROM public.vxsk_group_call_presence p WHERE p.group_id=p_group
   AND p.user_id=uid AND p.last_seen>now()-interval '75 seconds') THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM public.vxsk_group_call_presence p WHERE p.group_id=p_group
   AND p.user_id<>uid AND p.last_seen>now()-interval '75 seconds')>=4 THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.vxsk_group_call_presence p JOIN public.vxsk_social_blocks b
   ON ((b.blocker=uid AND b.blocked=p.user_id) OR (b.blocker=p.user_id AND b.blocked=uid))
   WHERE p.group_id=p_group AND p.last_seen>now()-interval '75 seconds') THEN RETURN NULL; END IF;
 INSERT INTO public.vxsk_group_call_presence(group_id,user_id,session_id,last_seen)
 VALUES(p_group,uid,sid,now())
 ON CONFLICT(group_id,user_id) DO UPDATE SET session_id=excluded.session_id,last_seen=now();
 DELETE FROM public.vxsk_group_call_signals WHERE created_at<now()-interval '1 day';
 RETURN sid;
END;
$$;
REVOKE ALL ON FUNCTION public.vxsk_group_call_join(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vxsk_group_call_join(uuid) TO authenticated;

-- Call UI can show a participant's actual uploaded avatar, when the private
-- storage policy allows signed-URL access. No email or private contacts exposed.
-- Signature change requires replacing the old return table definition.
DROP FUNCTION IF EXISTS public.vxsk_group_call_roster(uuid);
CREATE FUNCTION public.vxsk_group_call_roster(p_group uuid)
RETURNS TABLE(user_id uuid,session_id uuid,nickname text,avatar_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT p.user_id,p.session_id,coalesce(n.nickname,'VXSK PLAYER'),
   CASE WHEN u.raw_user_meta_data->>'avatar_path' LIKE p.user_id::text||'/%'
        THEN u.raw_user_meta_data->>'avatar_path' ELSE NULL END
 FROM public.vxsk_group_call_presence p
 JOIN public.vxsk_group_members m ON m.group_id=p.group_id AND m.user_id=p.user_id AND m.status='active'
 LEFT JOIN public.vxsk_social_profiles n ON n.user_id=p.user_id
 LEFT JOIN auth.users u ON u.id=p.user_id
 WHERE auth.uid() IS NOT NULL AND p.group_id=p_group AND p.last_seen>now()-interval '75 seconds'
 AND EXISTS(SELECT 1 FROM public.vxsk_group_members me WHERE me.group_id=p_group AND me.user_id=auth.uid() AND me.status='active')
 AND NOT EXISTS(SELECT 1 FROM public.vxsk_social_blocks b WHERE
   (b.blocker=auth.uid() AND b.blocked=p.user_id) OR (b.blocker=p.user_id AND b.blocked=auth.uid()))
 ORDER BY lower(coalesce(n.nickname,'VXSK PLAYER')) LIMIT 4;
$$;
REVOKE ALL ON FUNCTION public.vxsk_group_call_roster(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vxsk_group_call_roster(uuid) TO authenticated;

COMMIT;
