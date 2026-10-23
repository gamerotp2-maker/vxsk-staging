-- VXSK V12.8.33 — CURRENT GITHUB PAGES SUPABASE PROJECT ONLY
-- Target project ref: opzqnmahfgehaewgciwg (NOT former Netlify production).
-- Introduces a NEW read-only avatar lookup; does not drop/replace the existing
-- vxsk_social_avatar_lookup function or change profile privacy choices.
-- Existing accounts, groups, friends, staff, calls, covers, and messages preserved.
BEGIN;

CREATE OR REPLACE FUNCTION public.vxsk_social_avatar_lookup_v2(p_ids uuid[])
RETURNS TABLE(user_id uuid, avatar_path text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT
   u.id AS user_id,
   CASE
     WHEN (u.raw_user_meta_data->>'avatar_path') LIKE u.id::text || '/%'
       THEN (u.raw_user_meta_data->>'avatar_path')::text
     ELSE NULL
   END AS avatar_path,
   CASE
     WHEN (u.raw_user_meta_data->>'avatar_url') ~* '^https://(cdn\.discordapp\.com|media\.discordapp\.net|lh3\.googleusercontent\.com|[a-z0-9.-]+\.googleusercontent\.com)/'
       THEN (u.raw_user_meta_data->>'avatar_url')::text
     ELSE NULL
   END AS avatar_url
 FROM auth.users u
 JOIN public.vxsk_social_profiles p
   ON p.user_id=u.id AND p.share_avatar
 WHERE auth.uid() IS NOT NULL
   AND p_ids IS NOT NULL
   AND pg_catalog.cardinality(p_ids) BETWEEN 1 AND 20
   AND u.id = ANY(p_ids)
   AND u.email_confirmed_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.vxsk_social_blocks b
     WHERE (b.blocker=auth.uid() AND b.blocked=u.id)
        OR (b.blocker=u.id AND b.blocked=auth.uid())
   )
 LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.vxsk_social_avatar_lookup_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vxsk_social_avatar_lookup_v2(uuid[]) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';

-- Optional read-only test:
-- SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace
--   AND proname IN ('vxsk_social_avatar_lookup','vxsk_social_avatar_lookup_v2');
