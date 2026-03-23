CREATE TABLE inventario_colaboradora (
  colaboradora_id UUID NOT NULL REFERENCES usuarios(id),
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad_actual INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_actual >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (colaboradora_id, producto_id)
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON inventario_colaboradora
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE inventario_colaboradora ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_col_select" ON inventario_colaboradora
  FOR SELECT TO authenticated
  USING (
    colaboradora_id = auth.uid()
    OR get_my_rol() IN ('admin', 'supervisor', 'analista', 'compras')
  );

CREATE POLICY "inv_col_write_admin" ON inventario_colaboradora
  FOR INSERT TO authenticated
  WITH CHECK (get_my_rol() = 'admin');

CREATE POLICY "inv_col_update_admin" ON inventario_colaboradora
  FOR UPDATE TO authenticated
  USING (get_my_rol() = 'admin')
  WITH CHECK (get_my_rol() = 'admin');

CREATE POLICY "inv_col_delete_admin" ON inventario_colaboradora
  FOR DELETE TO authenticated
  USING (get_my_rol() = 'admin');
