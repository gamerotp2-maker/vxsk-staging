-- VXSK V12.8.28 — STAGING ONLY. Applies to the VXSK-STAGING Supabase project.
-- Allows verified signed-in accounts to see uploaded avatars of other verified,
-- unblocked VXSK accounts. NEVER gives anonymous read access to the private bucket.
-- Friend requests, messages, groups and staff roles are not modified.
BEGIN;
ALTER TABLE public.vxsk_social_profiles ALTER COLUMN share_avatar SET DEFAULT true;
UPDATE public.vxsk_social_profiles SET share_avatar=true,updated_at=now() WHERE share_avatar IS DISTINCT FROM true;

-- Avatar paths originate only from auth.users and must start with their true UUID.
-- This RPC exposes no emails, phone numbers or account settings.
CREATE OR REPLACE FUNCTION public.vxsk_social_avatar_lookup(p_ids uuid[])
RETURNS TABLE(user_id uuid, avatar_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT u.id, (u.raw_user_meta_data->>'avatar_path')::text
 FROM auth.users u
 JOIN public.vxsk_social_profiles p ON p.user_id=u.id AND p.share_avatar
 WHERE auth.uid() IS NOT NULL
   AND p_ids IS NOT NULL AND pg_catalog.cardinality(p_ids) BETWEEN 1 AND 20
   AND u.id = ANY(p_ids)
   AND u.email_confirmed_at IS NOT NULL
   AND (u.raw_user_meta_data->>'avatar_path') LIKE u.id::text || '/%'
   AND NOT EXISTS (SELECT 1 FROM public.vxsk_social_blocks b
     WHERE (b.blocker=auth.uid() AND b.blocked=u.id)
        OR (b.blocker=u.id AND b.blocked=auth.uid()))
 LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.vxsk_social_avatar_lookup(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vxsk_social_avatar_lookup(uuid[]) TO authenticated;

-- Private bucket signed-URL permission for any authenticated, verified,
-- unblocked account, including staff and owner. Does not expose files to anon.
CREATE OR REPLACE FUNCTION public.vxsk_can_view_social_avatar(p_owner text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.vxsk_social_profiles p
   JOIN auth.users u ON u.id=p.user_id
   WHERE p.user_id::text=p_owner AND p.user_id<>auth.uid()
     AND p.share_avatar AND u.email_confirmed_at IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM public.vxsk_social_blocks b
       WHERE (b.blocker=auth.uid() AND b.blocked=p.user_id)
          OR (b.blocker=p.user_id AND b.blocked=auth.uid()))
 );
$$;
REVOKE ALL ON FUNCTION public.vxsk_can_view_social_avatar(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vxsk_can_view_social_avatar(text) TO authenticated;
COMMIT;
