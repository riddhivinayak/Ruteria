CREATE TABLE formas_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO formas_pago (nombre) VALUES
  ('Efectivo'),
  ('Transferencia'),
  ('Nequi'),
  ('Daviplata'),
  ('Otro');

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON formas_pago
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE formas_pago ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fp_select" ON formas_pago
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "fp_admin" ON formas_pago
  FOR ALL TO authenticated
  USING (get_my_rol() = 'admin')
  WITH CHECK (get_my_rol() = 'admin');
