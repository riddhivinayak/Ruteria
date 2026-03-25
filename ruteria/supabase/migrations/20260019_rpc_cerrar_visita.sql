CREATE OR REPLACE FUNCTION cerrar_visita(
  p_visita_id UUID,
  p_cobro JSONB,
  p_reposiciones JSONB DEFAULT '[]'::jsonb
) RETURNS void AS $$
DECLARE
  v_visita RECORD;
  v_detalle RECORD;
  v_reposicion JSONB;
  v_producto_id UUID;
  v_unidades_repuestas INT;
  v_monto_calculado DECIMAL(12,2);
  v_monto_cobrado DECIMAL(12,2);
  v_forma_pago_id UUID;
  v_notas TEXT;
  v_estado_cobro TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF COALESCE(jsonb_typeof(p_reposiciones), 'array') <> 'array' THEN
    RAISE EXCEPTION 'Las reposiciones deben enviarse como un arreglo JSON';
  END IF;

  SELECT id, estado, colaboradora_id, vitrina_id
  INTO v_visita
  FROM visitas
  WHERE id = p_visita_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada';
  END IF;

  IF v_visita.estado <> 'en_ejecucion' THEN
    RAISE EXCEPTION 'La visita no esta en ejecucion';
  END IF;

  IF get_my_rol() <> 'admin' AND v_visita.colaboradora_id <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para cerrar esta visita';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM detalle_visita
    WHERE visita_id = p_visita_id
  ) THEN
    RAISE EXCEPTION 'No se ha guardado el conteo de la visita';
  END IF;

  v_monto_calculado := calcular_monto_visita(p_visita_id);
  v_monto_cobrado := (p_cobro->>'monto')::DECIMAL(12,2);
  v_forma_pago_id := (p_cobro->>'forma_pago_id')::UUID;
  v_notas := NULLIF(btrim(COALESCE(p_cobro->>'notas', '')), '');

  IF v_monto_cobrado IS NULL THEN
    RAISE EXCEPTION 'El monto cobrado es obligatorio';
  END IF;

  IF v_forma_pago_id IS NULL THEN
    RAISE EXCEPTION 'La forma de pago es obligatoria';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM formas_pago
    WHERE id = v_forma_pago_id
      AND activo = true
  ) THEN
    RAISE EXCEPTION 'La forma de pago seleccionada no esta disponible';
  END IF;

  v_estado_cobro := CASE
    WHEN v_monto_cobrado = v_monto_calculado THEN 'registrado'
    ELSE 'discrepancia'
  END;

  IF v_estado_cobro = 'discrepancia' AND v_notas IS NULL THEN
    RAISE EXCEPTION 'Nota obligatoria cuando el monto cobrado difiere del calculado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (item->>'producto_id')::UUID AS producto_id, count(*) AS total
      FROM jsonb_array_elements(p_reposiciones) AS item
      GROUP BY 1
      HAVING count(*) > 1
    ) duplicados
  ) THEN
    RAISE EXCEPTION 'No se permiten productos duplicados en las reposiciones';
  END IF;

  UPDATE detalle_visita
  SET unidades_repuestas = 0
  WHERE visita_id = p_visita_id;

  FOR v_detalle IN
    SELECT producto_id, unidades_vendidas
    FROM detalle_visita
    WHERE visita_id = p_visita_id
      AND unidades_vendidas > 0
  LOOP
    INSERT INTO movimientos_inventario (
      tipo,
      direccion,
      origen_tipo,
      origen_id,
      producto_id,
      cantidad,
      referencia_tipo,
      referencia_id,
      usuario_id,
      notas
    ) VALUES (
      'venta',
      'salida',
      'vitrina',
      v_visita.vitrina_id,
      v_detalle.producto_id,
      v_detalle.unidades_vendidas,
      'visita',
      p_visita_id,
      auth.uid(),
      'Salida por venta al cerrar visita'
    );
  END LOOP;

  FOR v_reposicion IN
    SELECT value
    FROM jsonb_array_elements(p_reposiciones)
  LOOP
    v_producto_id := (v_reposicion->>'producto_id')::UUID;
    v_unidades_repuestas := COALESCE((v_reposicion->>'unidades_repuestas')::INT, 0);

    IF v_producto_id IS NULL THEN
      RAISE EXCEPTION 'Cada reposicion debe incluir producto_id';
    END IF;

    IF v_unidades_repuestas < 0 THEN
      RAISE EXCEPTION 'Las unidades repuestas no pueden ser negativas';
    END IF;

    UPDATE detalle_visita
    SET unidades_repuestas = v_unidades_repuestas
    WHERE visita_id = p_visita_id
      AND producto_id = v_producto_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto % no pertenece a la visita', v_producto_id;
    END IF;

    IF v_unidades_repuestas > 0 THEN
      INSERT INTO movimientos_inventario (
        tipo,
        direccion,
        origen_tipo,
        origen_id,
        destino_tipo,
        destino_id,
        producto_id,
        cantidad,
        referencia_tipo,
        referencia_id,
        usuario_id,
        notas
      ) VALUES (
        'reposicion',
        'salida',
        'colaboradora',
        v_visita.colaboradora_id,
        'vitrina',
        v_visita.vitrina_id,
        v_producto_id,
        v_unidades_repuestas,
        'visita',
        p_visita_id,
        auth.uid(),
        'Reposicion al cerrar visita'
      );
    END IF;
  END LOOP;

  INSERT INTO cobros (
    visita_id,
    monto,
    forma_pago_id,
    estado,
    notas,
    created_by
  ) VALUES (
    p_visita_id,
    v_monto_cobrado,
    v_forma_pago_id,
    v_estado_cobro,
    v_notas,
    auth.uid()
  );

  UPDATE visitas
  SET
    estado = 'completada',
    fecha_hora_fin = now(),
    monto_calculado = v_monto_calculado,
    monto_cobrado = v_monto_cobrado,
    notas = v_notas,
    updated_at = now()
  WHERE id = p_visita_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
