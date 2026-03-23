CREATE OR REPLACE FUNCTION validar_stock_no_negativo()
RETURNS TRIGGER AS $$
DECLARE
  stock_actual INT := 0;
BEGIN
  IF NEW.direccion = 'salida' THEN
    IF NEW.origen_tipo = 'central' THEN
      SELECT COALESCE(cantidad_actual, 0)
      INTO stock_actual
      FROM inventario_central
      WHERE producto_id = NEW.producto_id;

    ELSIF NEW.origen_tipo = 'vitrina' THEN
      IF NEW.origen_id IS NULL THEN
        RAISE EXCEPTION 'origen_id requerido para salidas de vitrina';
      END IF;

      SELECT COALESCE(cantidad_actual, 0)
      INTO stock_actual
      FROM inventario_vitrina
      WHERE vitrina_id = NEW.origen_id
        AND producto_id = NEW.producto_id;

    ELSIF NEW.origen_tipo = 'colaboradora' THEN
      IF NEW.origen_id IS NULL THEN
        RAISE EXCEPTION 'origen_id requerido para salidas de colaboradora';
      END IF;

      SELECT COALESCE(cantidad_actual, 0)
      INTO stock_actual
      FROM inventario_colaboradora
      WHERE colaboradora_id = NEW.origen_id
        AND producto_id = NEW.producto_id;

    ELSE
      RAISE EXCEPTION 'origen_tipo invalido para movimiento de salida: %', NEW.tipo;
    END IF;

    IF COALESCE(stock_actual, 0) - NEW.cantidad < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente: producto %, disponible %, solicitado %',
        NEW.producto_id, COALESCE(stock_actual, 0), NEW.cantidad;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION actualizar_inventario()
RETURNS TRIGGER AS $$
DECLARE
  delta_central INT := 0;
  delta_vitrina INT := 0;
  delta_colaboradora INT := 0;
  v_vitrina_id UUID;
  v_colaboradora_id UUID;
BEGIN
  CASE NEW.tipo
    WHEN 'compra' THEN
      delta_central := NEW.cantidad;

    WHEN 'traslado_a_vitrina' THEN
      delta_central := -NEW.cantidad;
      delta_vitrina := NEW.cantidad;
      v_vitrina_id := NEW.destino_id;

    WHEN 'venta' THEN
      delta_vitrina := -NEW.cantidad;
      v_vitrina_id := NEW.origen_id;

    WHEN 'devolucion_garantia' THEN
      delta_vitrina := -NEW.cantidad;
      v_vitrina_id := NEW.origen_id;

    WHEN 'baja' THEN
      IF NEW.origen_tipo = 'central' THEN
        delta_central := -NEW.cantidad;
      ELSIF NEW.origen_tipo = 'colaboradora' THEN
        delta_colaboradora := -NEW.cantidad;
        v_colaboradora_id := NEW.origen_id;
      ELSE
        delta_vitrina := -NEW.cantidad;
        v_vitrina_id := NEW.origen_id;
      END IF;

    WHEN 'ajuste' THEN
      IF NEW.direccion = 'entrada' THEN
        IF NEW.origen_tipo = 'central' THEN
          delta_central := NEW.cantidad;
        ELSIF NEW.origen_tipo = 'colaboradora' THEN
          delta_colaboradora := NEW.cantidad;
          v_colaboradora_id := NEW.origen_id;
        ELSE
          delta_vitrina := NEW.cantidad;
          v_vitrina_id := NEW.origen_id;
        END IF;
      ELSE
        IF NEW.origen_tipo = 'central' THEN
          delta_central := -NEW.cantidad;
        ELSIF NEW.origen_tipo = 'colaboradora' THEN
          delta_colaboradora := -NEW.cantidad;
          v_colaboradora_id := NEW.origen_id;
        ELSE
          delta_vitrina := -NEW.cantidad;
          v_vitrina_id := NEW.origen_id;
        END IF;
      END IF;

    WHEN 'traslado_entre_vitrinas' THEN
      NULL;

    WHEN 'carga_colaboradora' THEN
      delta_central := -NEW.cantidad;
      delta_colaboradora := NEW.cantidad;
      v_colaboradora_id := NEW.destino_id;

    WHEN 'reposicion' THEN
      delta_colaboradora := -NEW.cantidad;
      delta_vitrina := NEW.cantidad;
      v_colaboradora_id := NEW.origen_id;
      v_vitrina_id := NEW.destino_id;

    ELSE
      NULL;
  END CASE;

  IF delta_central != 0 THEN
    INSERT INTO inventario_central (producto_id, cantidad_actual, fecha_actualizacion)
    VALUES (NEW.producto_id, delta_central, now())
    ON CONFLICT (producto_id) DO UPDATE SET
      cantidad_actual = inventario_central.cantidad_actual + EXCLUDED.cantidad_actual,
      fecha_actualizacion = now();
  END IF;

  IF delta_vitrina != 0 AND v_vitrina_id IS NOT NULL THEN
    INSERT INTO inventario_vitrina (vitrina_id, producto_id, cantidad_actual, fecha_actualizacion)
    VALUES (v_vitrina_id, NEW.producto_id, delta_vitrina, now())
    ON CONFLICT (vitrina_id, producto_id) DO UPDATE SET
      cantidad_actual = inventario_vitrina.cantidad_actual + EXCLUDED.cantidad_actual,
      fecha_actualizacion = now();
  END IF;

  IF delta_colaboradora != 0 AND v_colaboradora_id IS NOT NULL THEN
    IF delta_colaboradora > 0 THEN
      INSERT INTO inventario_colaboradora (colaboradora_id, producto_id, cantidad_actual, updated_at)
      VALUES (v_colaboradora_id, NEW.producto_id, delta_colaboradora, now())
      ON CONFLICT (colaboradora_id, producto_id) DO UPDATE SET
        cantidad_actual = inventario_colaboradora.cantidad_actual + EXCLUDED.cantidad_actual,
        updated_at = now();
    ELSE
      UPDATE inventario_colaboradora
      SET
        cantidad_actual = inventario_colaboradora.cantidad_actual + delta_colaboradora,
        updated_at = now()
      WHERE colaboradora_id = v_colaboradora_id
        AND producto_id = NEW.producto_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe inventario de colaboradora para producto %', NEW.producto_id;
      END IF;
    END IF;
  END IF;

  IF NEW.tipo = 'traslado_entre_vitrinas' THEN
    IF NEW.origen_id IS NULL OR NEW.destino_id IS NULL THEN
      RAISE EXCEPTION 'traslado_entre_vitrinas requiere origen_id y destino_id no nulos';
    END IF;

    INSERT INTO inventario_vitrina (vitrina_id, producto_id, cantidad_actual, fecha_actualizacion)
    VALUES (NEW.origen_id, NEW.producto_id, -NEW.cantidad, now())
    ON CONFLICT (vitrina_id, producto_id) DO UPDATE SET
      cantidad_actual = inventario_vitrina.cantidad_actual + EXCLUDED.cantidad_actual,
      fecha_actualizacion = now();

    INSERT INTO inventario_vitrina (vitrina_id, producto_id, cantidad_actual, fecha_actualizacion)
    VALUES (NEW.destino_id, NEW.producto_id, NEW.cantidad, now())
    ON CONFLICT (vitrina_id, producto_id) DO UPDATE SET
      cantidad_actual = inventario_vitrina.cantidad_actual + EXCLUDED.cantidad_actual,
      fecha_actualizacion = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
