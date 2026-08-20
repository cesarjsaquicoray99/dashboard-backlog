const CONFIG = {
  SPREADSHEET_ID: '1yt-vTk6oZWbX0uHbqhUOu9DahmaBgikArUz_QUIwx8Y', // "Backlog - PE"
  SHEET_NAME: 'BD',
  HEADER_ROW: 1,
  TOP_DETALLE: 50 // folios más antiguos a mostrar en la tabla de detalle
};

// Etapas del backlog, resueltas por los 4 primeros caracteres de "Último evento: Evento"
// (mapeo confirmado por el usuario, 13 ago 2026). Un código que no aparezca aquí y que
// tampoco sea terminal cae en "Otro / sin clasificar" — revisar con debugEventos().
const ETAPAS = [
  { clave: 'almacen',              etiqueta: 'Almacén (WH)',                 codigos: ['3001', '3002', '3003'] },
  { clave: 'traslado_partner',     etiqueta: 'Traslado a Partner (SP)',      codigos: ['3004'] },
  { clave: 'en_ruta',              etiqueta: 'En ruta (LM)',                 codigos: ['4001'] },
  { clave: 'fallado',              etiqueta: 'Fallado (LM)',                 codigos: ['4101'] },
  { clave: 'en_camino_devolucion', etiqueta: 'En camino a Devolución (TBD)', codigos: ['5101'] }
];

// Eventos terminales (definición del usuario): un folio cuyo "Último evento" empiece con
// alguno de estos códigos ya NO es backlog. Los folios sin ningún evento tampoco cuentan
// (excluidos, decisión del usuario) — quedan fuera de esBacklog_ por no tener código.
const EVENTOS_TERMINALES = ['4002', '5002', '8002', '8003', '8004'];

// Buckets de aging (antigüedad = días sin avance desde "Último evento: Fecha",
// decisión del usuario, ampliados a 4 el 20 ago 2026). Los colores mapean a la paleta
// de marca (ver Index.html) — "hoy" y "reciente" comparten el verde, son ambos "sin urgencia".
const AGING_BUCKETS = [
  { clave: 'hoy',      etiqueta: '0 días',   color: 'good',     max: 0 },
  { clave: 'reciente', etiqueta: '1–2 días', color: 'good',     max: 2 },
  { clave: 'atencion', etiqueta: '3–5 días', color: 'warning',  max: 5 },
  { clave: 'critico',  etiqueta: '6+ días',  color: 'critical', max: Infinity }
];

// Candidatos de encabezado por campo lógico (solo los que usa este dashboard).
// Comparación normalizada (minúsculas, sin acentos, espacios colapsados); primero
// coincidencia exacta, luego "empieza con". Ajustar aquí si cambian los nombres en la hoja.
const HEADERS = {
  folio:             ['Folio'],
  empresa:           ['Empresa'],
  tipoEnvio:         ['Tipo de envío'],
  etaFecha:          ['ETA Cliente: Fecha'],
  ultimoEventoFecha: ['Último evento: Fecha'],
  ultimoEvento:      ['Último evento: Evento'],
  donVeloz:          ['Último evento: Nombre Don Veloz'],
  proveedor:         ['Último evento: Proveedor'],
  entregaFallidaFecha:    ['Entrega fallida: Fecha (1er evento)'],
  entregaConfirmadaFecha: ['Entrega confirmada: Fecha (1er evento)']
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Backlog — 99minutos')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function normalizar_(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/["""']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolverColumnas_(filaEncabezados) {
  const normalizados = filaEncabezados.map(normalizar_);
  const cols = {};
  const faltantes = [];
  Object.keys(HEADERS).forEach(function(clave) {
    let idx = -1;
    for (const candidato of HEADERS[clave]) {
      const n = normalizar_(candidato);
      idx = normalizados.indexOf(n);
      if (idx === -1) idx = normalizados.findIndex(function(h) { return h.indexOf(n) === 0; });
      if (idx !== -1) break;
    }
    if (idx === -1) faltantes.push(clave);
    cols[clave] = idx;
  });
  if (faltantes.length) {
    throw new Error('Columnas no encontradas en la hoja: ' + faltantes.join(', ') +
      '. Revisar HEADERS en Code.gs contra los encabezados reales.');
  }
  return cols;
}

function abrirHoja_() {
  const ss = CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!hoja) throw new Error('No existe la hoja "' + CONFIG.SHEET_NAME + '" en el spreadsheet.');
  return hoja;
}

