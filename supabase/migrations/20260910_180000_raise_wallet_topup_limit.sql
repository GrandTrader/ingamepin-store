-- Preserve the deployed function's authentication and permission rules.
DO $$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef('public.create_wallet_topup_request(numeric,text,text)'::regprocedure)
  INTO definition;

  -- The owner may have already applied this change in the SQL Editor.
  IF definition ~ 'p_amount\s*>\s*50000' THEN
    RETURN;
  END IF;

  IF definition !~ 'p_amount\s*>\s*10000' THEN
    RAISE EXCEPTION 'Expected wallet top-up limit of 10000 was not found; inspect the function before applying this migration.';
  END IF;

  definition := regexp_replace(definition, 'p_amount\s*>\s*10000', 'p_amount > 50000', 'g');
  definition := replace(definition, 'USD 10,000', 'USD 50,000');
  EXECUTE definition;
END;
$$;
