-- From 20260911_120000_seller_commerce.sql; preserve seller reservations and retry safety.
CREATE OR REPLACE FUNCTION public.fulfill_instant_items(p_order_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item record; codeid uuid; num integer; delivered integer; manual boolean:=false; state text;
BEGIN
 SELECT status::text INTO state FROM orders WHERE id=p_order_id FOR UPDATE;
 IF state IS NULL OR state IN ('CANCELLED','REFUNDED') THEN RAISE EXCEPTION 'Order cannot be fulfilled'; END IF;
 FOR item IN SELECT oi.*,p.delivery_type FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=p_order_id ORDER BY oi.product_option_id LOOP
  IF item.delivery_type='MANUAL' THEN manual:=true; CONTINUE; END IF;
  PERFORM 1 FROM product_options WHERE id=item.product_option_id FOR UPDATE;
  SELECT count(*) INTO delivered FROM gift_card_codes WHERE order_item_id=item.id AND status='SOLD';
  FOR num IN 1..greatest(item.quantity-delivered,0) LOOP
   SELECT id INTO codeid FROM gift_card_codes WHERE product_option_id IS NOT DISTINCT FROM item.product_option_id AND product_id=item.product_id
     AND ((status='RESERVED' AND order_item_id=item.id) OR (item.seller_id IS NULL AND status='AVAILABLE')) ORDER BY created_at,id LIMIT 1 FOR UPDATE;
   IF codeid IS NULL THEN RAISE EXCEPTION 'Not enough reserved codes for %',item.product_name; END IF;
   UPDATE gift_card_codes SET status='SOLD',order_item_id=item.id,reserved_at=COALESCE(reserved_at,now()),sold_at=now() WHERE id=codeid;
  END LOOP;
  IF item.seller_id IS NULL THEN UPDATE product_options SET stock_quantity=greatest(stock_quantity-greatest(item.quantity-delivered,0),0) WHERE id=item.product_option_id; END IF;
 END LOOP;
 RETURN manual;
END $$;