function comoFecha_(v) {
  if (v == null || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? null : v;
  const s = String(v).trim();
  // Formato latino dd/mm/yyyy o dd-mm-yyyy, con hora opcional
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(anio, Number(m[2]) - 1, Number(m[1]),
      Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    return isNaN(d) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Solo usa los 4 primeros caracteres del "Último evento: Evento" (formato de la hoja,
// ej. "4002 - Entrega confirmada" → "4002").
function primeros4_(v) {
  return String(v == null ? '' : v).trim().slice(0, 4);
}

function etapaDe_(codigo) {
  for (const e of ETAPAS) if (e.codigos.indexOf(codigo) !== -1) return e;
  return { clave: 'otro', etiqueta: 'Otro / sin clasificar' };
}

function esBacklog_(codigo) {
  if (!codigo) return false; // sin ningún evento aún → excluido (decisión del usuario)
  return EVENTOS_TERMINALES.indexOf(codigo) === -1;
}

function bucketAging_(dias) {
  for (const b of AGING_BUCKETS) if (dias <= b.max) return b;
  return AGING_BUCKETS[AGING_BUCKETS.length - 1];
}

// Objeto acumulador con una clave en 0 por cada bucket de AGING_BUCKETS (más sinAging/total),
// usado por porEtapa_/porProveedor_/porCliente_/porEvento_ para no repetir la lista de
// claves a mano en cada uno.
function nuevoAcumuladorAging_(extra) {
  const o = Object.assign({}, extra, { sinAging: 0, total: 0 });
  AGING_BUCKETS.forEach(function(b) { o[b.clave] = 0; });
  return o;
}

// Días completos entre dos fechas, comparando solo la parte de calendario (ignora la hora).
function diasEntre_(fecha, hoy) {
  const a = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((b - a) / 86400000);
}

function leerFolios_() {
  const hoja = abrirHoja_();
  const valores = hoja.getDataRange().getValues();
  const cols = resolverColumnas_(valores[CONFIG.HEADER_ROW - 1]);
  const folios = [];
  for (let i = CONFIG.HEADER_ROW; i < valores.length; i++) {
    const fila = valores[i];
    if (fila[cols.folio] === '' || fila[cols.folio] == null) continue;
    folios.push({
      folio: String(fila[cols.folio]),
      empresa: String(fila[cols.empresa] || 'Sin empresa'),
      tipoEnvio: String(fila[cols.tipoEnvio] || 'Sin tipo'),
      eta: comoFecha_(fila[cols.etaFecha]),
      ultimoEventoFecha: comoFecha_(fila[cols.ultimoEventoFecha]),
      ultimoEvento: primeros4_(fila[cols.ultimoEvento]),
      donVeloz: String(fila[cols.donVeloz] || ''),
      proveedor: String(fila[cols.proveedor] || ''),
      // "No intentados" (decisión del usuario, 20 ago 2026): ni la entrega fallida ni la
      // confirmada tienen fecha de primer evento — al folio no se le intentó entregar aún.
      noIntentado: comoFecha_(fila[cols.entregaFallidaFecha]) == null &&
        comoFecha_(fila[cols.entregaConfirmadaFecha]) == null
    });
  }
  return folios;
}

function listaUnica_(folios, campo) {
  const set = {};
  folios.forEach(function(f) { set[f[campo]] = true; });
  return Object.keys(set).sort();
}

function calcularKpis_(folios) {
  const total = folios.length;
  const conAging = folios.filter(function(f) { return f.dias != null; });
  const promedio = conAging.length
    ? Math.round(conAging.reduce(function(a, f) { return a + f.dias; }, 0) / conAging.length * 10) / 10
    : null;
  const criticos = folios.filter(function(f) { return f.aging && f.aging.clave === 'critico'; }).length;
  const sinClasificar = folios.filter(function(f) { return f.etapa.clave === 'otro'; }).length;
  return {
    total: total,
    promedioDias: promedio,
    criticos: criticos,
    pctCriticos: total ? Math.round(criticos / total * 1000) / 10 : null,
    sinClasificar: sinClasificar,
    sinFechaEvento: total - conAging.length
  };
}

// Backlog agrupado por etapa, cada uno con su desglose de aging (ver AGING_BUCKETS).
// Incluye SIEMPRE las 5 etapas conocidas (aunque estén en 0) para que el orden no salte
// entre recargas; "Otro" solo aparece si hay folios sin clasificar.
function porEtapa_(folios) {
  const por = {};
  ETAPAS.forEach(function(e) {
    por[e.clave] = nuevoAcumuladorAging_({ etapa: e.clave, etiqueta: e.etiqueta });
  });
  por.otro = nuevoAcumuladorAging_({ etapa: 'otro', etiqueta: 'Otro / sin clasificar' });

  folios.forEach(function(f) {
    const b = por[f.etapa.clave];
    b.total++;
    if (!f.aging) { b.sinAging++; return; }
    b[f.aging.clave]++;
  });

  return Object.keys(por).map(function(k) { return por[k]; })
    .filter(function(b) { return b.total > 0; })
    .sort(function(a, b) { return b.total - a.total; });
}

// Backlog agrupado por proveedor (quien tiene el folio ahora, "Último evento: Proveedor"),
// con el mismo desglose de aging que porEtapa_. Los folios sin proveedor asignado se
// agrupan bajo "Sin proveedor asignado" en vez de perderse.
function porProveedor_(folios) {
  const por = {};
  folios.forEach(function(f) {
    const clave = f.proveedor || 'Sin proveedor asignado';
    if (!por[clave]) por[clave] = nuevoAcumuladorAging_({ proveedor: clave });
    const b = por[clave];
    b.total++;
    if (!f.aging) { b.sinAging++; return; }
    b[f.aging.clave]++;
  });
  return Object.keys(por).map(function(k) { return por[k]; })
    .sort(function(a, b) { return b.total - a.total; });
}

// Backlog agrupado por empresa (cliente), mismo desglose de aging que porEtapa_/porProveedor_.
function porCliente_(folios) {
  const por = {};
  folios.forEach(function(f) {
    const clave = f.empresa;
    if (!por[clave]) por[clave] = nuevoAcumuladorAging_({ empresa: clave });
    const b = por[clave];
    b.total++;
    if (!f.aging) { b.sinAging++; return; }
    b[f.aging.clave]++;
  });
  return Object.keys(por).map(function(k) { return por[k]; })
    .sort(function(a, b) { return b.total - a.total; });
}

// Backlog agrupado por el código crudo de "Último evento: Evento" (sin pasar por el mapeo
// de ETAPAS). Sirve para ver de dónde sale cada etapa y para detectar a simple vista los
// códigos que caen en "Otro / sin clasificar" sin tener que correr debugEventos() aparte.
function porEvento_(folios) {
  const por = {};
  folios.forEach(function(f) {
    const clave = f.ultimoEvento || '(vacío)';
    if (!por[clave]) {
      por[clave] = nuevoAcumuladorAging_({ codigo: clave, etapa: f.etapa.etiqueta });
    }
    const b = por[clave];
    b.total++;
    if (!f.aging) { b.sinAging++; return; }
    b[f.aging.clave]++;
  });
  return Object.keys(por).map(function(k) { return por[k]; })
    .sort(function(a, b) { return b.total - a.total; });
}

// Backlog agrupado por el día calendario de "Último evento: Fecha" (folios sin esa fecha
// quedan fuera, igual que en el aging). Se manda solo el detalle diario; el frontend
// re-agrupa a semana/mes (mismo patrón de buckets diarios + toggle que KPI_Dashboard).
function porFecha_(folios) {
  const por = {};
  folios.forEach(function(f) {
    if (!f.ultimoEventoFecha) return;
    const clave = Utilities.formatDate(f.ultimoEventoFecha, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    por[clave] = (por[clave] || 0) + 1;
  });
  return Object.keys(por).sort().map(function(fecha) { return { fecha: fecha, total: por[fecha] }; });
}

function porAging_(folios) {
  const por = {};
  AGING_BUCKETS.forEach(function(b) { por[b.clave] = 0; });
  let sinAging = 0;
  folios.forEach(function(f) { if (f.aging) por[f.aging.clave]++; else sinAging++; });
  const lista = AGING_BUCKETS.map(function(b) {
    return { clave: b.clave, etiqueta: b.etiqueta, color: b.color, total: por[b.clave] };
  });
  if (sinAging) lista.push({ clave: 'sin_aging', etiqueta: 'Sin fecha de evento', color: 'muted', total: sinAging });
  return lista;
}

function detalleMasAntiguos_(folios) {
  return folios.slice()
    .sort(function(a, b) { return (b.dias == null ? -1 : b.dias) - (a.dias == null ? -1 : a.dias); })
    .slice(0, CONFIG.TOP_DETALLE)
    .map(function(f) {
      return {
        folio: f.folio,
        empresa: f.empresa,
        etapa: f.etapa.etiqueta,
        dias: f.dias,
        aging: f.aging ? f.aging.etiqueta : 'Sin fecha de evento',
        proveedor: f.proveedor,
        donVeloz: f.donVeloz,
        eta: f.eta ? Utilities.formatDate(f.eta, Session.getScriptTimeZone(), 'yyyy-MM-dd') : null
      };
    });
}

function getBacklogData(params) {
  params = params || {};
  const hoy = new Date();
  const todos = leerFolios_();
  const enBacklog = todos.filter(function(f) { return esBacklog_(f.ultimoEvento); });

  const opciones = {
    empresas: listaUnica_(enBacklog, 'empresa'),
    tiposEnvio: listaUnica_(enBacklog, 'tipoEnvio'),
    proveedores: listaUnica_(enBacklog, 'proveedor').filter(function(p) { return p !== ''; }),
    donVeloces: listaUnica_(enBacklog, 'donVeloz').filter(function(p) { return p !== ''; })
  };

  const etaDesde = params.etaDesde ? new Date(params.etaDesde + 'T00:00:00') : null;
  const etaHasta = params.etaHasta ? new Date(params.etaHasta + 'T23:59:59') : null;

  const filtrados = enBacklog.filter(function(f) {
    if (params.empresas && params.empresas.length && params.empresas.indexOf(f.empresa) === -1) return false;
    if (params.tipoEnvio && f.tipoEnvio !== params.tipoEnvio) return false;
    if (params.proveedor && f.proveedor !== params.proveedor) return false;
    if (params.donVeloz && f.donVeloz !== params.donVeloz) return false;
    if (params.noIntentado && !f.noIntentado) return false;
    if (params.etapa && etapaDe_(f.ultimoEvento).clave !== params.etapa) return false;
    if (params.evento && f.ultimoEvento !== params.evento) return false;
    if (etaDesde && (!f.eta || f.eta < etaDesde)) return false;
    if (etaHasta && (!f.eta || f.eta > etaHasta)) return false;
    return true;
  });

  const enriquecidos = filtrados.map(function(f) {
    const etapa = etapaDe_(f.ultimoEvento);
    const dias = f.ultimoEventoFecha ? diasEntre_(f.ultimoEventoFecha, hoy) : null;
    const aging = dias != null ? bucketAging_(dias) : null;
    return Object.assign({}, f, { etapa: etapa, dias: dias, aging: aging });
  });

  return {
    opciones: opciones,
    totalEnHoja: todos.length,
    totalBacklog: enBacklog.length,
    kpis: calcularKpis_(enriquecidos),
    porEtapa: porEtapa_(enriquecidos),
    porProveedor: porProveedor_(enriquecidos),
    porCliente: porCliente_(enriquecidos),
    porEvento: porEvento_(enriquecidos),
    porFecha: porFecha_(enriquecidos),
    porAging: porAging_(enriquecidos),
    detalle: detalleMasAntiguos_(enriquecidos),
    generadoEn: Utilities.formatDate(hoy, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
  };
}

// Diagnóstico: distribución completa de "Último evento: Evento" dentro del backlog, para
// detectar códigos que no matchean ninguna etapa de ETAPAS (caen en "Otro / sin clasificar").
// Ejecutar desde el editor de Apps Script y revisar el Registro de ejecución.
function debugEventos() {
  const todos = leerFolios_();
  const enBacklog = todos.filter(function(f) { return esBacklog_(f.ultimoEvento); });
  const conteo = {};
  enBacklog.forEach(function(f) {
    const cod = f.ultimoEvento || '(vacío)';
    conteo[cod] = (conteo[cod] || 0) + 1;
  });
  const codigosMapeados = ETAPAS.reduce(function(a, e) { return a.concat(e.codigos); }, []);
  const sinMapear = Object.keys(conteo).filter(function(c) { return codigosMapeados.indexOf(c) === -1; });
  const info = {
    totalEnHoja: todos.length,
    totalBacklog: enBacklog.length,
    distribucion: conteo,
    codigosSinMapear: sinMapear.map(function(c) { return c + ' (x' + conteo[c] + ')'; })
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

function testConnection() {
  const hoja = abrirHoja_();
  Logger.log('Hoja: %s — %s filas x %s columnas', hoja.getName(), hoja.getLastRow(), hoja.getLastColumn());
}

function debugColumnas() {
  const hoja = abrirHoja_();
  const encabezados = hoja.getRange(CONFIG.HEADER_ROW, 1, 1, hoja.getLastColumn()).getValues()[0];
  const cols = resolverColumnas_(encabezados);
  Logger.log(JSON.stringify(cols, null, 2));
}

function debugMuestra() {
  const folios = leerFolios_();
  Logger.log('Total folios en hoja: %s', folios.length);
  Logger.log(JSON.stringify(folios.slice(0, 3), null, 2));
}
