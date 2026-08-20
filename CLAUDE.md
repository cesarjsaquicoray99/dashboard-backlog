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
  - `2003` → Recolectado (FM) — agregada el 20 ago 2026
  - `3001`/`3002` → Almacén (WH)
  - `3003`/`3004` → Traslado a Partner (SP) — `3003` movido aquí el 20 ago 2026 (decisión
    del usuario: es el código de cuando el partner ya tiene el folio, no cuando sigue en
    almacén)
  - `4001` → En ruta (LM)
  - `4101` → Fallado (LM) — no es terminal, sigue en backlog (se reasigna)
  - `5001`/`5101` → En camino a Devolución (DEV) — antes solo `5101` y la etiqueta decía
    "(TBD)"; el 20 ago 2026 el usuario agregó `5001` a la misma etapa y corrigió la sigla
  - Cualquier código no terminal que no esté en esta lista cae en **"Otro / sin clasificar"**
    (tile "Sin clasificar" en el dashboard) — **no se descarta en silencio**. Usar
    `debugEventos()` desde el editor de Apps Script para ver qué códigos están sin mapear
    y decidir si hay que ampliar `ETAPAS`.
- **Antigüedad (aging)** = días de calendario entre `Último evento: Fecha` y hoy (mide qué
  tan "frío" está el folio, no la antigüedad total del pedido desde su creación).
  Buckets (ampliados a 4 el 20 ago 2026, ver `AGING_BUCKETS` en `Code.gs`): **0 días**
  (azul info, `--brand-blue`) · **1–2 días** (verde) · **3–5 días** (ámbar, atención) ·
  **6+ días** (rojo, crítico). "0 días" arrancó compartiendo el verde con "1–2 días" pero
  no se distinguían en la leyenda/gráficas — se cambió a azul info el mismo 20 ago 2026.
- **Filtros**: Empresa (multiselección), Tipo de envío, Proveedor, Don Veloz (ambos sobre
  `Último evento: Proveedor`/`Nombre Don Veloz`, es decir quién tiene el folio *ahora*, no
  quién lo tuvo en un evento anterior), **No intentados** (agregado 20 ago 2026: folios sin
  fecha de 1er evento en `Entrega fallida` NI en `Entrega confirmada` — checkbox, no
  multiselect), y rango de `ETA Cliente: Fecha` (opcional — a diferencia de
  `monitoreo_entregas`, folios sin ETA **no se excluyen** salvo que el filtro de fecha esté
  activo).

## Vistas del dashboard
- KPI tiles en su propia fila completa (4 columnas: total, % crítico, promedio de días, sin
  clasificar); debajo, **Backlog por etapa** y la **dona de antigüedad** comparten fila
  (`.inicio-grid`, 2fr/1fr) — reordenado el 20 ago 2026 a pedido del usuario (antes las
  tiles compartían fila con la dona y la etapa iba sola debajo).
- **Dona de antigüedad**: `legend: { display: false }` en las options de Chart.js — tenía
  la leyenda nativa activada A LA VEZ que `#lista-aging` (el HTML propio que ya usa el resto
  del dashboard), duplicadas y peleando por el mismo espacio dentro del canvas chico; por
  eso se veía amontonada. Si se vuelve a tocar esta gráfica, la leyenda nativa debe quedar
  `display: false` — la real es siempre `#lista-aging`.
- **Backlog por etapa**: barra apilada (etapa × aging), con tabla accesible ("Ver tabla").
- **Backlog por último movimiento** y **Backlog por ETA**: dos tarjetas separadas (hasta el
  20 ago 2026 eran una sola, "Evolución del backlog", basada solo en último evento; el
  usuario pidió que el eje X fuera la fecha ETA y, en vez de reemplazar, se separó en dos
  vistas porque miden cosas distintas — no cambiarlas de nuevo a una sola sin confirmar con
  el usuario):
  - **Por último movimiento** (`porUltimoEvento_` en `Code.gs`): folios agrupados por
    `Último evento: Fecha` — mide cuándo se atascó cada folio, "qué tan frío" está.
    **Importante**: NO es una serie histórica del tamaño del backlog día a día (no hay
    snapshots del pasado, solo el estado actual de cada folio) — es la distribución de
    folios *que siguen en backlog hoy* según cuándo se atascaron.
  - **Por ETA** (`porEta_` en `Code.gs`, agregada 20 ago 2026): folios agrupados por
    `ETA Cliente: Fecha` — para cuándo estaba prometida la entrega. Folios sin ETA quedan
    fuera de esta vista (no se pueden ubicar en el eje) — a diferencia de los filtros de la
    barra superior, donde folios sin ETA sí se incluyen salvo que el filtro de fecha esté
    activo (ver "Definiciones de negocio" arriba); son dos cosas distintas.
  - Ambas comparten toggle Día/Semana/Mes sin volver a pedir datos al servidor, vía la
    fábrica `crearSerieTemporal(prefijo)` en `Index.html` (reemplazó las funciones sueltas
    `graficaFecha`/`cambiarGranFecha` de una sola instancia) — cada instancia tiene su
    propio estado y sus propios ids en el DOM: canvas `ch-<prefijo>`, botones
    `btn-<prefijo>-dia/semana/mes`, tabla `t-<prefijo>` (prefijos actuales: `ultmov`, `eta`).
    Si se agrega una tercera serie temporal, se llama `crearSerieTemporal('<prefijo-nuevo>')`
    con sus botones/canvas/tabla ya en el HTML — no hay que duplicar la lógica.
  - **Eje X agrupado por mes** (plugin casero `ejeAgrupado` en `Index.html`, compartido por
    ambas): en Día el eje muestra el número de día y en Semana el número de semana ISO
    ("Wnn"), con una fila debajo con el nombre del mes y una línea separadora en cada cambio
    de mes; en Mes cada barra ya es un mes, así que se oculta la fila de ticks primaria y
    solo queda esa fila (nombre del mes + separador entre cada una). La agrupación asume que
    los datos del backend vienen ordenados por fecha (tramos de mes contiguos, sin huecos) —
    si eso cambia, `gruposPorMes` deja de servir.
