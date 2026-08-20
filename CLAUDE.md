# Dashboard de Backlog — 99minutos (Google Apps Script Web App)

Dashboard de una sola vista para monitorear el **backlog** (pedidos sin evento terminal) de
la operación: en qué etapa está atascado cada folio y cuántos días lleva sin avanzar.

## Archivos y flujo de trabajo
- `Code.gs` — backend: lee el gsheet "Backlog - PE", agrega por etapa/antigüedad y expone
  `getBacklogData(params)` vía `google.script.run`.
- `Index.html` — frontend completo (CSS + JS inline, Chart.js 4.4.0 por CDN).
- **Deploy**: copiar ambos archivos al editor de Apps Script y crear **"Nueva versión"
  del deployment** para ver cambios. Recordárselo al usuario en cada entrega.
- El usuario edita los archivos por su cuenta entre sesiones: **verificar el contenido
  actual (Grep/Read) antes de cada Edit**, no asumir que está como se dejó.

## Fuente de datos
- Spreadsheet **"Backlog - PE"** (`1yt-vTk6oZWbX0uHbqhUOu9DahmaBgikArUz_QUIwx8Y`), hoja **`BD`**.
  Es una fuente **distinta** de la que usa `monitoreo_entregas` (que lee `BASE`), aunque el
  esquema de columnas es muy similar (mismo modelo de folio/eventos de 99minutos).
- `CONFIG.SPREADSHEET_ID`/`SHEET_NAME` están fijos en `Code.gs`; si el usuario mueve la hoja
  o le cambia el nombre, ajustar ahí.

## Definiciones de negocio (decisiones del usuario, 13 ago 2026)
- **Backlog** = folios cuyo `Último evento: Evento` (4 primeros caracteres) **no** es uno de
  los eventos terminales `4002, 5002, 8002, 8003, 8004`. Los folios **sin ningún evento**
  (columna vacía) están **excluidos** del backlog (decisión explícita del usuario, no son
  "recién creados en backlog").
- **Etapas** (mapeadas por el mismo código de 4 caracteres, ver `ETAPAS` en `Code.gs`):
  - `3001`/`3002`/`3003` → Almacén (WH)
  - `3004` → Traslado a Partner (SP)
  - `4001` → En ruta (LM)
  - `4101` → Fallado (LM) — no es terminal, sigue en backlog (se reasigna)
  - `5101` → En camino a Devolución (TBD)
  - Cualquier código no terminal que no esté en esta lista cae en **"Otro / sin clasificar"**
    (tile "Sin clasificar" en el dashboard) — **no se descarta en silencio**. Usar
    `debugEventos()` desde el editor de Apps Script para ver qué códigos están sin mapear
    y decidir si hay que ampliar `ETAPAS`.
- **Antigüedad (aging)** = días de calendario entre `Último evento: Fecha` y hoy (mide qué
  tan "frío" está el folio, no la antigüedad total del pedido desde su creación).
  Buckets: **0–2 días** (reciente) · **3–5 días** (atención) · **6+ días** (crítico).
  Estos rangos son una propuesta inicial mía, no una regla de negocio confirmada — **validar
  con el usuario** si necesita otro corte.
- **Filtros**: Empresa (multiselección), Tipo de envío, Proveedor, Don Veloz (ambos sobre
  `Último evento: Proveedor`/`Nombre Don Veloz`, es decir quién tiene el folio *ahora*, no
  quién lo tuvo en un evento anterior), y rango de `ETA Cliente: Fecha` (opcional — a
  diferencia de `monitoreo_entregas`, folios sin ETA **no se excluyen** salvo que el filtro
  de fecha esté activo).

## Vistas del dashboard
- KPI tiles + dona de antigüedad (headline: total, % crítico, promedio de días, sin clasificar).
- **Backlog por etapa**: barra apilada (etapa × aging), con tabla accesible ("Ver tabla").
- **Evolución del backlog**: línea de folios en backlog agrupados por la fecha de su
  `Último evento: Fecha`, con toggle Día/Semana/Mes. **Importante**: esto NO es una serie
  histórica del tamaño del backlog día a día (no hay snapshots del pasado, solo el estado
  actual de cada folio) — es la distribución de folios *que siguen en backlog hoy* según
  cuándo se atascaron. El backend (`porFecha_`) manda solo el detalle diario; el frontend
  re-agrupa a semana (lunes ISO) o mes sin volver a pedir datos al servidor, mismo patrón
  de buckets diarios + toggle que ya usa `KPI_Dashboard`.
- **Backlog por cliente** / **Backlog por proveedor**: tablas ordenables (clic en encabezado),
  mismo desglose de aging que la etapa (`porCliente_`/`porProveedor_` en `Code.gs`).
