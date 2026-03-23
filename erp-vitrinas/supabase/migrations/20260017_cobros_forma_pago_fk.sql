ALTER TABLE cobros
  ADD COLUMN forma_pago_id UUID REFERENCES formas_pago(id);

UPDATE cobros AS c
SET forma_pago_id = fp.id
FROM formas_pago AS fp
WHERE lower(fp.nombre) = lower(c.forma_pago);

UPDATE cobros
SET forma_pago_id = (
  SELECT id
  FROM formas_pago
  WHERE nombre = 'Otro'
  LIMIT 1
)
WHERE forma_pago_id IS NULL;

ALTER TABLE cobros
  ALTER COLUMN forma_pago_id SET NOT NULL;

ALTER TABLE cobros
  DROP COLUMN forma_pago;
