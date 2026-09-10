BEGIN;
CREATE TABLE public.didit_seller_live_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 seller_id uuid NOT NULL REFERENCES public.seller_accounts(id) ON DELETE RESTRICT,
 application_submitted_at timestamptz NOT NULL,
 workflow_id uuid NOT NULL,
 session_id uuid UNIQUE,
 session_url text,
 provider_status text NOT NULL DEFAULT 'Creating',
 environment text NOT NULL DEFAULT 'live' CHECK (environment = 'live'),
 face_score numeric CHECK (face_score BETWEEN 0 AND 100),
 checks_passed boolean NOT NULL DEFAULT false,
 consent_version text NOT NULL,
 consent_at timestamptz NOT NULL DEFAULT now(),
 checked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(seller_id, application_submitted_at, workflow_id)
);
ALTER TABLE public.didit_seller_live_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.didit_seller_live_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.didit_seller_live_sessions TO service_role;
COMMENT ON TABLE public.didit_seller_live_sessions IS 'Live seller verification sessions. Service-only storage; final seller approval remains manual.';
ALTER TABLE public.seller_accounts ADD COLUMN didit_face_score numeric CHECK (didit_face_score BETWEEN 0 AND 100);
ALTER TABLE public.seller_accounts ADD COLUMN didit_environment text CHECK (didit_environment IN ('live','sandbox'));
ALTER TABLE public.seller_accounts ADD CONSTRAINT seller_live_face_match_required CHECK (
 status <> 'APPROVED' OR (didit_environment IS NOT NULL AND didit_environment = 'live' AND didit_face_score IS NOT NULL AND didit_face_score >= 80)
) NOT VALID;
CREATE FUNCTION public.apply_didit_live_result(p_id uuid, p_expected_updated_at timestamptz, p_provider_status text, p_face_score numeric, p_passed boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.didit_seller_live_sessions; s public.seller_accounts; passed boolean; stamp timestamptz := clock_timestamp();
BEGIN
 SELECT * INTO r FROM public.didit_seller_live_sessions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.session_id IS NULL OR r.updated_at <> p_expected_updated_at THEN RETURN false; END IF;
 SELECT * INTO s FROM public.seller_accounts WHERE id=r.seller_id FOR UPDATE;
 passed := coalesce(p_passed,false) AND p_provider_status='Approved' AND p_face_score IS NOT NULL AND p_face_score>=80 AND p_face_score<=100;
 UPDATE public.didit_seller_live_sessions SET provider_status=p_provider_status, face_score=p_face_score, checks_passed=passed, checked_at=stamp, updated_at=stamp WHERE id=r.id;
 IF s.submitted_at = r.application_submitted_at AND s.status='PENDING' THEN
  UPDATE public.seller_accounts SET
    didit_face_score=p_face_score, didit_environment='live', verification_provider='didit', verification_reference=r.session_id::text,
    identity_verified_at=CASE WHEN passed THEN stamp ELSE NULL END,
    face_liveness_verified_at=CASE WHEN passed THEN stamp ELSE NULL END,
    updated_at=stamp
  WHERE id=s.id;
 END IF;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_didit_live_result(uuid,timestamptz,text,numeric,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_didit_live_result(uuid,timestamptz,text,numeric,boolean) TO service_role;
COMMIT;