- **Backlog por evento**: tabla ordenable por el código crudo de 4 caracteres (sin pasar por
  el mapeo de `ETAPAS`), con la etapa resuelta como columna adicional — sirve como vista
  rápida de qué códigos caen en "Otro / sin clasificar" sin tener que abrir el editor de
  Apps Script a correr `debugEventos()` (aunque esa función sigue disponible para diagnóstico
  puntual).
- **Folios más antiguos**: detalle a nivel de folio (top `CONFIG.TOP_DETALLE`), con copiado
  de la lista de folios al portapapeles.
- Las tres tablas agrupadas (cliente/proveedor/evento) comparten el render `pintarTablaAgrupada()`
  en `Index.html` — misma forma de datos desde el backend (`{reciente, atencion, critico,
  sinAging, total, ...clave(s)}`), solo cambia la(s) columna(s) identificadora(s).

## Filas de tabla como filtro (cross-filter)
- Clic en una fila de **Cliente**, **Proveedor**, **Evento** o **Etapa** aplica ese valor
  como filtro y recarga (`cargar()`); clic en la misma fila otra vez lo quita (toggle).
  Cliente/Proveedor reusan los controles ya existentes en la barra de filtros (multiselect
  de empresa / select de proveedor) — clickear la fila solo los setea. Etapa y Evento **no**
  tienen control propio en la barra: viven en `filtroEtapa`/`filtroEvento` (variables de
  frontend) y se mandan como `params.etapa`/`params.evento` a `getBacklogData`, que filtra
  comparando contra `etapaDe_(f.ultimoEvento).clave` / `f.ultimoEvento` directamente.
- **Chips de filtros activos** (`#chips-filtro`, debajo de la barra de filtros): resumen de
  TODO lo que está filtrando ahora (incluye los controles de la barra Y los de fila-clic),
  cada uno removible individualmente; "Limpiar todos" aparece si hay 2+ filtros activos.
- La fila activa se resalta (`.fila-filtrable.activa`) comparando contra el valor actual del
  control correspondiente (o de `filtroEtapa`/`filtroEvento`) — se recalcula en cada
  `pintarProveedores()`/`pintarClientes()`/`pintarEventos()`/`pintarTablaEtapa()`.
- La tabla de "Folios más antiguos" (`t-detalle`) **no** es clicable como filtro — es el
  nivel de detalle final, no una dimensión de agrupación.

## Paleta (dataviz aplicado)
- Usa la **paleta de marca 99minutos** del CLAUDE.md raíz, no la paleta genérica de la
  skill `dataviz`: `--status-good #85C440`, `--status-warning #FFA000`,
  `--status-critical #E53935` para los buckets de aging; `--brand-navy #12344A` para
  botones/acentos; `--status-muted` (slate) para "sin fecha de evento".
- El único chart categórico (identidad = etapa) no necesita paleta propia: la barra
  apilada "Backlog por etapa" codifica la etapa en el eje Y (etiqueta) y el aging en el
  color de los segmentos — evita duplicar codificación de color por dos dimensiones a la vez.
- Leyenda de aging renderizada como HTML propio (no la leyenda nativa de Chart.js) para
  mantener ícono + etiqueta visible siempre, incluso con la gráfica colapsada en "Ver tabla".

## Gotchas heredados de monitoreo_entregas / KPI_Dashboard (aplican aquí)
- `google.script.run` elimina propiedades `null` → comparar con `== null` / `!= null`,
  nunca `!==`/`===` contra null.
- Ejes Chart.js: formatear ticks con `+Number(v).toFixed(n)` por errores de punto flotante
  (no aplica todavía aquí porque no hay ejes decimales, pero si se agregan promedios en el
  eje, tenerlo presente).

## Pendientes latentes
- **Validar buckets de aging** (0–2 / 3–5 / 6+ días) con el usuario — son una propuesta,
  no una definición confirmada.
- **Ejecutar `debugEventos()`** contra datos reales para confirmar que `ETAPAS` cubre todos
  los códigos no terminales que aparecen en la hoja; ampliar el mapeo si "Sin clasificar"
  sale alto.
- El filtro "Don Veloz" es un `<select>` simple; si la lista de veloces crece mucho, migrar
  a un multiselect con buscador (como el de Empresa).
- No se ha podido verificar contra la hoja real (`BD` del spreadsheet "Backlog - PE") — los
  nombres de columna en `HEADERS` están tomados literalmente de la lista que pasó el usuario;
  confirmar con `debugColumnas()`/`testConnection()` en la primera corrida real.