- **Backlog por cliente** / **Backlog por proveedor**: tablas ordenables (clic en encabezado),
  mismo desglose de aging que la etapa (`porCliente_`/`porProveedor_` en `Code.gs`).
- **Backlog por evento**: tabla ordenable por el código crudo de 4 caracteres (sin pasar por
  el mapeo de `ETAPAS`), con la etapa resuelta como columna adicional — sirve como vista
  rápida de qué códigos caen en "Otro / sin clasificar" sin tener que abrir el editor de
  Apps Script a correr `debugEventos()` (aunque esa función sigue disponible para diagnóstico
  puntual).
- **Folios más antiguos**: detalle a nivel de folio. El backend (`detalleMasAntiguos_`) ya
  **no** recorta a un top N fijo (se quitó `CONFIG.TOP_DETALLE` el 20 ago 2026) — manda
  **todos** los folios filtrados, ordenados por días sin avance descendente; el recorte a
  10/25/50 (`topDetalle`, dropdown `#f-top-detalle`, default 25) lo hace el frontend sin
  volver a pedir datos, mismo patrón que Día/Semana/Mes en Evolución. Por eso hay dos
  botones de copiado con alcance distinto: **"Copiar folios visibles"** (solo las filas
  que se están mostrando, respeta el top N y el orden de columna actual) y **"Copiar todos
  los filtrados"** (el backlog completo que cumple los filtros activos, sin el recorte).
  Se agregó a pedido del usuario tras notar que los folios de "0 días" nunca aparecían en
  la tabla — no era un bug, era el recorte fijo a 50 descartándolos por ser los menos
  urgentes; la solución no fue subir el tope sino hacerlo configurable y separar "lo que
  se ve" de "lo que se puede copiar".
- Las tres tablas agrupadas (cliente/proveedor/evento) comparten el render `pintarTablaAgrupada()`
  en `Index.html` — misma forma de datos desde el backend (`{...claves de BUCKETS_AGING,
  sinAging, total, ...clave(s)}`), solo cambia la(s) columna(s) identificadora(s).

## Filas de tabla como filtro (cross-filter, multi-selección desde el 20 ago 2026)
- Clic en una fila de **Cliente**, **Proveedor**, **Evento** o **Etapa** suma ese valor al
  filtro (no lo reemplaza) y recarga (`cargar()`); clic en una fila ya activa la quita. Se
  puede seleccionar más de un cliente/proveedor/etapa/evento a la vez — el filtro resultante
  es la unión (OR) dentro de cada dimensión, AND entre dimensiones distintas. Antes (hasta
  v8) clickear reemplazaba la selección completa; el cambio fue pedido explícitamente por
  el usuario porque al clickear un segundo cliente se perdía el primero.
- Las 4 dimensiones se guardan como `Set` en el frontend, nunca como un valor único:
  - **Empresa** y **Proveedor**: cada uno tiene su propio widget multiselect (buscador +
    checkboxes) en la barra de filtros, creados con la fábrica genérica `crearMultisel()`
    en `Index.html` (antes solo Empresa tenía este widget; Proveedor era un `<select>`
    simple — se unificó para poder acumular selección tanto desde la barra como desde la
    fila de la tabla, sin dos mecanismos distintos para el mismo campo). `crearMultisel()`
    devuelve `{ sel, llenarOpciones, alternar, limpiar }`; `sel` es el Set que comparten la
    barra y el clic en fila.
  - **Etapa** y **Evento** no tienen control propio en la barra (nunca lo tuvieron): viven
    en `etapasSel`/`eventosSel` (Sets de clave/código) + `etapasEtiquetas`/`eventosEtapas`
    (mapas clave→etiqueta, solo para poder mostrar el chip sin recalcularlo).
  - Se mandan como `params.empresas`/`params.proveedores`/`params.etapas`/`params.eventos`
    (arrays) a `getBacklogData`, que filtra con `indexOf(...) !== -1` contra cada uno
    (mismo patrón para las 4, ver `Code.gs`).
- **Chips de filtros activos** (`#chips-filtro`): Empresa/Proveedor muestran un solo chip
  colapsado ("Proveedor: 3 seleccionados", igual que Empresa); Etapa/Evento muestran **un
  chip por valor seleccionado** (no hay control de barra que los colapse) — cada chip se
  quita individual con `tipo: 'etapa:<clave>'`/`'evento:<codigo>'`. "Limpiar todos" aparece
  si hay 2+ filtros activos en total.
- La fila activa se resalta (`.fila-filtrable.activa`) comparando contra el Set
  correspondiente (`activoSel.has(...)` en `pintarTablaAgrupada()`/`pintarTablaEtapa()`),
  no contra un valor único.
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
