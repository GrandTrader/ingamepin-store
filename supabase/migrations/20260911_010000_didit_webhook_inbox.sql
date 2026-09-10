BEGIN;
CREATE TABLE public.didit_webhook_events (
 event_id uuid PRIMARY KEY,
 session_id uuid NOT NULL,
 environment text NOT NULL CHECK (environment IN ('sandbox','test','live')),
 event_type text NOT NULL CHECK (event_type IN ('status.updated','data.updated')),
 provider_status text NOT NULL CHECK (char_length(provider_status) BETWEEN 1 AND 80),
 dispatched_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz
);
CREATE INDEX didit_webhook_events_session ON public.didit_webhook_events(session_id);
ALTER TABLE public.didit_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.didit_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.didit_webhook_events TO service_role;
COMMENT ON TABLE public.didit_webhook_events IS 'Private signed event metadata inbox. No ID images or raw biometric payloads; does not approve sellers.';
COMMIT;
