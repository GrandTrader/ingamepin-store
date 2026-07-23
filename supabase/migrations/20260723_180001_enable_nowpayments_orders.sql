do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.create_store_order(text,text,text,text,jsonb,text)'::regprocedure
  );

  if position(
    'when ''nowpayments'' then v_method := ''NOWPAYMENTS'';'
    in v_definition
  ) = 0 then
    v_definition := replace(
      v_definition,
      'when ''wallet'' then v_method := ''WALLET'';',
      'when ''nowpayments'' then v_method := ''NOWPAYMENTS'';' ||
      E'\n    ' ||
      'when ''wallet'' then v_method := ''WALLET'';'
    );
  end if;

  execute v_definition;
end;
$$;
