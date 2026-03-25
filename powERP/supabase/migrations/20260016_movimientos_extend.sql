ALTER TABLE movimientos_inventario
  DROP CONSTRAINT movimientos_inventario_origen_tipo_check,
  ADD CONSTRAINT movimientos_inventario_origen_tipo_check
    CHECK (origen_tipo IN ('central', 'vitrina', 'colaboradora'));

ALTER TABLE movimientos_inventario
  DROP CONSTRAINT movimientos_inventario_destino_tipo_check,
  ADD CONSTRAINT movimientos_inventario_destino_tipo_check
    CHECK (destino_tipo IN ('central', 'vitrina', 'colaboradora'));

ALTER TABLE movimientos_inventario
  DROP CONSTRAINT movimientos_inventario_tipo_check,
  ADD CONSTRAINT movimientos_inventario_tipo_check
    CHECK (tipo IN (
      'compra',
      'traslado_a_vitrina',
      'venta',
      'devolucion_garantia',
      'baja',
      'ajuste',
      'traslado_entre_vitrinas',
      'carga_colaboradora',
      'reposicion'
    ));
