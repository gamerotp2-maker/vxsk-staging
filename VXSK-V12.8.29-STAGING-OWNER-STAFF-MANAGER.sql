-- VXSK V12.8.29 — STAGING ONLY — one-time Owner Staff Manager installation.
-- Use Supabase SQL Editor connected to VXSK STAGING, not your production project.
-- No existing staff assignments are changed by this installation.
-- Functions enforce owner role + Supabase MFA AAL2 on the server.
BEGIN;

-- Every Owner-made change through this manager is recorded for accountability.
CREATE TABLE IF NOT EXISTS public.vxsk_staff_role_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  target_id uuid NOT NULL REFERENCES auth.users(id),
  previous_role text,
  new_role text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vxsk_staff_audit_previous_role_chk CHECK (previous_role IS NULL OR previous_role IN ('reviewer','staff')),
  CONSTRAINT vxsk_staff_audit_new_role_chk CHECK (new_role IS NULL OR new_role IN ('reviewer','staff'))
);
ALTER TABLE public.vxsk_staff_role_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vxsk_staff_role_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.vxsk_staff_role_audit_id_seq FROM PUBLIC, anon, authenticated;

-- Search by VXSK nickname; never reveal emails or raw auth metadata.
CREATE OR REPLACE FUNCTION public.vxsk_owner_staff_search(p_query text)
RETURNS TABLE(user_id uuid, nickname text, current_role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_query text := pg_catalog.btrim(p_query);
BEGIN
  IF auth.uid() IS NULL
     OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2'
     OR NOT EXISTS (SELECT 1 FROM public.staff_roles s WHERE s.user_id=auth.uid() AND s.role='owner')
  THEN RAISE EXCEPTION 'Owner and 2FA verification required' USING ERRCODE='42501'; END IF;
  IF v_query IS NULL OR pg_catalog.char_length(v_query) < 2 OR pg_catalog.char_length(v_query) > 40
  THEN RAISE EXCEPTION 'Enter 2 to 40 characters'; END IF;
  RETURN QUERY
    SELECT p.user_id,p.nickname,s.role
    FROM public.vxsk_social_profiles p
    JOIN auth.users u ON u.id=p.user_id AND u.email_confirmed_at IS NOT NULL
    LEFT JOIN public.staff_roles s ON s.user_id=p.user_id
    WHERE pg_catalog.strpos(pg_catalog.lower(p.nickname),pg_catalog.lower(v_query)) > 0
    ORDER BY CASE WHEN pg_catalog.lower(p.nickname)=pg_catalog.lower(v_query) THEN 0 ELSE 1 END,
             pg_catalog.lower(p.nickname),p.user_id
    LIMIT 30;
END; $$;

-- Show current authorized roles, including the protected Owner.
CREATE OR REPLACE FUNCTION public.vxsk_owner_staff_list()
RETURNS TABLE(user_id uuid, nickname text, current_role text, assigned_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL
     OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2'
     OR NOT EXISTS (SELECT 1 FROM public.staff_roles s WHERE s.user_id=auth.uid() AND s.role='owner')
  THEN RAISE EXCEPTION 'Owner and 2FA verification required' USING ERRCODE='42501'; END IF;
  RETURN QUERY
    SELECT s.user_id,pg_catalog.coalesce(p.nickname,'Account without nickname'),s.role,s.assigned_at
    FROM public.staff_roles s
    LEFT JOIN public.vxsk_social_profiles p ON p.user_id=s.user_id
    ORDER BY CASE WHEN s.role='owner' THEN 0 ELSE 1 END,pg_catalog.lower(pg_catalog.coalesce(p.nickname,'')),s.assigned_at
    LIMIT 300;
END; $$;

-- Owner may grant reviewer/staff or revoke them; can NEVER assign or remove owner.
-- The browser cannot directly write staff_roles. Both checks happen inside the transaction.
CREATE OR REPLACE FUNCTION public.vxsk_owner_staff_set(p_target uuid,p_role text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before text;
BEGIN
  IF auth.uid() IS NULL
     OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2'
     OR NOT EXISTS (SELECT 1 FROM public.staff_roles s WHERE s.user_id=auth.uid() AND s.role='owner')
  THEN RAISE EXCEPTION 'Owner and 2FA verification required' USING ERRCODE='42501'; END IF;
  IF p_target IS NULL OR p_target=auth.uid() THEN
    RAISE EXCEPTION 'Owner account cannot be changed' USING ERRCODE='42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('reviewer','staff','none') THEN
    RAISE EXCEPTION 'Only reviewer, staff, or none are allowed' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vxsk_social_profiles p
    JOIN auth.users u ON u.id=p.user_id
    WHERE p.user_id=p_target AND u.email_confirmed_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Verified VXSK account not found' USING ERRCODE='22023'; END IF;
  SELECT s.role INTO v_before FROM public.staff_roles s WHERE s.user_id=p_target FOR UPDATE;
  IF v_before='owner' THEN RAISE EXCEPTION 'Owner account is protected' USING ERRCODE='42501'; END IF;
  IF pg_catalog.coalesce(v_before,'none')=p_role THEN RETURN p_role; END IF;
  IF p_role='none' THEN
    DELETE FROM public.staff_roles s WHERE s.user_id=p_target AND s.role IN ('staff','reviewer');
  ELSE
    INSERT INTO public.staff_roles(user_id,role,assigned_at)
    VALUES (p_target,p_role,now())
    ON CONFLICT (user_id) DO UPDATE SET role=excluded.role,assigned_at=now()
      WHERE public.staff_roles.role IN ('staff','reviewer');
    -- Defense-in-depth against concurrent owner assignments outside this UI.
    IF NOT EXISTS (SELECT 1 FROM public.staff_roles s WHERE s.user_id=p_target AND s.role=p_role)
    THEN RAISE EXCEPTION 'Role was not changed'; END IF;
  END IF;
  INSERT INTO public.vxsk_staff_role_audit(actor_id,target_id,previous_role,new_role)
  VALUES (auth.uid(),p_target,v_before,NULLIF(p_role,'none'));
  RETURN p_role;
END; $$;

CREATE OR REPLACE FUNCTION public.vxsk_owner_staff_history()
RETURNS TABLE(target_nickname text,previous_role text,new_role text,changed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL
     OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2'
     OR NOT EXISTS (SELECT 1 FROM public.staff_roles s WHERE s.user_id=auth.uid() AND s.role='owner')
  THEN RAISE EXCEPTION 'Owner and 2FA verification required' USING ERRCODE='42501'; END IF;
  RETURN QUERY
    SELECT pg_catalog.coalesce(p.nickname,'Former account'),a.previous_role,a.new_role,a.changed_at
    FROM public.vxsk_staff_role_audit a
    LEFT JOIN public.vxsk_social_profiles p ON p.user_id=a.target_id
    ORDER BY a.changed_at DESC,a.id DESC LIMIT 25;
END; $$;

-- Keep role table read-only for web clients; only SECURITY DEFINER RPC may mutate it.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.staff_roles FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.vxsk_owner_staff_search(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.vxsk_owner_staff_list() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.vxsk_owner_staff_set(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.vxsk_owner_staff_history() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vxsk_owner_staff_search(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vxsk_owner_staff_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vxsk_owner_staff_set(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vxsk_owner_staff_history() TO authenticated;
COMMIT;

-- Optional manual verification: SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema='public' AND routine_name LIKE 'vxsk_owner_staff_%';
