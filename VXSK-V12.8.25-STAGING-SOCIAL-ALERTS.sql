-- VXSK V12.8.25 / STAGING ONLY / friend-request + DM alerts
-- Adds unread DM tracking and a safe alert summary RPC for the website UI.
BEGIN;

CREATE TABLE IF NOT EXISTS public.vxsk_social_dm_seen (
  viewer uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peer uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer, peer),
  CHECK (viewer <> peer)
);
ALTER TABLE public.vxsk_social_dm_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vxsk_social_dm_seen FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.vxsk_social_mark_dm_seen(p_peer uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
 IF v_uid IS NULL OR p_peer IS NULL OR p_peer=v_uid THEN RETURN false; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.vxsk_social_links l
   WHERE l.user_low=least(v_uid,p_peer) AND l.user_high=greatest(v_uid,p_peer)
     AND l.status='accepted'
 ) THEN RETURN false; END IF;
 INSERT INTO public.vxsk_social_dm_seen(viewer,peer,seen_at)
 VALUES(v_uid,p_peer,now())
 ON CONFLICT(viewer,peer) DO UPDATE SET seen_at=excluded.seen_at;
 RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.vxsk_social_alerts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
WITH me AS (
  SELECT auth.uid() AS uid
),
incoming_requests AS (
  SELECT count(*)::int AS c
  FROM public.vxsk_social_links l, me
  WHERE me.uid IS NOT NULL
    AND me.uid IN (l.user_low,l.user_high)
    AND l.status='pending'
    AND l.requested_by <> me.uid
),
unread_dms AS (
  SELECT coalesce(count(*),0)::int AS c
  FROM public.vxsk_social_messages m
  JOIN me ON me.uid = m.recipient
  LEFT JOIN public.vxsk_social_dm_seen s
    ON s.viewer = me.uid AND s.peer = m.sender
  WHERE EXISTS(
    SELECT 1 FROM public.vxsk_social_links l
    WHERE l.user_low=least(me.uid,m.sender)
      AND l.user_high=greatest(me.uid,m.sender)
      AND l.status='accepted'
  )
    AND m.created_at > coalesce(s.seen_at, '-infinity'::timestamptz)
)
SELECT jsonb_build_object(
  'requests', coalesce((SELECT c FROM incoming_requests),0),
  'unread_messages', coalesce((SELECT c FROM unread_dms),0)
)
FROM me WHERE me.uid IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.vxsk_social_mark_dm_seen(uuid), public.vxsk_social_alerts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vxsk_social_mark_dm_seen(uuid), public.vxsk_social_alerts() TO authenticated;

COMMIT;
