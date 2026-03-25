-- ============================================================
-- Índices de soporte para dashboard y reportes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_visitas_fecha_inicio_estado
  ON visitas(fecha_hora_inicio, estado);

CREATE INDEX IF NOT EXISTS idx_cobros_fecha
  ON cobros(fecha);

CREATE INDEX IF NOT EXISTS idx_incidencias_fecha_apertura
  ON incidencias(fecha_apertura);

CREATE INDEX IF NOT EXISTS idx_garantias_created_at
  ON garantias(created_at);

-- ============================================================
-- Vista: v_dashboard_hoy
-- KPIs operativos del día de negocio actual (America/Bogota)
-- ============================================================
CREATE OR REPLACE VIEW v_dashboard_hoy AS
WITH fecha_operacion AS (
  SELECT (now() AT TIME ZONE 'America/Bogota')::date AS hoy
),
visitas_hoy AS (
  SELECT v.*
  FROM visitas v
  CROSS JOIN fecha_operacion fo
  WHERE COALESCE(
    (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date,
    (v.created_at AT TIME ZONE 'America/Bogota')::date
  ) = fo.hoy
)
SELECT
  COALESCE(
    (
      SELECT SUM(dv.subtotal_cobro)
      FROM visitas_hoy vh
      JOIN detalle_visita dv ON dv.visita_id = vh.id
      WHERE vh.estado = 'completada'
    ),
    0
  ) AS ventas_hoy,
  COALESCE(
    (
      SELECT COUNT(*)
      FROM visitas_hoy
      WHERE estado = 'completada'
    ),
    0
  ) AS visitas_realizadas,
  COALESCE(
    (
      SELECT COUNT(*)
      FROM visitas_hoy
    ),
    0
  ) AS visitas_planificadas,
  COALESCE(
    (
      SELECT SUM(c.monto)
      FROM cobros c
      WHERE date_trunc('month', c.fecha AT TIME ZONE 'America/Bogota')
        = date_trunc('month', now() AT TIME ZONE 'America/Bogota')
    ),
    0
  ) AS cobros_mes,
  COALESCE(
    (
      SELECT COUNT(*)
      FROM incidencias i
      WHERE i.estado IN ('abierta', 'en_analisis')
    ),
    0
  ) AS incidencias_abiertas;

-- ============================================================
-- Vista: v_incidencias_abiertas_recientes
-- Ultimas 5 incidencias abiertas o en analisis con antiguedad
-- ============================================================
CREATE OR REPLACE VIEW v_incidencias_abiertas_recientes AS
SELECT
  i.id AS incidencia_id,
  pdv.nombre_comercial AS pdv_nombre,
  i.tipo,
  i.fecha_apertura,
  EXTRACT(day FROM now() - i.fecha_apertura)::INT AS dias_abierta
FROM incidencias i
JOIN puntos_de_venta pdv
  ON pdv.id = i.pdv_id
WHERE i.estado IN ('abierta', 'en_analisis')
ORDER BY i.fecha_apertura DESC
LIMIT 5;

-- ============================================================
-- Vista: v_stock_bajo
-- Productos de surtido estándar por debajo de 30% del objetivo
-- ============================================================
CREATE OR REPLACE VIEW v_stock_bajo AS
SELECT
  iv.vitrina_id,
  iv.producto_id,
  iv.cantidad_actual AS stock_actual,
  se.cantidad_objetivo,
  ROUND((iv.cantidad_actual::NUMERIC / se.cantidad_objetivo::NUMERIC) * 100, 1) AS pct_stock,
  pdv.nombre_comercial AS pdv_nombre,
  p.nombre AS producto_nombre
FROM inventario_vitrina iv
JOIN surtido_estandar se
  ON se.vitrina_id = iv.vitrina_id
  AND se.producto_id = iv.producto_id
JOIN vitrinas vit
  ON vit.id = iv.vitrina_id
JOIN puntos_de_venta pdv
  ON pdv.id = vit.pdv_id
JOIN productos p
  ON p.id = iv.producto_id
WHERE
  se.cantidad_objetivo > 0
  AND (iv.cantidad_actual::NUMERIC / se.cantidad_objetivo::NUMERIC) < 0.30
ORDER BY pct_stock ASC, pdv.nombre_comercial, p.nombre;

-- ============================================================
-- Vista: v_ventas_30_dias
-- Serie diaria de ventas de los últimos 30 días de negocio
-- ============================================================
CREATE OR REPLACE VIEW v_ventas_30_dias AS
WITH fecha_operacion AS (
  SELECT (now() AT TIME ZONE 'America/Bogota')::date AS hoy
)
SELECT
  (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date AS fecha,
  COALESCE(SUM(dv.subtotal_cobro), 0) AS total_ventas
FROM visitas v
JOIN detalle_visita dv
  ON dv.visita_id = v.id
CROSS JOIN fecha_operacion fo
WHERE
  v.estado = 'completada'
  AND (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date BETWEEN (fo.hoy - 29) AND fo.hoy
GROUP BY (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date
ORDER BY fecha ASC;

-- ============================================================
-- Vista: v_ventas_por_ruta_mes
-- Ventas del mes actual por ruta y colaboradora
-- ============================================================
CREATE OR REPLACE VIEW v_ventas_por_ruta_mes AS
WITH mes_operacion AS (
  SELECT date_trunc('month', now() AT TIME ZONE 'America/Bogota')::date AS inicio_mes
)
SELECT
  COALESCE(r.nombre, 'Sin ruta') AS ruta,
  COALESCE(u.nombre, 'Sin colaboradora') AS colaboradora,
  COALESCE(SUM(dv.subtotal_cobro), 0) AS total_ventas
FROM visitas v
LEFT JOIN rutas r
  ON r.id = v.ruta_id
LEFT JOIN usuarios u
  ON u.id = v.colaboradora_id
JOIN detalle_visita dv
  ON dv.visita_id = v.id
CROSS JOIN mes_operacion mo
WHERE
  v.estado = 'completada'
  AND (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date >= mo.inicio_mes
GROUP BY COALESCE(r.nombre, 'Sin ruta'), COALESCE(u.nombre, 'Sin colaboradora')
ORDER BY total_ventas DESC, ruta, colaboradora;

-- ============================================================
-- Vista: v_top_vitrinas_mes
-- Top 10 vitrinas del mes por ventas
-- ============================================================
CREATE OR REPLACE VIEW v_top_vitrinas_mes AS
WITH mes_operacion AS (
  SELECT date_trunc('month', now() AT TIME ZONE 'America/Bogota')::date AS inicio_mes
)
SELECT
  vit.id AS vitrina_id,
  pdv.nombre_comercial AS pdv_nombre,
  COALESCE(SUM(dv.subtotal_cobro), 0) AS total_ventas
FROM visitas v
JOIN vitrinas vit
  ON vit.id = v.vitrina_id
JOIN puntos_de_venta pdv
  ON pdv.id = vit.pdv_id
JOIN detalle_visita dv
  ON dv.visita_id = v.id
CROSS JOIN mes_operacion mo
WHERE
  v.estado = 'completada'
  AND (v.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date >= mo.inicio_mes
GROUP BY vit.id, pdv.nombre_comercial
ORDER BY total_ventas DESC, pdv.nombre_comercial
LIMIT 10;

GRANT SELECT ON v_dashboard_hoy TO authenticated;
GRANT SELECT ON v_incidencias_abiertas_recientes TO authenticated;
GRANT SELECT ON v_stock_bajo TO authenticated;
GRANT SELECT ON v_ventas_30_dias TO authenticated;
GRANT SELECT ON v_ventas_por_ruta_mes TO authenticated;
GRANT SELECT ON v_top_vitrinas_mes TO authenticated;
