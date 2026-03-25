DROP POLICY IF EXISTS "mov_inv_insert" ON movimientos_inventario;

CREATE POLICY "mov_inv_insert" ON movimientos_inventario
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_rol() IN ('admin', 'compras')
    OR (
      get_my_rol() = 'colaboradora'
      AND origen_tipo = 'colaboradora'
      AND origen_id = auth.uid()
    )
  );
