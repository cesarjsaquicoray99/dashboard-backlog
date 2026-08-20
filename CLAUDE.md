# Dashboard de Backlog — 99minutos (Google Apps Script Web App)

Dashboard de una sola vista para monitorear el **backlog** (pedidos sin evento terminal) de
la operación: en qué etapa está atascado cada folio y cuántos días lleva sin avanzar.

## Archivos y flujo de trabajo
- `Code.js` — backend: lee el gsheet "Backlog - PE", agrega por etapa/antigüedad y expone
  `getBacklogData(params)` vía `google.script.run`. Se llama `Code.js` en local (no
  `Code.gs`) por convención de `clasp` — en el editor de Apps Script se sigue viendo como
  `Code.gs`.
- `Index.html` — frontend completo (CSS + JS inline, Chart.js 4.4.0 por CDN).
- **Deploy**: `clasp push` sube los archivos al editor, pero **no** actualiza el Web App en
  producción — para eso hace falta `clasp deploy` (o crear manualmente "Nueva versión" del
  deployment desde el editor). Recordárselo al usuario en cada entrega.
- El usuario edita los archivos por su cuenta entre sesiones: **verificar el contenido
  actual (Grep/Read) antes de cada Edit**, no asumir que está como se dejó.

## Control de versiones (conectado 20 ago 2026)
- **Repo local**: `git init` en esta carpeta, rama `main`.
- **GitHub**: [github.com/cesarjsaquicoray99/dashboard-backlog](https://github.com/cesarjsaquicoray99/dashboard-backlog)
  (remoto `origin`), sincronizado.
- **Apps Script ↔ local**: vinculado vía `clasp` (`npm install -g @google/clasp`,
  `clasp login` con la cuenta `cesar.saquicoray@99minutos.com`). Script ID en `.clasp.json`
  (gitignoreado, no sube a GitHub — no es secreto grave pero no aporta al repo compartido).
- **`.gitignore`**: excluye `.clasp.json`, `.clasprc.json`, `node_modules/`.
- **Verificado en la conexión inicial**: el código del editor de Apps Script era idéntico
  byte a byte al local antes de vincular (sin pérdida de cambios); se probó un
  push/pull/revert de ida y vuelta confirmando que los acentos/UTF-8 no se corrompen.
- **Flujo de trabajo con esta conexión**:
  ```
  editar Code.js / Index.html
  clasp push        → sube al editor de Apps Script
  clasp deploy       → nueva versión del deployment (o manual desde el editor)
  git add -A; git commit -m "..."; git push   → versiona en GitHub
  ```
- Pendiente si se quiere automatizar más: alias/script que encadene push + commit + push,
  o GitHub Actions con credenciales de clasp como secret (no configurado aún).

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
  Buckets (ampliados a 4 el 20 ago 2026, ver `AGING_BUCKETS` en `Code.gs`): **0 días** ·
  **1–2 días** · **3–5 días** (atención) · **6+ días** (crítico). "0" y "1–2" comparten el
  verde de la paleta (ambos "sin urgencia"); no se definió un color aparte para "0 días".
- **Filtros**: Empresa (multiselección), Tipo de envío, Proveedor, Don Veloz (ambos sobre
  `Último evento: Proveedor`/`Nombre Don Veloz`, es decir quién tiene el folio *ahora*, no
  quién lo tuvo en un evento anterior), **No intentados** (agregado 20 ago 2026: folios sin
  fecha de 1er evento en `Entrega fallida` NI en `Entrega confirmada` — checkbox, no
  multiselect), y rango de `ETA Cliente: Fecha` (opcional — a diferencia de
  `monitoreo_entregas`, folios sin ETA **no se excluyen** salvo que el filtro de fecha esté
  activo).

## Vistas del dashboard
- KPI tiles + dona de antigüedad (headline: total, % crítico, promedio de días, sin clasificar).
- **Backlog por etapa**: barra apilada (etapa × aging), con tabla accesible ("Ver tabla").
- **Evolución del backlog**: barras (con data labels) de folios en backlog agrupados por la fecha de su
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
- Buckets de aging (0 / 1–2 / 3–5 / 6+ días) confirmados por el usuario el 20 ago 2026 —
  ya no es una propuesta pendiente de validar.
- Verificado contra la hoja real (`BD` del spreadsheet "Backlog - PE") el 20 ago 2026: el
  usuario compartió una captura del dashboard corriendo con datos reales (504 folios en
  backlog de 74058 en la hoja, "Sin clasificar": 0) — los nombres de columna en `HEADERS`
  matchean. Si se agregan columnas nuevas (como se hizo con "Entrega fallida"/"Entrega
  confirmada" para el filtro "No intentados"), seguir confirmando con
  `debugColumnas()`/`testConnection()`.
- **Ejecutar `debugEventos()`** contra datos reales para confirmar que `ETAPAS` cubre todos
  los códigos no terminales que aparecen en la hoja; ampliar el mapeo si "Sin clasificar"
  sale alto (aunque en la captura del 20 ago salió en 0).
- El filtro "Don Veloz" es un `<select>` simple; si la lista de veloces crece mucho, migrar
  a un multiselect con buscador (como el de Empresa).
