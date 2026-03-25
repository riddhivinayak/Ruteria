-- ============================================================
-- Helpers de autorización
-- ============================================================
CREATE OR REPLACE FUNCTION assert_reportes_analiticos_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF get_my_rol() NOT IN ('admin', 'supervisor', 'analista') THEN
    RAISE EXCEPTION 'Sin permisos para consultar reportes analíticos';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION assert_reportes_analiticos_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assert_reportes_analiticos_access() TO authenticated;

-- ============================================================
-- get_reporte_ventas
-- ============================================================
CREATE OR REPLACE FUNCTION get_reporte_ventas(
  p_desde DATE,
  p_hasta DATE,
  p_ruta_id UUID DEFAULT NULL,
  p_colaboradora_id UUID DEFAULT NULL,
  p_pdv_id UUID DEFAULT NULL,
  p_producto_id UUID DEFAULT NULL
)
RETURNS TABLE (
  pdv_nombre TEXT,
  ruta_nombre TEXT,
  colaboradora_nombre TEXT,
  fecha DATE,
  unidades_vendidas INT,
  monto_cobrado NUMERIC,
  forma_pago TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_reportes_analiticos_access();

  RETURN QUERY
  SELECT
    pdv.nombre_comercial,
    COALESCE(r.nombre, 'Sin ruta'),
    COALESCE(u.nombre, 'Sin colaboradora'),
    (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date AS fecha,
    COALESCE(SUM(dv.unidades_vendidas), 0)::INT AS unidades_vendidas,
    COALESCE(MAX(c.monto), 0) AS monto_cobrado,
    COALESCE(MAX(c.forma_pago), '') AS forma_pago
  FROM visitas v
  JOIN puntos_de_venta pdv
    ON pdv.id = v.pdv_id
  LEFT JOIN rutas r
    ON r.id = v.ruta_id
  LEFT JOIN usuarios u
    ON u.id = v.colaboradora_id
  JOIN detalle_visita dv
    ON dv.visita_id = v.id
  LEFT JOIN cobros c
    ON c.visita_id = v.id
  WHERE
    v.estado = 'completada'
    AND (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde AND p_hasta
    AND (p_ruta_id IS NULL OR v.ruta_id = p_ruta_id)
    AND (p_colaboradora_id IS NULL OR v.colaboradora_id = p_colaboradora_id)
    AND (p_pdv_id IS NULL OR v.pdv_id = p_pdv_id)
    AND (p_producto_id IS NULL OR dv.producto_id = p_producto_id)
  GROUP BY
    pdv.nombre_comercial,
    COALESCE(r.nombre, 'Sin ruta'),
    COALESCE(u.nombre, 'Sin colaboradora'),
    (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date,
    v.id
  ORDER BY fecha DESC, pdv_nombre ASC;
END;
$$;

-- ============================================================
-- get_ranking_vitrinas
-- ============================================================
CREATE OR REPLACE FUNCTION get_ranking_vitrinas(
  p_desde_actual DATE,
  p_hasta_actual DATE,
  p_desde_anterior DATE,
  p_hasta_anterior DATE
)
RETURNS TABLE (
  vitrina_id UUID,
  pdv_nombre TEXT,
  ventas_actual NUMERIC,
  ventas_anterior NUMERIC,
  variacion_pct NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_reportes_analiticos_access();

  RETURN QUERY
  WITH actual AS (
    SELECT
      v.vitrina_id,
      COALESCE(SUM(dv.subtotal_cobro), 0) AS ventas
    FROM visitas v
    JOIN detalle_visita dv
      ON dv.visita_id = v.id
    WHERE
      v.estado = 'completada'
      AND (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde_actual AND p_hasta_actual
    GROUP BY v.vitrina_id
  ),
  anterior AS (
    SELECT
      v.vitrina_id,
      COALESCE(SUM(dv.subtotal_cobro), 0) AS ventas
    FROM visitas v
    JOIN detalle_visita dv
      ON dv.visita_id = v.id
    WHERE
      v.estado = 'completada'
      AND (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde_anterior AND p_hasta_anterior
    GROUP BY v.vitrina_id
  )
  SELECT
    a.vitrina_id,
    pdv.nombre_comercial,
    a.ventas AS ventas_actual,
    COALESCE(ant.ventas, 0) AS ventas_anterior,
    CASE
      WHEN COALESCE(ant.ventas, 0) = 0 THEN NULL
      ELSE ROUND(((a.ventas - ant.ventas) / ant.ventas) * 100, 1)
    END AS variacion_pct
  FROM actual a
  JOIN vitrinas vit
    ON vit.id = a.vitrina_id
  JOIN puntos_de_venta pdv
    ON pdv.id = vit.pdv_id
  LEFT JOIN anterior ant
    ON ant.vitrina_id = a.vitrina_id
  ORDER BY a.ventas DESC, pdv.nombre_comercial ASC;
END;
$$;

-- ============================================================
-- get_reporte_visitas
-- ============================================================
CREATE OR REPLACE FUNCTION get_reporte_visitas(
  p_desde DATE,
  p_hasta DATE,
  p_ruta_id UUID DEFAULT NULL
)
RETURNS TABLE (
  pdv_nombre TEXT,
  ruta_nombre TEXT,
  colaboradora_nombre TEXT,
  fecha_planificada DATE,
  estado TEXT,
  motivo_no_realizada TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_reportes_analiticos_access();

  RETURN QUERY
  SELECT
    pdv.nombre_comercial,
    COALESCE(r.nombre, 'Sin ruta'),
    COALESCE(u.nombre, 'Sin colaboradora'),
    COALESCE(
      (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date,
      (v.created_at AT TIME ZONE 'America/Bogota')::date
    ) AS fecha_planificada,
    v.estado,
    COALESCE(v.motivo_no_realizada, '')
  FROM visitas v
  JOIN puntos_de_venta pdv
    ON pdv.id = v.pdv_id
  LEFT JOIN rutas r
    ON r.id = v.ruta_id
  LEFT JOIN usuarios u
    ON u.id = v.colaboradora_id
  WHERE
    COALESCE(
      (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date,
      (v.created_at AT TIME ZONE 'America/Bogota')::date
    ) BETWEEN p_desde AND p_hasta
    AND (p_ruta_id IS NULL OR v.ruta_id = p_ruta_id)
  ORDER BY fecha_planificada DESC, pdv_nombre ASC;
END;
$$;

-- ============================================================
-- get_reporte_incidencias_garantias
-- ============================================================
CREATE OR REPLACE FUNCTION get_reporte_incidencias_garantias(
  p_desde DATE,
  p_hasta DATE,
  p_tipo TEXT DEFAULT NULL,
  p_pdv_id UUID DEFAULT NULL
)
RETURNS TABLE (
  tipo_registro TEXT,
  pdv_nombre TEXT,
  descripcion_o_motivo TEXT,
  estado TEXT,
  fecha_apertura TIMESTAMPTZ,
  fecha_cierre TIMESTAMPTZ,
  dias_abierta INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_reportes_analiticos_access();

  RETURN QUERY
  SELECT
    registros.tipo_registro,
    registros.pdv_nombre,
    registros.descripcion_o_motivo,
    registros.estado,
    registros.fecha_apertura,
    registros.fecha_cierre,
    registros.dias_abierta
  FROM (
    SELECT
      'incidencia'::TEXT AS tipo_registro,
      pdv.nombre_comercial AS pdv_nombre,
      COALESCE(i.descripcion, '') AS descripcion_o_motivo,
      i.estado,
      i.fecha_apertura,
      i.fecha_cierre,
      EXTRACT(day FROM COALESCE(i.fecha_cierre, now()) - i.fecha_apertura)::INT AS dias_abierta,
      i.pdv_id
    FROM incidencias i
    JOIN puntos_de_venta pdv
      ON pdv.id = i.pdv_id
    WHERE
      (i.fecha_apertura AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde AND p_hasta

    UNION ALL

    SELECT
      'garantia'::TEXT AS tipo_registro,
      pdv.nombre_comercial AS pdv_nombre,
      COALESCE(g.motivo, '') AS descripcion_o_motivo,
      g.estado,
      g.created_at AS fecha_apertura,
      CASE WHEN g.estado = 'cerrada' THEN g.updated_at ELSE NULL END AS fecha_cierre,
      EXTRACT(
        day FROM COALESCE(
          CASE WHEN g.estado = 'cerrada' THEN g.updated_at ELSE NULL END,
          now()
        ) - g.created_at
      )::INT AS dias_abierta,
      g.pdv_id
    FROM garantias g
    JOIN puntos_de_venta pdv
      ON pdv.id = g.pdv_id
    WHERE
      (g.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde AND p_hasta
  ) AS registros
  WHERE
    (p_tipo IS NULL OR registros.tipo_registro = p_tipo)
    AND (p_pdv_id IS NULL OR registros.pdv_id = p_pdv_id)
  ORDER BY registros.fecha_apertura DESC, registros.pdv_nombre ASC;
END;
$$;

REVOKE ALL ON FUNCTION get_reporte_ventas(DATE, DATE, UUID, UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_ranking_vitrinas(DATE, DATE, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_reporte_visitas(DATE, DATE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_reporte_incidencias_garantias(DATE, DATE, TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_reporte_ventas(DATE, DATE, UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ranking_vitrinas(DATE, DATE, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reporte_visitas(DATE, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reporte_incidencias_garantias(DATE, DATE, TEXT, UUID) TO authenticated;
