/* ══════════════════════════════════════════════════════
   Rutina 4.0
   - Rutina permanente agrupada en segmentos
   - Desliza un hábito a la derecha para marcar "No lo hice"
   - Imprevistos y tareas, que NO tocan tu racha
   - Exámenes por segmento con lista de temas
   - Calendario con tu Google Calendar (el del teléfono)
   - Reporte del día, la semana o el mes para una IA
   - Ciclo académico con cuenta regresiva y montaña rusa
   - La semana empieza en lunes
   Todo se guarda en el teléfono. Sin servidor.
   ══════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ───────────── Capacitor ─────────────
   Los plugins nativos solo existen si se registran desde JS.
   En el navegador no hay nada de esto y la app sigue funcionando. */
const CapX = window.capacitorExports;
const NATIVE = !!(CapX && CapX.Capacitor && CapX.Capacitor.isNativePlatform());
const plug = name => (NATIVE ? CapX.registerPlugin(name) : null);
const P = {
  LocalNotifications: plug('LocalNotifications'),
  App: plug('App'),
  Clipboard: plug('Clipboard'),
  Sistema: plug('Sistema'),
  Calendario: plug('Calendario'),
};

/* ───────────── Paletas ───────────── */
const COLORS = [
  { id: 'blue',   hex: '#0A84FF' }, { id: 'indigo', hex: '#5E5CE6' },
  { id: 'purple', hex: '#BF5AF2' }, { id: 'pink',   hex: '#FF375F' },
  { id: 'red',    hex: '#FF453A' }, { id: 'orange', hex: '#FF9F0A' },
  { id: 'yellow', hex: '#FFD60A' }, { id: 'green',  hex: '#30D158' },
  { id: 'mint',   hex: '#00C7BE' }, { id: 'teal',   hex: '#40C8E0' },
  { id: 'brown',  hex: '#AC8E68' }, { id: 'gray',   hex: '#98989D' },
];

const ACCENTS = [
  { id: 'blue',   hex: '#0A84FF', lite: '#64D2FF' },
  { id: 'indigo', hex: '#5E5CE6', lite: '#A5A3FF' },
  { id: 'purple', hex: '#BF5AF2', lite: '#E0A8FF' },
  { id: 'pink',   hex: '#FF375F', lite: '#FF8FA8' },
  { id: 'red',    hex: '#FF453A', lite: '#FF9A93' },
  { id: 'orange', hex: '#FF9F0A', lite: '#FFCB6B' },
  { id: 'green',  hex: '#30D158', lite: '#8CEFA5' },
  { id: 'teal',   hex: '#40C8E0', lite: '#9BE8F5' },
];

/* getDay() de JS: 0 = domingo. La semana se MUESTRA de lunes a domingo. */
const DAY_LETTER = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DAY_NAME   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MONTHS     = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const RING_C     = 2 * Math.PI * 58;

/* ───────────── Estado ───────────── */
const KEY = 'rutina.v2';
const OLD_KEY = 'rutina.v1';

const DEFAULTS = {
  v: 4,
  theme: 'system', accent: 'blue', sound: true, vibrate: true,
  cycleStart: '2026-08-24',   // lunes en que empezó el ciclo
  cycleEnd: '2026-12-15',
  studyGoalMin: 0,            // meta diaria de estudio vigente, en minutos (0 = apagada)
  studyGoals: [],             // { from, min } historial de la meta, para no reescribir días pasados
  segments: [],               // { id, name, color }
  routines: [],               // { id, segmentId, title, note, color, repeat, days, sched, time, alarm, start, prio }
  extras: [],                 // { id, title, note, color, date, time, alarm, done, prio, fromCal }
  examSegments: [],           // { id, name, color, date, topics:[{id,title,done}], gcalOn, gcal }
  homework: [],               // { id, title, subject, note, color, due, time, alarm, done, doneOn, prio, mins, gcalOn, gcal }
  goals: [],                  // { id, title, note, color, target, unit, current, due, done, gcalOn, gcal, fromCal }
  notes: [],                  // { id, text, color, created }
  trees: [],                  // { id, week (lunes), species, planted }
  studyLog: {},               // 'YYYY-MM-DD' -> minutos estudiados
  log: {},                    // 'YYYY-MM-DD' -> [routineId] cumplidos
  fail: {},                   // 'YYYY-MM-DD' -> [routineId] marcados "no lo hice"
  fired: {},
  cal: {
    hidden: [],               // calendarios que no quieres ver
    target: null,             // dónde se crean tus metas, tareas y exámenes
    show: { goals: true, hw: true, exams: true, extras: true },
  },
  tips: {},
};

const PRIOS = [
  { v: 1,  label: 'Alta' },
  { v: 0,  label: 'Normal' },
  { v: -1, label: 'Baja' },
];

/* Especies del jardín. Cada semana perfecta te deja plantar una. */
const SPECIES = [
  { id: 'roble',   name: 'Roble' },
  { id: 'pino',    name: 'Pino' },
  { id: 'cerezo',  name: 'Cerezo' },
  { id: 'palmera', name: 'Palmera' },
  { id: 'sauce',   name: 'Sauce' },
  { id: 'bambu',   name: 'Bambú' },
];

let S = load();
let sel = null;          // día seleccionado en Hoy
let editing = false;
let range = 7;
let studyView = 'exams';
let studyDay = null;     // día de la tarjeta de horas de estudio
let progressView = 'summary';
let timers = [];
let confettiFor = null;
let pickDate = null;     // fecha sugerida al agregar algo desde el calendario

function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return hydrate(JSON.parse(raw));
    const old = localStorage.getItem(OLD_KEY);
    if (old) return migrateV1(JSON.parse(old));
  } catch (e) { console.warn('Almacenamiento ilegible', e); }
  return structuredClone(DEFAULTS);
}

/** Mezcla lo guardado con los valores por defecto (también los anidados) y lo pone al día. */
function hydrate(data) {
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const s = Object.assign(structuredClone(DEFAULTS), data);
  s.cal = Object.assign(structuredClone(DEFAULTS.cal), obj(data.cal));
  s.cal.show = Object.assign({}, DEFAULTS.cal.show, obj(obj(data.cal).show));
  s.tips = Object.assign({}, obj(data.tips));
  return upgrade(s);
}

/** Ajustes de una versión a otra. Los campos nuevos ya vienen de DEFAULTS. */
function upgrade(s) {
  if ((s.v || 2) < 3) {
    // el ciclo arrancó el lunes 24 de agosto, no el día en que se instaló la app
    s.cycleStart = '2026-08-24';
  }
  if ((s.v || 2) < 4) {
    // antes la meta de estudio no tenía historial: se asume que siempre fue la actual
    if (s.studyGoalMin > 0 && !s.studyGoals.length) s.studyGoals = [{ from: '0000-01-01', min: s.studyGoalMin }];
  }
  s.v = 4;
  return s;
}

/** Convierte los datos de la versión 1 al modelo nuevo, sin perder historial. */
function migrateV1(old) {
  const s = structuredClone(DEFAULTS);
  s.theme = old.theme ?? s.theme;
  s.accent = old.accent ?? s.accent;
  s.sound = old.sound ?? s.sound;
  s.vibrate = old.vibrate ?? s.vibrate;
  s.log = old.log || {};

  const seg = { id: uid('s'), name: 'Mi rutina', color: 'blue' };
  s.segments.push(seg);

  for (const t of (old.tasks || [])) {
    if (t.repeat === 'once') {
      s.extras.push({
        id: t.id, title: t.title, note: t.note || '', color: t.color || 'blue',
        date: t.date || t.created, time: t.time || null, alarm: !!t.alarm, done: false,
      });
    } else {
      s.routines.push({
        id: t.id, segmentId: seg.id, title: t.title, note: t.note || '', color: t.color || 'blue',
        repeat: t.repeat === 'weekly' ? 'weekly' : 'daily', days: t.days || [],
        time: t.time || null, alarm: !!t.alarm, start: t.date || t.created,
      });
    }
  }
  return s;
}

function save() {
  _everDone = null;
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('No se pudo guardar. ¿Memoria llena?'); }
}

let _everDone = null;
function everDone(id) {
  if (!_everDone) {
    _everDone = new Set();
    for (const d in S.log) for (const x of S.log[d]) _everDone.add(x);
  }
  return _everDone.has(id);
}

/* ───────────── Fechas ───────────── */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function weekdayOf(s) { return parseYmd(s).getDay(); }
function diffDays(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
function utcYmd(ms) { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function hm(ms) { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

/** Lunes de la semana que contiene `s`. */
function startOfWeek(s) { return addDays(s, -((weekdayOf(s) + 6) % 7)); }

function prettyDate(s) {
  return cap(parseYmd(s).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }));
}
function prettyShort(s) { const d = parseYmd(s); return `${DAY_NAME[d.getDay()]} ${d.getDate()}`; }
/** "27 ago" — para rangos que cruzan meses. */
function prettyDM(s) {
  const d = parseYmd(s);
  return `${d.getDate()} ${d.toLocaleDateString('es', { month: 'short' }).replace('.', '')}`;
}
function prettyDay(s) {
  const t = today();
  if (s === t) return 'Hoy';
  if (s === addDays(t, -1)) return 'Ayer';
  if (s === addDays(t, 1)) return 'Mañana';
  return cap(parseYmd(s).toLocaleDateString('es', { weekday: 'long' }));
}

/* ───────────── Programación ───────────── */
/** Horarios que tuvo el hábito. Cambiar sus días no reescribe el pasado. */
function schedOf(r) {
  return r.sched && r.sched.length ? r.sched : [{ from: r.start, repeat: r.repeat, days: r.days || [] }];
}

function isRoutineOn(r, date) {
  if (date < r.start) return false;
  const sc = schedOf(r);
  let cur = sc[0];
  for (const x of sc) { if (x.from <= date) cur = x; else break; }
  if (cur.repeat === 'weekly') return (cur.days || []).includes(weekdayOf(date));
  return true;
}
function routinesFor(date) { return S.routines.filter(r => isRoutineOn(r, date)); }

function extrasFor(date) {
  return S.extras.filter(e => e.date === date ||
    // un imprevisto vencido y sin hacer se arrastra hasta hoy
    (date === today() && e.date < date && !e.done));
}

function hwFor(date) {
  return S.homework.filter(h => !h.done && h.due && (h.due === date ||
    (date === today() && h.due < date)));
}

const canToggle = date => date <= today();

function inDay(map, id, date) { return (map[date] || []).includes(id); }
function putDay(map, id, date, on) {
  const arr = map[date] || [];
  const has = arr.includes(id);
  if (on && !has) map[date] = [...arr, id];
  if (!on && has) {
    const next = arr.filter(x => x !== id);
    if (next.length) map[date] = next; else delete map[date];
  }
}

const isDone = (id, date) => inDay(S.log, id, date);
const isFailed = (id, date) => inDay(S.fail, id, date);

/** Cumplido y "no lo hice" se excluyen: marcar uno quita el otro. */
function setDone(id, date, on) {
  putDay(S.log, id, date, on);
  if (on) putDay(S.fail, id, date, false);
}
function setFailed(id, date, on) {
  putDay(S.fail, id, date, on);
  if (on) putDay(S.log, id, date, false);
}

/** Quita un hábito de todo el historial. */
function forgetRoutines(ids) {
  for (const map of [S.log, S.fail]) {
    for (const d of Object.keys(map)) {
      map[d] = map[d].filter(x => !ids.has(x));
      if (!map[d].length) delete map[d];
    }
  }
}

/* ───────────── Estadísticas (solo la rutina permanente) ───────────── */
function dayStat(date) {
  const list = routinesFor(date);
  const done = list.filter(r => isDone(r.id, date)).length;
  const failed = list.filter(r => isFailed(r.id, date)).length;
  return { total: list.length, done, failed, pct: list.length ? Math.round(done / list.length * 100) : 0 };
}

function firstDay() {
  let min = S.cycleStart || today();
  for (const r of S.routines) if (r.start < min) min = r.start;
  for (const d in S.log) if (d < min) min = d;
  return min;
}

function eachDay(from, to) {
  const out = [];
  if (from > to) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function isPerfect(date) { const s = dayStat(date); return s.total > 0 && s.done === s.total; }

function currentStreak() {
  const t = today();
  // si hoy marcaste algo como no hecho, la racha se corta ya, no mañana
  if (dayStat(t).failed > 0) return 0;
  let cursor = isPerfect(t) ? t : addDays(t, -1);
  const floor = firstDay();
  let n = 0;
  while (cursor >= floor) {
    const s = dayStat(cursor);
    if (s.total === 0) { cursor = addDays(cursor, -1); continue; }
    if (s.done === s.total) { n++; cursor = addDays(cursor, -1); } else break;
  }
  return n;
}

function bestStreak() {
  let best = 0, run = 0;
  for (const d of eachDay(firstDay(), today())) {
    const s = dayStat(d);
    if (s.total === 0) continue;
    if (s.done === s.total) { run++; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

function avgPct(days) {
  const act = days.map(dayStat).filter(s => s.total > 0);
  return act.length ? Math.round(act.reduce((a, s) => a + s.pct, 0) / act.length) : 0;
}

function totalCompleted() { return Object.values(S.log).reduce((a, x) => a + x.length, 0); }

function routineRates(n) {
  const days = eachDay(addDays(today(), -(n - 1)), today());
  return S.routines.map(r => {
    const sch = days.filter(d => isRoutineOn(r, d));
    const done = sch.filter(d => isDone(r.id, d)).length;
    return { r, scheduled: sch.length, done, pct: sch.length ? Math.round(done / sch.length * 100) : 0 };
  }).filter(x => x.scheduled >= 3);
}

function segmentRates(n) {
  const days = eachDay(addDays(today(), -(n - 1)), today());
  return S.segments.map(seg => {
    const rs = S.routines.filter(r => r.segmentId === seg.id);
    let sch = 0, done = 0;
    for (const r of rs) for (const d of days) {
      if (!isRoutineOn(r, d)) continue;
      sch++; if (isDone(r.id, d)) done++;
    }
    return { seg, scheduled: sch, done, pct: sch ? Math.round(done / sch * 100) : 0 };
  }).filter(x => x.scheduled > 0);
}

/* ───────────── Ciclo académico ───────────── */
function cycleInfo() {
  const t = today();
  const start = S.cycleStart || firstDay();
  const end = S.cycleEnd;
  const total = Math.max(diffDays(start, end), 0);
  const elapsed = Math.min(Math.max(diffDays(start, t), 0), total);
  const left = Math.max(diffDays(t, end), 0);
  const days = eachDay(start, t < end ? t : end);
  const active = days.filter(d => dayStat(d).total > 0);
  return {
    start, end, total, elapsed, left,
    pct: total ? Math.round(elapsed / total * 100) : 0,
    avg: avgPct(days),
    perfect: active.filter(isPerfect).length,
    cursados: active.length,
    ended: t > end,
  };
}

/* ───────────── Horas de estudio ───────────── */
function studyMins(date) { return S.studyLog[date] || 0; }

/** La meta que regía ese día (cambiarla hoy no rompe semanas pasadas). */
function studyGoalFor(date) {
  let m = 0;
  for (const g of S.studyGoals) if (g.from <= date) m = g.min;
  return m;
}

function addStudy(date, delta) {
  const v = Math.max(0, studyMins(date) + delta);
  if (v) S.studyLog[date] = v; else delete S.studyLog[date];
}

function fmtMins(m) {
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/* ───────────── Semanas perfectas y jardín ───────────── */
/**
 * Cómo salió un día:
 *   ok      todo cumplido (y la meta de estudio, si la tienes puesta)
 *   bad     quedó algo sin hacer (o hoy marcaste algo como "no lo hice")
 *   free    no tocaba nada, no rompe la semana
 *   pending todavía no llega, o es hoy y sigue en curso
 */
function dayVerdict(d) {
  const t = today();
  if (d > t) return 'pending';
  const s = dayStat(d);
  if (s.total === 0) return 'free';
  const goal = studyGoalFor(d);
  if (s.done === s.total && (!goal || studyMins(d) >= goal)) return 'ok';
  if (d < t) return 'bad';
  return s.failed > 0 ? 'bad' : 'pending';
}

function weekStatus(monday) {
  const days = eachDay(monday, addDays(monday, 6)).map(d => ({ d, v: dayVerdict(d) }));
  const real = days.filter(x => x.v === 'ok' || x.v === 'bad');
  const failed = days.some(x => x.v === 'bad');
  const faltan = days.filter(x => x.v === 'pending').length;
  const complete = faltan === 0;
  return {
    monday, days, complete, failed, faltan,
    hechos: days.filter(x => x.v === 'ok').length,
    cuentan: real.length,
    perfect: complete && real.length > 0 && !failed,
    tree: S.trees.find(t => t.week === monday) || null,
  };
}

/** Semanas cerradas, perfectas y sin árbol todavía (incluida esta, si ya la cerraste). */
function claimableWeeks() {
  const out = [];
  let w = startOfWeek(S.cycleStart || firstDay());
  const limit = startOfWeek(today());
  while (w <= limit) {
    const st = weekStatus(w);
    if (st.perfect && !st.tree) out.push(st);
    w = addDays(w, 7);
  }
  return out;
}

/* ───────────── Árboles ───────────── */
function treeSVG(id) {
  const suelo = '<ellipse cx="32" cy="59" rx="15" ry="2.6" fill="currentColor" opacity=".10"/>';
  const tronco = '<path d="M29.6 59V38.5q0-4 2.4-4t2.4 4V59z" fill="#8B5E3C"/>';
  switch (id) {
    case 'pino': return `<svg viewBox="0 0 64 64">${suelo}
      <rect x="30" y="45" width="4" height="14" rx="1.6" fill="#7A5230"/>
      <path d="M32 44l18 12H14z" fill="#3CA366"/>
      <path d="M32 30l15 18H17z" fill="#35915A"/>
      <path d="M32 17l12 17H20z" fill="#2E7D4F"/></svg>`;

    case 'cerezo': return `<svg viewBox="0 0 64 64">${suelo}${tronco}
      <path d="M32 44l-6-6M32 41l6-6" stroke="#8B5E3C" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      <circle cx="23" cy="30" r="10" fill="#F291B5"/>
      <circle cx="41" cy="30" r="10" fill="#E97BA6"/>
      <circle cx="32" cy="21" r="12" fill="#FBBBD2"/>
      <circle cx="27" cy="18" r="1.7" fill="#E4699B"/>
      <circle cx="37" cy="24" r="1.7" fill="#E4699B"/>
      <circle cx="32" cy="31" r="1.7" fill="#E4699B"/></svg>`;

    case 'palmera': return `<svg viewBox="0 0 64 64">${suelo}
      <path d="M29 59q1.5-18 7-30" stroke="#9A6B3F" stroke-width="4.2" fill="none" stroke-linecap="round"/>
      <g stroke="#3CA366" stroke-width="4.4" fill="none" stroke-linecap="round">
        <path d="M36 28q-11-8-21-3"/><path d="M36 28q-6-12-17-13"/>
        <path d="M36 28q2-13 13-15"/><path d="M36 28q12-5 17 4"/>
        <path d="M36 28q9 5 8 14"/>
      </g>
      <circle cx="36" cy="28" r="3.1" fill="#2E7D4F"/></svg>`;

    case 'sauce': return `<svg viewBox="0 0 64 64">${suelo}${tronco}
      <ellipse cx="32" cy="25" rx="17" ry="11" fill="#5FBF7A"/>
      <g stroke="#4CB963" stroke-width="2.6" fill="none" stroke-linecap="round">
        <path d="M18 29q-1 7 1 11"/><path d="M25 33q-1 7 0 11"/>
        <path d="M32 35q0 7 0 11"/><path d="M39 33q1 7 0 11"/>
        <path d="M46 29q1 7-1 11"/>
      </g></svg>`;

    case 'bambu': return `<svg viewBox="0 0 64 64">${suelo}
      <g fill="#4CB963">
        <rect x="20" y="20" width="6" height="39" rx="3"/>
        <rect x="29" y="12" width="6" height="47" rx="3"/>
        <rect x="38" y="24" width="6" height="35" rx="3"/>
      </g>
      <g stroke="#2E7D4F" stroke-width="1.5" stroke-linecap="round">
        <path d="M20 33h6M20 46h6M29 25h6M29 38h6M29 51h6M38 37h6M38 50h6"/>
      </g>
      <g fill="#5FBF7A">
        <ellipse cx="15" cy="27" rx="6.5" ry="2.6" transform="rotate(-25 15 27)"/>
        <ellipse cx="49" cy="31" rx="6.5" ry="2.6" transform="rotate(25 49 31)"/>
        <ellipse cx="45" cy="18" rx="6" ry="2.4" transform="rotate(20 45 18)"/>
      </g></svg>`;

    default: return `<svg viewBox="0 0 64 64">${suelo}${tronco}
      <path d="M32 44l-6-6M32 41l6-6" stroke="#8B5E3C" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      <circle cx="23" cy="30" r="10" fill="#3FA34D"/>
      <circle cx="41" cy="30" r="10" fill="#379B44"/>
      <circle cx="32" cy="21" r="12" fill="#4CB963"/></svg>`;
  }
}

/* ───────────── Utilidades ───────────── */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const colorHex = id => (COLORS.find(c => c.id === id) || COLORS[0]).hex;
const safeHex = h => (/^#[0-9A-Fa-f]{6}$/.test(h) ? h : '#98989D');

function buzz(ms) { if (S.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

const lastHTML = {};
function paint(el, html, slot) {
  if (lastHTML[slot] === html) return;
  lastHTML[slot] = html;
  el.innerHTML = html;
}

function swatchHTML(list, selected, attr) {
  return list.map(c => `<button class="sw ${c.id === selected ? 'on' : ''}" style="--c:${c.hex}" data-${attr}="${c.id}" aria-label="${c.id}"></button>`).join('');
}

const ICON_CLOCK = '<svg viewBox="0 0 24 24" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const ICON_BELL  = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>';
const ICON_X     = '<svg class="ic-x" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const ICON_HOURS = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10M7 21h10M8 3v4a4 4 0 0 0 8 0V3M8 21v-4a4 4 0 0 1 8 0v4"/></svg>';
const ICON_PIN   = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>';

function isDarkNow() {
  if (S.theme === 'dark') return true;
  if (S.theme === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/** En Android, las barras del sistema tienen que seguir al tema de la app. */
function applyStatusBar() {
  if (!P.Sistema) return;
  const dark = isDarkNow();
  P.Sistema.barras({ color: dark ? '#000000' : '#F2F2F7', oscuro: dark }).catch(() => {});
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', S.theme);
  const a = ACCENTS.find(x => x.id === S.accent) || ACCENTS[0];
  document.documentElement.style.setProperty('--accent', a.hex);
  document.documentElement.style.setProperty('--accent-lite', a.lite);
  $$('#seg-theme .seg-btn').forEach(b => b.classList.toggle('is-on', b.dataset.theme === S.theme));
  applyStatusBar();
}

/* ══════════════════════════════════════════════════════
   HOY
   ══════════════════════════════════════════════════════ */
function renderWeekStrip() {
  const t = today();
  const mon = startOfWeek(sel);
  const html = WEEK_ORDER.map((wd, i) => {
    const d = addDays(mon, i);
    const st = dayStat(d);
    const dot = st.total === 0 ? '' : st.failed > 0 ? 'fail'
      : (st.done === st.total ? 'full' : (st.done > 0 ? 'some' : ''));
    return `<button class="wk-day ${d === sel ? 'on' : ''} ${d === t ? 'is-today' : ''} ${d > t ? 'other' : ''}" data-day="${d}">
      <span class="wk-l">${DAY_LETTER[wd]}</span>
      <span class="wk-n">${parseYmd(d).getDate()}</span>
      <span class="wk-dot ${dot}"></span>
    </button>`;
  }).join('');
  paint($('#wk-days'), html, 'wk');
}

let renderedDay = null;
function renderToday() {
  const d = sel, t = today();
  // las filas solo entran animadas cuando cambias de día, no en cada repintado
  $('#page-today').classList.toggle('calm', renderedDay === d);
  renderedDay = d;

  $('#day-eyebrow').textContent = prettyDate(d);
  $('#day-title').textContent = prettyDay(d);
  $('#btn-back-today').classList.toggle('hidden', d === t);

  renderWeekStrip();

  const groups = dayGroups(d);
  paint($('#today-segments'), buildSegmentsHTML(d, groups), 'segs');
  updateDayNumbers(d, groups);
  $('#swipe-hint').classList.toggle('hidden', !!S.tips.swipe || groups.length === 0 || !canToggle(d));

  /* imprevistos */
  const ex = extrasFor(d);
  $('#head-extras').classList.toggle('hidden', ex.length === 0);
  $('#note-extras').classList.toggle('hidden', ex.length === 0);
  $('#count-extras').textContent = ex.length || '';
  paint($('#list-extras'), buildExtrasHTML(d), 'extras');

  /* tareas que vencen ese día */
  const hw = hwFor(d);
  $('#head-hw-today').classList.toggle('hidden', hw.length === 0);
  $('#count-hw-today').textContent = hw.length || '';
  paint($('#list-hw-today'), hw.map(h => hwItemHTML(h, d)).join(''), 'hwtoday');

  const vacio = groups.length === 0 && ex.length === 0 && hw.length === 0;
  $('#empty-today').classList.toggle('hidden', !vacio);
  if (vacio) {
    const hayRutina = S.routines.length > 0;
    $('#empty-title').textContent = hayRutina ? 'Nada para este día' : 'Empieza tu rutina';
    $('#empty-text').innerHTML = hayRutina
      ? 'Tu rutina no toca este día.<br>Puedes agregar algo con el botón +.'
      : 'Crea tu rutina permanente y aparecerá<br>aquí sola, todos los días que le toque.';
  }
  $('#btn-edit-mode').classList.toggle('hidden', groups.length === 0);
  checkCelebration(d);
}

/** Tras marcar una fila en su sitio, repinta sin animación cuando termina la palomita. */
let settleTimer;
function settleToday() {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { if (!swipe) renderToday(); }, 420);
}

function buildExtrasHTML(d) {
  return extrasFor(d)
    .sort((a, b) => (b.prio || 0) - (a.prio || 0))
    .map(e => extraItemHTML(e, d, nowMinutes())).join('');
}

/** Tarjeta de horas de estudio (en la pestaña Estudio). */
function renderStudyCard() {
  const card = $('#study-card');
  const d = studyDay || today();
  const goal = studyGoalFor(d) || S.studyGoalMin;
  if (!goal) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');

  const hecho = studyMins(d);
  const pct = Math.min(100, Math.round(hecho / goal * 100));
  $('#study-done').textContent = fmtMins(hecho);
  $('#study-goal').textContent = 'de ' + fmtMins(goal);
  $('#study-badge').textContent = pct + '%';
  const fill = $('#study-fill');
  fill.style.width = pct + '%';
  fill.classList.toggle('full', pct >= 100);
  $('#study-title').textContent = d === today() ? 'Estudio de hoy' : `Estudio · ${prettyDay(d).toLowerCase()} ${parseYmd(d).getDate()}`;
  $('#study-next').disabled = d >= today();
}

/* Confeti la primera vez que cierras el día completo. */
function checkCelebration(d) {
  const t = today(), stat = dayStat(d);
  if (d === t && stat.total > 0 && stat.pct === 100 && confettiFor !== t) {
    confettiFor = t; celebrate();
  }
  if (stat.pct < 100) confettiFor = null;
}

/** Los hábitos del día, repartidos en sus segmentos. */
function dayGroups(d) {
  const groups = [];
  for (const seg of S.segments) {
    const rs = S.routines.filter(r => r.segmentId === seg.id && isRoutineOn(r, d));
    if (rs.length) groups.push({ seg, rs });
  }
  const loose = S.routines.filter(r => isRoutineOn(r, d) && !S.segments.some(s => s.id === r.segmentId));
  if (loose.length) groups.push({ seg: { id: null, name: 'Sin segmento', color: 'gray' }, rs: loose });
  return groups;
}

function buildSegmentsHTML(d, groups) {
  const nowMin = nowMinutes();
  const locked = !canToggle(d);
  return groups.map(g => {
    const done = g.rs.filter(r => isDone(r.id, d)).length;
    const pct = Math.round(done / g.rs.length * 100);
    return `<div class="sgroup" style="--c:${colorHex(g.seg.color)}" data-seg="${g.seg.id || ''}">
      <div class="sgroup-head">
        <span class="sgroup-dot"></span>
        <span class="sgroup-name">${esc(g.seg.name)}</span>
        <span class="sgroup-mini"><i style="width:${pct}%"></i></span>
        <span class="sgroup-count">${done}/${g.rs.length}</span>
      </div>
      <ul class="list">${g.rs.map((r, i) => routineItemHTML(r, d, nowMin, locked, i, g.rs.length)).join('')}</ul>
    </div>`;
  }).join('');
}

/** Cifras del día: anillo, resumen y contadores de cada segmento. */
function updateDayNumbers(d, groups) {
  const stat = dayStat(d);
  $('#ring-bar').style.strokeDashoffset = RING_C * (1 - stat.pct / 100);
  $('#ring-pct').innerHTML = `${stat.pct}<i>%</i>`;
  $('#ring-sub').textContent = `${stat.done}/${stat.total}`;
  $('#meta-streak').textContent = currentStreak();
  $('#meta-week').innerHTML = `${avgPct(eachDay(startOfWeek(today()), today()))}<i>%</i>`;
  $('#meta-trees').textContent = S.trees.length;
  const ci = cycleInfo();
  $('#meta-left').textContent = ci.ended ? '0' : ci.left;

  for (const g of (groups || dayGroups(d))) {
    const el = document.querySelector(`#today-segments .sgroup[data-seg="${g.seg.id || ''}"]`);
    if (!el) continue;
    const done = g.rs.filter(r => isDone(r.id, d)).length;
    el.querySelector('.sgroup-count').textContent = `${done}/${g.rs.length}`;
    el.querySelector('.sgroup-mini i').style.width = Math.round(done / g.rs.length * 100) + '%';
  }
}

function nowMinutes() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

function prioTag(p) {
  if (p === 1) return '<span class="tag prio-alta">Alta</span>';
  if (p === -1) return '<span class="tag prio-baja">Baja</span>';
  return '';
}
const prioClass = p => (p === 1 ? 'is-alta' : p === -1 ? 'is-baja' : '');

function timeTag(time, done, nowMin, sameDay) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const mins = h * 60 + m;
  const late = sameDay && !done && mins < nowMin;
  const soon = sameDay && !done && mins >= nowMin && mins - nowMin <= 60;
  return `<span class="tag ${late ? 'late' : soon ? 'hot' : ''}">${ICON_CLOCK}${time}${late ? ' · pasó' : ''}</span>`;
}

function routineItemHTML(r, date, nowMin, locked, idx, len) {
  const done = isDone(r.id, date);
  const failed = isFailed(r.id, date);
  const tags = [prioTag(r.prio || 0)];
  if (failed) tags.unshift('<span class="tag late">No lo hice</span>');
  tags.push(timeTag(r.time, done || failed, nowMin, date === today()));
  if (r.alarm) tags.push(`<span class="tag">${ICON_BELL}Alarma</span>`);
  if (r.repeat === 'weekly') {
    tags.push(`<span class="tag soft">${WEEK_ORDER.filter(w => (r.days || []).includes(w)).map(w => DAY_LETTER[w]).join(' ')}</span>`);
  }
  const ctl = editing ? `
    <div class="item-ctl">
      <button class="ctl" data-act="r-up" data-id="${r.id}" ${idx === 0 ? 'disabled' : ''} aria-label="Subir"><svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
      <button class="ctl" data-act="r-down" data-id="${r.id}" ${idx === len - 1 ? 'disabled' : ''} aria-label="Bajar"><svg viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7"/></svg></button>
      <button class="ctl del" data-act="r-del" data-id="${r.id}" aria-label="Eliminar"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button>
    </div>` : '';

  return `<li class="swipe ${failed ? 'undo' : ''}" data-id="${r.id}">
    <div class="swipe-under">${failed
      ? '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg><span>Deshacer</span>'
      : '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg><span>No lo hice</span>'}</div>
    <div class="item ${done ? 'done' : ''} ${failed ? 'failed' : ''} ${locked ? 'locked' : ''} ${prioClass(r.prio)}" style="--c:${colorHex(r.color)}" data-id="${r.id}">
    <button class="check" data-act="r-toggle" data-id="${r.id}" aria-label="Marcar">${ICON_CHECK}${ICON_X}</button>
    <div class="item-main" data-act="r-open" data-id="${r.id}">
      <div class="item-title">${esc(r.title)}</div>
      ${r.note ? `<div class="item-note">${esc(r.note)}</div>` : ''}
      ${tags.filter(Boolean).length ? `<div class="item-tags">${tags.join('')}</div>` : ''}
    </div>${ctl}</div></li>`;
}

function extraItemHTML(e, date, nowMin) {
  const tags = [prioTag(e.prio || 0), timeTag(e.time, e.done, nowMin, e.date === today())];
  if (e.alarm) tags.push(`<span class="tag">${ICON_BELL}Alarma</span>`);
  if (e.date < date) tags.push(`<span class="tag late">Vencido · ${prettyShort(e.date)}</span>`);
  return `<li class="item ${e.done ? 'done' : ''} ${prioClass(e.prio)}" style="--c:${colorHex(e.color)}" data-id="${e.id}">
    <button class="check" data-act="e-toggle" data-id="${e.id}" aria-label="Marcar">${ICON_CHECK}</button>
    <div class="item-main" data-act="e-open" data-id="${e.id}">
      <div class="item-title">${esc(e.title)}</div>
      ${e.note ? `<div class="item-note">${esc(e.note)}</div>` : ''}
      ${tags.filter(Boolean).length ? `<div class="item-tags">${tags.join('')}</div>` : ''}
    </div></li>`;
}

function hwItemHTML(h, date) {
  const tags = [prioTag(h.prio || 0)];
  if (h.subject) tags.push(`<span class="tag soft">${esc(h.subject)}</span>`);
  if (h.mins) tags.push(`<span class="tag">${ICON_HOURS}${fmtMins(h.mins)}</span>`);
  if (h.time) tags.push(`<span class="tag">${ICON_CLOCK}${h.time}</span>`);
  if (h.due && date && h.due < date) tags.push(`<span class="tag late">Vencida · ${prettyShort(h.due)}</span>`);
  else if (h.due && !date) tags.push(`<span class="tag">${prettyShort(h.due)}</span>`);
  return `<li class="item ${h.done ? 'done' : ''} ${prioClass(h.prio)}" style="--c:${colorHex(h.color)}" data-id="${h.id}">
    <button class="check" data-act="h-toggle" data-id="${h.id}" aria-label="Marcar">${ICON_CHECK}</button>
    <div class="item-main" data-act="h-open" data-id="${h.id}">
      <div class="item-title">${esc(h.title)}</div>
      ${h.note ? `<div class="item-note">${esc(h.note)}</div>` : ''}
      ${tags.filter(Boolean).length ? `<div class="item-tags">${tags.join('')}</div>` : ''}
    </div></li>`;
}

function celebrate(msg = 'Día completo. Así se construye.') {
  buzz([12, 60, 12, 60, 24]);
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  const palette = COLORS.map(c => c.hex);
  for (let i = 0; i < 46; i++) {
    const b = document.createElement('i');
    b.className = 'conf-bit';
    b.style.left = Math.random() * 100 + 'vw';
    b.style.background = palette[(Math.random() * palette.length) | 0];
    b.style.animationDuration = (1.5 + Math.random() * 1.3) + 's';
    b.style.animationDelay = (Math.random() * .5) + 's';
    if (Math.random() > .6) b.style.borderRadius = '50%';
    wrap.appendChild(b);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3400);
  setTimeout(() => toast(msg), 350);
}

/** Después de marcar un hábito: cifras, tira de la semana, progreso y alarmas. */
function afterMark(li, id) {
  const d = sel;
  if (li) {
    const it = li.querySelector('.item');
    it.classList.toggle('done', isDone(id, d));
    it.classList.toggle('failed', isFailed(id, d));
  }
  const groups = dayGroups(d);
  updateDayNumbers(d, groups);
  renderWeekStrip();
  checkCelebration(d);
  renderProgress(); Alarms.sync();
  settleToday();
}

function toggleFail(id, li) {
  if (!canToggle(sel)) { toast('Ese día todavía no llega'); return; }
  const on = !isFailed(id, sel);
  setFailed(id, sel, on);
  if (!S.tips.swipe) { S.tips.swipe = true; $('#swipe-hint').classList.add('hidden'); }
  save();
  buzz(on ? [18, 50, 18] : 8);
  afterMark(li, id);
  const r = S.routines.find(x => x.id === id);
  toast(on ? `"${r ? r.title : 'Hábito'}" quedó como no hecho` : 'Listo, lo desmarqué');
}

/* ── deslizar a la derecha: "No lo hice" ── */
let swipe = null;
let swipeClickBlock = 0;

function bindSwipe() {
  const box = $('#today-segments');
  box.addEventListener('pointerdown', e => {
    if (editing || e.button > 0) return;
    const li = e.target.closest('.swipe');
    if (!li) return;
    swipe = { li, card: li.querySelector('.item'), id: li.dataset.id, x0: e.clientX, y0: e.clientY,
              dx: 0, on: false, armed: false, pid: e.pointerId, lim: Math.min(120, li.offsetWidth * .32) };
  });
  box.addEventListener('pointermove', e => {
    const s = swipe;
    if (!s || e.pointerId !== s.pid) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (!s.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }   // es un scroll
      if (dx < 12 || dx < Math.abs(dy) * 1.3) return;
      if (!canToggle(sel)) { swipe = null; return; }
      s.on = true;
      s.li.classList.add('dragging');
      try { s.li.setPointerCapture(e.pointerId); } catch (err) {}
    }
    s.dx = Math.max(0, dx);
    const shown = s.dx <= s.lim ? s.dx : s.lim + (s.dx - s.lim) * .3;   // resistencia al pasarse
    s.card.style.transform = `translateX(${shown}px)`;
    const armed = s.dx >= s.lim * .8;
    if (armed !== s.armed) { s.armed = armed; s.li.classList.toggle('armed', armed); if (armed) buzz(8); }
  });
  const end = e => {
    const s = swipe;
    if (!s || e.pointerId !== s.pid) return;
    swipe = null;
    if (!s.on) return;
    swipeClickBlock = Date.now();
    s.li.classList.add('settling');
    s.card.style.transform = '';
    setTimeout(() => s.li.classList.remove('dragging', 'armed', 'settling'), 300);
    if (s.armed && e.type === 'pointerup') toggleFail(s.id, s.li);
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
}

/* ══════════════════════════════════════════════════════
   RUTINA
   ══════════════════════════════════════════════════════ */
function renderRoutine() {
  const groups = S.segments.map(seg => ({ seg, rs: S.routines.filter(r => r.segmentId === seg.id) }));
  const loose = S.routines.filter(r => !S.segments.some(s => s.id === r.segmentId));
  if (loose.length) groups.push({ seg: { id: null, name: 'Sin segmento', color: 'gray' }, rs: loose });

  $('#empty-routine').classList.toggle('hidden', S.segments.length > 0 || loose.length > 0);

  const html = groups.map((g, gi) => {
    const hex = colorHex(g.seg.color);
    const items = g.rs.length ? g.rs.map((r, i) => `
      <li class="item ${prioClass(r.prio)}" style="--c:${colorHex(r.color)}" data-id="${r.id}">
        <div class="item-main" data-act="r-open" data-id="${r.id}">
          <div class="item-title">${esc(r.title)}</div>
          <div class="item-tags">
            ${prioTag(r.prio || 0)}
            <span class="tag soft">${r.repeat === 'daily' ? 'Todos los días'
              : WEEK_ORDER.filter(w => (r.days || []).includes(w)).map(w => DAY_LETTER[w]).join(' ')}</span>
            ${r.time ? `<span class="tag">${ICON_CLOCK}${r.time}</span>` : ''}
            ${r.alarm ? `<span class="tag">${ICON_BELL}Alarma</span>` : ''}
          </div>
        </div>
        <div class="item-ctl" style="display:flex">
          <button class="ctl" data-act="r-up" data-id="${r.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir"><svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
          <button class="ctl" data-act="r-down" data-id="${r.id}" ${i === g.rs.length - 1 ? 'disabled' : ''} aria-label="Bajar"><svg viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7"/></svg></button>
        </div>
      </li>`).join('')
      : `<li class="item" style="--c:${hex}"><div class="item-main"><div class="item-note">Sin hábitos todavía. Toca + para agregar uno.</div></div></li>`;

    return `<div class="sgroup" style="--c:${hex}">
      <div class="sgroup-head">
        <span class="sgroup-dot"></span>
        <span class="sgroup-name">${esc(g.seg.name)}</span>
        ${g.seg.id ? `
          <button class="ctl" data-act="s-up" data-id="${g.seg.id}" ${gi === 0 ? 'disabled' : ''} aria-label="Subir segmento"><svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
          <button class="ctl" data-act="s-down" data-id="${g.seg.id}" ${gi >= S.segments.length - 1 ? 'disabled' : ''} aria-label="Bajar segmento"><svg viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7"/></svg></button>
          <button class="ctl" data-act="s-edit" data-id="${g.seg.id}" aria-label="Editar segmento"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>` : ''}
      </div>
      <ul class="list">${items}</ul>
    </div>`;
  }).join('');

  paint($('#routine-segments'), html, 'rseg');
}

/* ══════════════════════════════════════════════════════
   ESTUDIO: exámenes y tareas
   ══════════════════════════════════════════════════════ */
function examProgress(x) {
  const n = x.topics.length;
  const d = x.topics.filter(t => t.done).length;
  return { n, d, pct: n ? Math.round(d / n * 100) : 0 };
}

function renderExams() {
  $('#empty-exams').classList.toggle('hidden', S.examSegments.length > 0);
  const t = today();
  const html = S.examSegments.map(x => {
    const p = examProgress(x);
    let when = '';
    if (x.date) {
      const dd = diffDays(t, x.date);
      const cls = dd < 0 ? 'past' : dd <= 3 ? 'soon' : '';
      const txt = dd === 0 ? 'Es hoy' : dd === 1 ? 'Mañana'
        : dd < 0 ? `Fue ${prettyShort(x.date)}` : `En ${dd} días · ${prettyShort(x.date)}`;
      when = `<span class="exam-when ${cls}">${txt}</span>`;
    }
    return `<div class="exam" style="--c:${colorHex(x.color)}" data-act="x-open" data-id="${x.id}">
      <div class="exam-top">
        <span class="exam-name">${esc(x.name || 'Sin nombre')}</span>
        <span class="exam-pct">${p.pct}%</span>
      </div>
      <div class="exam-sub">${when}<span>${p.d} de ${p.n} temas</span></div>
      <div class="exam-bar"><i style="width:${p.pct}%"></i></div>
    </div>`;
  }).join('');
  paint($('#exam-list'), html, 'exams');
}

function renderHomework() {
  // primero lo urgente: prioridad alta arriba, luego por fecha de entrega
  const pend = S.homework.filter(h => !h.done)
    .sort((a, b) => (b.prio || 0) - (a.prio || 0) ||
                    ((a.due || '9999') < (b.due || '9999') ? -1 : 1));
  const done = S.homework.filter(h => h.done);

  $('#empty-hw').classList.toggle('hidden', S.homework.length > 0);
  $('#head-hw-pending').classList.toggle('hidden', pend.length === 0);
  $('#count-hw').textContent = pend.length || '';
  $('#head-hw-done').classList.toggle('hidden', done.length === 0);
  $('#count-hw-done').textContent = done.length || '';

  paint($('#list-hw'), pend.map(h => hwItemHTML(h, null)).join(''), 'hwp');
  paint($('#list-hw-done'), done.map(h => hwItemHTML(h, null)).join(''), 'hwd');
}

function renderNotes() {
  $('#empty-notes').classList.toggle('hidden', S.notes.length > 0);
  const html = S.notes.map(n => `
    <div class="note" style="--c:${colorHex(n.color)}" data-act="n-open" data-id="${n.id}">
      <div class="note-txt">${esc(n.text)}</div>
      <div class="note-when">${prettyDM(n.created)}</div>
    </div>`).join('');
  paint($('#note-list'), html, 'notes');
}

function renderStudy() {
  renderStudyCard();
  $('#view-exams').classList.toggle('hidden', studyView !== 'exams');
  $('#view-homework').classList.toggle('hidden', studyView !== 'homework');
  $('#view-notes').classList.toggle('hidden', studyView !== 'notes');
  $$('#seg-study .seg-btn').forEach(b => b.classList.toggle('is-on', b.dataset.view === studyView));
  if (studyView === 'exams') renderExams();
  else if (studyView === 'homework') renderHomework();
  else renderNotes();
}

/* ══════════════════════════════════════════════════════
   METAS
   ══════════════════════════════════════════════════════ */
function renderGoals() {
  $('#empty-goals').classList.toggle('hidden', S.goals.length > 0);
  const t = today();
  const html = S.goals.map(g => {
    const num = !!g.target;
    const pct = num ? Math.min(100, Math.round((g.current || 0) / g.target * 100)) : (g.done ? 100 : 0);
    let due = '';
    if (g.due) {
      const dd = diffDays(t, g.due);
      const cls = g.done ? '' : dd < 0 ? 'past' : dd <= 7 ? 'soon' : '';
      const txt = dd === 0 ? 'Es hoy' : dd === 1 ? 'Mañana'
        : dd < 0 ? `Se pasó ${prettyDM(g.due)}` : `Faltan ${dd} días · ${prettyDM(g.due)}`;
      due = `<span class="goal-due ${cls}">${txt}${g.gcal ? ' · en Google Calendar' : ''}</span>`;
    }
    return `<div class="goal ${g.done ? 'done' : ''}" style="--c:${colorHex(g.color)}" data-id="${g.id}">
      <button class="check" data-act="g-toggle" data-id="${g.id}" aria-label="Marcar">${ICON_CHECK}</button>
      <div class="goal-body" data-act="g-open" data-id="${g.id}">
        <div class="goal-title">${esc(g.title)}</div>
        ${g.note ? `<div class="goal-note">${esc(g.note)}</div>` : ''}
        ${num ? `
          <div class="goal-nums">
            <span class="goal-count">${g.current || 0} de ${g.target}${g.unit ? ' ' + esc(g.unit) : ''}</span>
            <span class="goal-pct">${pct}%</span>
          </div>
          <div class="goal-bar"><i style="width:${pct}%"></i></div>` : ''}
        ${due}
      </div>
      ${num && !g.done ? `<div class="item-ctl" style="display:flex">
        <button class="ctl" data-act="g-plus" data-id="${g.id}" aria-label="Sumar"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
        <button class="ctl" data-act="g-minus" data-id="${g.id}" aria-label="Restar" ${!(g.current > 0) ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
      </div>` : ''}
    </div>`;
  }).join('');
  paint($('#goal-list'), html, 'goals');
}

/* ══════════════════════════════════════════════════════
   JARDÍN
   ══════════════════════════════════════════════════════ */
function renderGarden() {
  const t = today();
  const mon = startOfWeek(t);
  const st = weekStatus(mon);

  $('#gw-range').textContent = `${prettyDM(mon)} → ${prettyDM(addDays(mon, 6))}`;
  $('#gw-days').innerHTML = st.days.map((x, i) => {
    const cls = x.v === 'ok' ? 'ok' : x.v === 'bad' ? 'bad' : x.v === 'free' ? 'free' : 'pending';
    const ic = x.v === 'ok' ? '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>'
             : x.v === 'bad' ? '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>' : '';
    return `<div class="gw-day ${cls} ${x.d === t ? 'is-today' : ''}"><span>${DAY_LETTER[WEEK_ORDER[i]]}</span><i>${ic}</i></div>`;
  }).join('');

  const pend = claimableWeeks();
  const btn = $('#btn-plant');
  const status = $('#gw-status');

  if (pend.length) {
    const w = pend[0];
    status.className = 'gw-status win';
    status.innerHTML = w.monday === mon
      ? 'Cerraste completa esta semana. Te ganaste un árbol.'
      : `Cerraste completa la semana del <b>${prettyDM(w.monday)}</b>. Te ganaste un árbol.`;
    btn.classList.remove('hidden');
    btn.dataset.week = w.monday;
  } else {
    btn.classList.add('hidden');
    status.className = 'gw-status';
    if (st.failed) {
      const fallo = st.days.find(x => x.v === 'bad');
      status.innerHTML = fallo.d === t
        ? `Hoy marcaste algo como no hecho, así que esta semana ya no da árbol. La próxima empieza el <b>${prettyDM(addDays(mon, 7))}</b>.`
        : `Esta semana ya se rompió: el <b>${prettyDM(fallo.d)}</b> quedó incompleto. La próxima empieza el <b>${prettyDM(addDays(mon, 7))}</b>.`;
    } else if (st.complete) {
      status.innerHTML = st.tree
        ? 'Semana cerrada y árbol plantado. Sigue así.'
        : 'Esta semana no tenía nada programado.';
    } else {
      status.innerHTML = `Llevas <b>${st.hechos}</b> día(s) cumplido(s) y te faltan <b>${st.faltan}</b> para cerrar la semana. Si no fallas ninguno, plantas un árbol.`;
    }
  }

  $('#count-trees').textContent = S.trees.length || '';
  $('#garden-empty').classList.toggle('hidden', S.trees.length > 0);
  const orden = [...S.trees].sort((a, b) => (a.week < b.week ? 1 : -1));
  paint($('#garden'), orden.map(tr => `
    <div class="tree-cell">${treeSVG(tr.species)}
      <span class="tree-when">${prettyDM(tr.week)}</span>
    </div>`).join(''), 'garden');
}

/* ══════════════════════════════════════════════════════
   PROGRESO
   ══════════════════════════════════════════════════════ */
function renderProgress() {
  $('#view-summary').classList.toggle('hidden', progressView !== 'summary');
  $('#view-garden').classList.toggle('hidden', progressView !== 'garden');
  $('#view-goals').classList.toggle('hidden', progressView !== 'goals');
  $('#btn-add-goal').classList.toggle('hidden', progressView !== 'goals');
  $$('#seg-progress .seg-btn').forEach(b => b.classList.toggle('is-on', b.dataset.view === progressView));
  if (progressView === 'summary') renderSummary();
  else if (progressView === 'garden') renderGarden();
  else renderGoals();
}

function renderSummary() {
  const t = today();
  const ci = cycleInfo();

  $('#cycle-left').textContent = ci.ended ? '0' : ci.left;
  $('#cycle-until').textContent = ci.ended
    ? `Tu ciclo terminó el ${prettyDate(ci.end)}`
    : `Hasta el ${prettyDate(ci.end)}`;
  $('#cycle-fill').style.width = ci.pct + '%';
  $('#cycle-done').textContent = ci.cursados;
  $('#cycle-avg').textContent = ci.avg + '%';
  $('#cycle-perfect').textContent = ci.perfect;

  renderCoaster(ci);

  /* barras del rango */
  const days = eachDay(addDays(t, -(range - 1)), t);
  const step = range <= 7 ? 1 : range <= 30 ? 3 : 9;
  const groups = [];
  for (let i = 0; i < days.length; i += step) groups.push(days.slice(i, i + step));

  paint($('#bars'), groups.map(g => {
    const st = g.map(dayStat).filter(s => s.total > 0);
    const pct = st.length ? Math.round(st.reduce((a, s) => a + s.pct, 0) / st.length) : 0;
    const label = step === 1 ? DAY_LETTER[weekdayOf(g[0])] : String(parseYmd(g[0]).getDate());
    return `<div class="bar-col ${g.includes(t) ? 'today' : ''}">
      <div class="bar-track"><div class="bar-fill ${pct === 0 ? 'zero' : ''}" style="height:${Math.max(pct, 2)}%"></div></div>
      <span class="bar-lbl">${label}</span></div>`;
  }).join(''), 'bars');
  $('#bars-avg').textContent = avgPct(days) + '%';

  /* números */
  $('#stat-streak').textContent = currentStreak();
  $('#stat-best').textContent = bestStreak();
  $('#stat-done').textContent = totalCompleted();

  const prev = eachDay(addDays(t, -(range * 2 - 1)), addDays(t, -range));
  const prevActive = prev.filter(d => dayStat(d).total > 0).length;
  const el = $('#stat-trend');
  if (!prevActive) { el.textContent = '—'; el.className = 'stat-val'; }
  else {
    const diff = avgPct(days) - avgPct(prev);
    el.textContent = (diff > 0 ? '+' : '') + diff + '%';
    el.className = 'stat-val ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : '');
  }

  /* horas de estudio de la semana en curso */
  const cardStudy = $('#card-study-week');
  if (S.studyGoalMin) {
    cardStudy.classList.remove('hidden');
    const semana = eachDay(startOfWeek(t), addDays(startOfWeek(t), 6));
    const total = semana.reduce((a, d) => a + studyMins(d), 0);
    $('#study-week-sub').textContent = `${fmtMins(total)} esta semana`;
    paint($('#study-bars'), semana.map((d, i) => {
      const m = studyMins(d);
      const goal = studyGoalFor(d) || S.studyGoalMin;
      const pct = Math.min(100, Math.round(m / goal * 100));
      return `<div class="bar-col ${d === t ? 'today' : ''}">
        <div class="bar-track"><div class="bar-fill ${pct === 0 ? 'zero' : ''}" style="height:${Math.max(pct, 2)}%"></div></div>
        <span class="bar-lbl">${DAY_LETTER[WEEK_ORDER[i]]}</span></div>`;
    }).join(''), 'studybars');
  } else cardStudy.classList.add('hidden');

  /* mapa de constancia, semanas de lunes a domingo */
  const end = addDays(startOfWeek(t), 6);
  const cells = eachDay(addDays(end, -(12 * 7 - 1)), end);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  paint($('#heat'), weeks.map(w => `<div class="heat-week">${w.map(d => {
    if (d > t) return '<i class="hc" style="opacity:.35"></i>';
    const s = dayStat(d);
    const lvl = s.total === 0 || s.pct === 0 ? 0 : s.pct < 40 ? 1 : s.pct < 70 ? 2 : s.pct < 100 ? 3 : 4;
    return `<i class="hc" data-l="${lvl}" title="${prettyShort(d)} · ${s.done}/${s.total}"></i>`;
  }).join('')}</div>`).join(''), 'heat');

  /* desglose por segmento */
  const segs = segmentRates(Math.max(range, 14)).sort((a, b) => a.pct - b.pct);
  $('#rank-seg-empty').classList.toggle('hidden', segs.length > 0);
  paint($('#rank-segments'), segs.map(x => rankRow(x.seg.name, x.seg.color, x.pct, `${x.done} de ${x.scheduled} veces`)).join(''), 'rseg2');

  /* hábito por hábito */
  const rates = routineRates(Math.max(range, 14)).sort((a, b) => a.pct - b.pct);
  $('#rank-empty').classList.toggle('hidden', rates.length > 0);
  paint($('#rank'), rates.map(x => rankRow(x.r.title, x.r.color, x.pct, `${x.done} de ${x.scheduled} días cumplidos`)).join(''), 'rank');
}

function rankRow(name, color, pct, meta) {
  return `<div class="rank-row" style="--c:${colorHex(color)}">
    <div class="rank-top">
      <span class="rank-name"><i class="rank-dot"></i>${esc(name)}</span>
      <span class="rank-pct">${pct}%</span>
    </div>
    <div class="rank-bar"><i style="width:${pct}%"></i></div>
    <span class="rank-meta">${esc(meta)}</span>
  </div>`;
}

/* ── montaña rusa: línea suave de cómo te fue día a día ── */
function renderCoaster(ci) {
  const svg = $('#coaster');
  const t = today();
  const from = ci.start > t ? t : ci.start;
  const days = eachDay(from, t < ci.end ? t : ci.end);
  const pts = days.map(d => ({ d, s: dayStat(d) })).filter(x => x.s.total > 0);

  $('#coaster-range').textContent = pts.length ? `${prettyDM(pts[0].d)} → ${prettyDM(pts[pts.length - 1].d)}` : '—';

  if (pts.length < 2) {
    svg.innerHTML = '';
    $('#coaster-legend').innerHTML =
      '<span class="coaster-empty">Necesitas al menos dos días registrados para ver tus altibajos.</span>';
    return;
  }

  const W = Math.max(svg.clientWidth || 320, 200), H = 150, Pd = 8;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const x = i => Pd + i * (W - Pd * 2) / (pts.length - 1);
  const y = p => H - Pd - (p / 100) * (H - Pd * 2);
  const co = pts.map((p, i) => [x(i), y(p.s.pct)]);

  // curva suave (Catmull-Rom convertida a Bézier)
  let dPath = `M ${co[0][0]} ${co[0][1]}`;
  for (let i = 0; i < co.length - 1; i++) {
    const p0 = co[i - 1] || co[i], p1 = co[i], p2 = co[i + 1], p3 = co[i + 2] || co[i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    dPath += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }

  let hi = 0, lo = 0;
  pts.forEach((p, i) => { if (p.s.pct > pts[hi].s.pct) hi = i; if (p.s.pct < pts[lo].s.pct) lo = i; });

  svg.innerHTML = `
    <defs>
      <linearGradient id="coFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="var(--accent)" stop-opacity=".30"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="${Pd}" y1="${y(50)}" x2="${W - Pd}" y2="${y(50)}" stroke="var(--sep)" stroke-width="1" stroke-dasharray="3 4"/>
    <path d="${dPath} L ${co[co.length - 1][0]} ${H - Pd} L ${co[0][0]} ${H - Pd} Z" fill="url(#coFill)"/>
    <path d="${dPath}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(hi)}" cy="${y(pts[hi].s.pct)}" r="4.5" fill="var(--green)" stroke="var(--group)" stroke-width="2"/>
    <circle cx="${x(lo)}" cy="${y(pts[lo].s.pct)}" r="4.5" fill="var(--red)"   stroke="var(--group)" stroke-width="2"/>
    <circle cx="${x(pts.length - 1)}" cy="${y(pts[pts.length - 1].s.pct)}" r="4" fill="var(--accent)" stroke="var(--group)" stroke-width="2"/>`;

  $('#coaster-legend').innerHTML = `
    <span>Mejor: <b>${pts[hi].s.pct}%</b> · ${prettyDM(pts[hi].d)}</span>
    <span>Peor: <b>${pts[lo].s.pct}%</b> · ${prettyDM(pts[lo].d)}</span>
    <span>Promedio: <b>${ci.avg}%</b></span>`;
}

/* ══════════════════════════════════════════════════════
   CALENDARIO — el del teléfono, donde vive tu Google Calendar
   ══════════════════════════════════════════════════════ */
let calMonth = null;    // primer día del mes a la vista
let calSel = null;      // día elegido
let curEvent = null;    // evento abierto en la hoja

const Cal = {
  ok: !!P.Calendario,
  granted: false,
  denied: false,
  calendars: [],
  cache: new Map(),     // lunes de la cuadrícula -> { at, events }

  async init() {
    if (!this.ok) return;
    try { this.granted = (await P.Calendario.checkPermissions()).calendar === 'granted'; }
    catch (e) { this.granted = false; }
    if (this.granted) await this.loadCalendars();
  },

  async connect() {
    if (!this.ok) { toast('Tu Google Calendar se ve en la app de Android'); return false; }
    try { this.granted = (await P.Calendario.requestPermissions({ permissions: ['calendar'] })).calendar === 'granted'; }
    catch (e) { this.granted = false; }
    if (!this.granted) {
      this.denied = true;
      toast('Sin ese permiso no puedo ver tu calendario');
      renderCalendar();
      return false;
    }
    this.denied = false;
    await this.loadCalendars();
    this.cache.clear();
    toast('Calendario conectado');
    renderCalendar(true);
    return true;
  },

  async loadCalendars() {
    try { this.calendars = (await P.Calendario.listCalendars()).calendars || []; }
    catch (e) { this.calendars = []; }
    const w = this.calendars.filter(c => c.writable);
    if (!w.some(c => c.id === S.cal.target)) {
      const pick = w.find(c => c.google && c.primary) || w.find(c => c.google) || w[0];
      S.cal.target = pick ? pick.id : null;
      save();
    }
  },

  target() { return this.calendars.find(c => c.id === S.cal.target) || null; },

  /** Eventos visibles entre dos días (incluidos). */
  async fetch(from, to) {
    if (!this.granted) return [];
    const ids = this.calendars.filter(c => !S.cal.hidden.includes(c.id)).map(c => c.id);
    if (!ids.length) return [];
    // un día de margen: los eventos de todo el día vienen en hora UTC
    const r = await P.Calendario.listEvents({
      from: parseYmd(addDays(from, -1)).getTime(),
      to: parseYmd(addDays(to, 2)).getTime(),
      calendarIds: ids,
    });
    return (r.events || []).map(e => {
      const first = e.allDay ? utcYmd(e.begin) : ymd(new Date(e.begin));
      const last = e.allDay ? utcYmd(Math.max(e.begin, e.end - 1)) : ymd(new Date(Math.max(e.begin, e.end - 1)));
      return { ...e, color: safeHex(e.color), first, last };
    }).filter(e => e.last >= from && e.first <= to);
  },
};

/** Solo las semanas que el mes necesita (4, 5 o 6 filas). */
function calGridDays() {
  const start = startOfWeek(calMonth);
  const m = parseYmd(calMonth);
  const last = ymd(new Date(m.getFullYear(), m.getMonth() + 1, 0));
  return eachDay(start, addDays(startOfWeek(last), 6));
}

/** Eventos de Google que no son copia de algo que ya está en Rutina. */
function calEventsByDay(days) {
  const map = new Map();
  const c = Cal.cache.get(days[0]);
  if (!c) return map;
  const mine = new Set();
  for (const list of [S.goals, S.homework, S.examSegments, S.extras]) {
    for (const it of list) { if (it.gcal) mine.add(String(it.gcal)); if (it.fromCal) mine.add(String(it.fromCal)); }
  }
  const lo = days[0], hi = days[days.length - 1];
  for (const e of c.events) {
    if (mine.has(String(e.id))) continue;
    let d = e.first < lo ? lo : e.first;
    const end = e.last > hi ? hi : e.last;
    for (let n = 0; d <= end && n < 42; d = addDays(d, 1), n++) {
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(e);
    }
  }
  return map;
}

/** Lo tuyo con fecha: metas, tareas, exámenes e imprevistos. */
function appItemsOn(d) {
  const out = [];
  const sh = S.cal.show;
  if (sh.goals) for (const g of S.goals) if (g.due === d) out.push({
    kind: 'goal', id: g.id, color: colorHex(g.color), title: g.title, done: g.done, time: null,
    sub: 'Meta' + (g.target ? ` · ${g.current || 0} de ${g.target}${g.unit ? ' ' + g.unit : ''}` : ''), act: 'g-open' });
  if (sh.hw) for (const h of S.homework) if (h.due === d) out.push({
    kind: 'hw', id: h.id, color: colorHex(h.color), title: h.title, done: h.done, time: h.time,
    sub: 'Tarea' + (h.subject ? ` · ${h.subject}` : ''), act: 'h-open', prio: h.prio });
  if (sh.exams) for (const x of S.examSegments) if (x.date === d) {
    const p = examProgress(x);
    out.push({ kind: 'exam', id: x.id, color: colorHex(x.color), title: x.name || 'Examen', done: false, time: null,
      sub: `Examen · ${p.d} de ${p.n} temas`, act: 'x-open' });
  }
  if (sh.extras) for (const e of S.extras) if (e.date === d) out.push({
    kind: 'extra', id: e.id, color: colorHex(e.color), title: e.title, done: e.done, time: e.time,
    sub: 'Imprevisto', act: 'e-open', prio: e.prio });
  return out;
}


async function renderCalendar(refetch) {
  if (!calSel) calSel = today();
  if (!calMonth) calMonth = calSel.slice(0, 8) + '01';
  paintCalendar();
  if (!Cal.granted) return;
  const days = calGridDays();
  const key = days[0];
  const c = Cal.cache.get(key);
  if (c && !refetch && Date.now() - c.at < 5 * 60000) return;
  try {
    const events = await Cal.fetch(days[0], days[days.length - 1]);
    Cal.cache.set(key, { at: Date.now(), events });
    if (calMonth && calGridDays()[0] === key) paintCalendar();
  } catch (e) {
    if (e && e.code === 'NO_PERMISSION') { Cal.granted = false; paintCalendar(); }
  }
}

function paintCalendar() {
  const t = today();

  /* aviso para conectar */
  const box = $('#cal-connect');
  const needs = !Cal.ok || !Cal.granted;
  box.classList.toggle('hidden', !needs);
  if (needs) {
    const btn = $('#cal-connect-btn');
    if (!Cal.ok) {
      $('#cal-connect-title').textContent = 'Tu Google Calendar, aquí';
      $('#cal-connect-text').textContent = 'En la app de Android verás aquí los eventos de tu Google Calendar junto a tus metas, tareas y exámenes.';
      btn.classList.add('hidden');
    } else if (Cal.denied) {
      $('#cal-connect-title').textContent = 'Falta el permiso del calendario';
      $('#cal-connect-text').textContent = 'Si Android ya no te lo pregunta, ábrelo en Ajustes → Aplicaciones → Rutina → Permisos → Calendario.';
      btn.classList.remove('hidden');
      btn.textContent = 'Abrir ajustes de la app';
    } else {
      $('#cal-connect-title').textContent = 'Conecta tu Google Calendar';
      $('#cal-connect-text').textContent = 'Rutina muestra el calendario que ya tienes en el teléfono. No hace falta iniciar sesión y tus eventos no salen de tu celular.';
      btn.classList.remove('hidden');
      btn.textContent = 'Conectar calendario';
    }
  }

  /* mes */
  const m = parseYmd(calMonth);
  $('#cal-title').textContent = `${cap(MONTHS[m.getMonth()])} ${m.getFullYear()}`;
  $('#cal-today').classList.toggle('hidden', calSel === t && calMonth === t.slice(0, 8) + '01');

  const days = calGridDays();
  const evMap = calEventsByDay(days);
  const month = calMonth.slice(0, 7);
  $('#cal-grid').innerHTML = days.map(d => {
    const dots = [];
    for (const it of appItemsOn(d)) if (!dots.includes(it.color)) dots.push(it.color);
    for (const e of (evMap.get(d) || [])) if (!dots.includes(e.color)) dots.push(e.color);
    const cls = [
      'cal-cell',
      d.slice(0, 7) !== month ? 'out' : '',
      d === t ? 'is-today' : '',
      d === calSel ? 'on' : '',
    ].join(' ');
    return `<button class="${cls}" data-cal="${d}">
      <span class="cal-n">${parseYmd(d).getDate()}</span>
      <span class="cal-dots">${dots.slice(0, 3).map(c => `<i style="--c:${c}"></i>`).join('')}</span>
    </button>`;
  }).join('');

  /* agenda del día elegido */
  $('#cal-day-title').textContent = calSel === t ? 'Hoy' : prettyDate(calSel);
  const mine = appItemsOn(calSel);
  const evs = (evMap.get(calSel) || []);
  const rows = [
    ...evs.map(e => ({ sort: e.allDay ? '00:00' : (e.first < calSel ? '00:01' : hm(e.begin)), html: eventRowHTML(e) })),
    ...mine.map(it => ({ sort: it.time || '00:00', html: appRowHTML(it) })),
  ].sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
  $('#cal-day-count').textContent = rows.length || '';
  $('#cal-agenda').innerHTML = rows.length ? rows.map(r => r.html).join('')
    : `<div class="cal-empty">${Cal.granted || !Cal.ok ? 'Día libre. Nada en tu agenda.' : 'Nada tuyo este día. Conecta tu calendario para ver también tus eventos.'}</div>`;
}

function eventRowHTML(e) {
  let when;
  if (e.allDay) when = '<b>Todo</b><span>el día</span>';
  else if (e.first < calSel && e.last > calSel) when = '<b>Todo</b><span>el día</span>';
  else if (e.first < calSel) when = `<b>hasta</b><span>${hm(e.end)}</span>`;
  else when = `<b>${hm(e.begin)}</b><span>${e.last > calSel ? 'sigue' : hm(e.end)}</span>`;
  const sub = [e.calendarName, e.location].filter(Boolean).map(esc).join(' · ');
  return `<div class="ev" style="--c:${e.color}" data-act="ev-open" data-id="${esc(e.id)}" data-begin="${Number(e.begin)}">
    <div class="ev-time">${when}</div>
    <div class="ev-main"><div class="ev-title">${esc(e.title)}</div>${sub ? `<div class="ev-sub">${sub}</div>` : ''}</div>
  </div>`;
}

function appRowHTML(it) {
  const when = it.time ? `<b>${it.time}</b>${it.kind === 'hw' ? '<span>entrega</span>' : ''}` : '<b>Todo</b><span>el día</span>';
  return `<div class="ev mine ${it.done ? 'done' : ''} ${it.prio === 1 ? 'is-alta' : ''}" style="--c:${it.color}" data-act="${it.act}" data-id="${it.id}">
    <div class="ev-time">${when}</div>
    <div class="ev-main"><div class="ev-title">${esc(it.title)}</div><div class="ev-sub">${esc(it.sub)}</div></div>
  </div>`;
}

function openEventSheet(id, begin) {
  const c = Cal.cache.get(calGridDays()[0]);
  const e = c && c.events.find(x => String(x.id) === String(id) && Number(x.begin) === Number(begin));
  if (!e) return;
  curEvent = { ...e, day: calSel };
  let when;
  if (e.allDay) {
    when = e.first === e.last ? `${prettyDate(e.first)} · todo el día` : `Del ${prettyDate(e.first)} al ${prettyDate(e.last)}`;
  } else {
    when = e.first === e.last
      ? `${prettyDate(e.first)} · ${hm(e.begin)} – ${hm(e.end)}`
      : `${prettyDate(e.first)} ${hm(e.begin)} → ${prettyDate(e.last)} ${hm(e.end)}`;
  }
  $('#ev-detail').innerHTML = `<div class="ev-hero" style="--c:${e.color}">
    <h3>${esc(e.title)}</h3>
    <p class="ev-when">${esc(when)}</p>
    ${e.calendarName ? `<p class="ev-cal"><i></i>${esc(e.calendarName)}</p>` : ''}
    ${e.location ? `<p class="ev-loc">${ICON_PIN}${esc(e.location)}</p>` : ''}
    ${e.description ? `<p class="ev-desc">${esc(e.description)}</p>` : ''}
  </div>`;
  openSheet('#sheet-event');
}

function eventToRutina(kind) {
  const e = curEvent; if (!e) return;
  const list = kind === 'goal' ? S.goals : S.extras;
  if (list.some(x => String(x.fromCal) === String(e.id))) { toast('Ya lo tienes en Rutina'); return; }
  const day = e.day || e.first;
  if (kind === 'goal') {
    S.goals.push({ id: uid('g'), title: e.title.slice(0, 70), note: '', color: 'pink',
      target: 0, unit: '', current: 0, due: day, done: false, fromCal: String(e.id) });
  } else {
    S.extras.push({ id: uid('e'), title: e.title.slice(0, 60), note: (e.location || '').slice(0, 240), color: 'orange',
      date: day, time: e.allDay || e.first < day ? null : hm(e.begin), alarm: false, done: false, prio: 0, fromCal: String(e.id) });
  }
  save(); closeSheets(); renderAll();
  toast(kind === 'goal' ? 'Agregado a tus metas' : `Agregado como imprevisto del ${prettyShort(day)}`);
  buzz(10);
}

/* ── hoja: tus calendarios ── */
function openCalSettings() {
  const list = $('#cs-list');
  if (!Cal.ok || !Cal.granted) {
    list.innerHTML = `<div class="row tappable" id="cs-connect"><span class="row-label">${Cal.ok ? 'Conectar calendario' : 'Solo en la app de Android'}</span>${Cal.ok ? '<span class="chev"></span>' : ''}</div>`;
    $('#cs-note').textContent = '';
    $('#cs-target-wrap').classList.add('hidden');
  } else {
    list.innerHTML = Cal.calendars.length ? Cal.calendars.map(c => `
      <label class="row">
        <span class="cs-dot" style="--c:${safeHex(c.color)}"></span>
        <span class="row-label">${esc(c.name)}${c.account && c.account !== c.name ? `<span class="row-hint">${esc(c.account)}</span>` : ''}</span>
        <input type="checkbox" class="switch" data-calid="${esc(c.id)}" ${S.cal.hidden.includes(c.id) ? '' : 'checked'}>
      </label>`).join('')
      : '<div class="row"><span class="row-label">No encontré calendarios en el teléfono<span class="row-hint">Revisa que tu cuenta de Google esté sincronizando el calendario.</span></span></div>';
    $('#cs-note').textContent = 'Son los calendarios de las cuentas de tu teléfono. Lo que cambies en Google Calendar aparece aquí solo.';
    const w = Cal.calendars.filter(c => c.writable);
    $('#cs-target-wrap').classList.toggle('hidden', !w.length);
    $('#cs-target').innerHTML = w.map(c =>
      `<button class="chip ${c.id === S.cal.target ? 'on' : ''}" style="--c:${safeHex(c.color)}" data-target="${esc(c.id)}">${esc(c.name)}</button>`).join('');
  }
  $$('#sheet-calset [data-show]').forEach(sw => { sw.checked = !!S.cal.show[sw.dataset.show]; });
  openSheet('#sheet-calset');
}

/* ── metas, tareas y exámenes en Google Calendar ── */
function gcalSpec(kind, it) {
  const pie = '\n\nCreado desde la app Rutina.';
  if (kind === 'goal') {
    if (!it.due) return null;
    return { title: `Meta: ${it.title}`, description: (it.note || '') + pie, allDay: true, date: it.due };
  }
  if (kind === 'hw') {
    if (!it.due) return null;
    const title = `Tarea: ${it.title}${it.subject ? ` (${it.subject})` : ''}`;
    const description = [it.note, it.mins ? `Te va a tomar unas ${fmtMins(it.mins)}.` : ''].filter(Boolean).join('\n') + pie;
    if (it.time) {
      const start = parseYmd(it.due).setHours(...it.time.split(':').map(Number), 0, 0);
      return { title, description, allDay: false, start, end: start + (it.mins || 60) * 60000 };
    }
    return { title, description, allDay: true, date: it.due };
  }
  if (kind === 'exam') {
    if (!it.date) return null;
    const temas = it.topics.length ? 'Temas:\n' + it.topics.map(t => `${t.done ? '✓' : '○'} ${t.title}`).join('\n') : '';
    return { title: `Examen: ${it.name || 'Sin nombre'}`, description: temas + pie, allDay: true, date: it.date };
  }
  return null;
}

/** Crea, actualiza o borra el evento de Google Calendar de una meta, tarea o examen. */
async function gcalSync(kind, it) {
  if (!Cal.ok || !Cal.granted) return;
  const spec = it.gcalOn ? gcalSpec(kind, it) : null;
  if (!spec && !it.gcal) return;
  try {
    if (!spec) {
      await P.Calendario.deleteEvent({ id: String(it.gcal) });
      it.gcal = null;
    } else {
      let listo = false;
      if (it.gcal) listo = (await P.Calendario.updateEvent({ id: String(it.gcal), ...spec })).updated > 0;
      if (!listo) {
        if (!S.cal.target) throw new Error('sin calendario donde escribir');
        it.gcal = (await P.Calendario.createEvent({ calendarId: S.cal.target, ...spec })).id;
      }
    }
    save();
  } catch (e) {
    console.warn('Google Calendar', e);
    toast('No se pudo actualizar tu Google Calendar');
  }
  Cal.cache.clear();
  if (currentPage() === 'calendar') renderCalendar(true);
}

async function gcalRemove(it) {
  if (!it || !it.gcal || !Cal.granted) return;
  try { await P.Calendario.deleteEvent({ id: String(it.gcal) }); } catch (e) {}
  Cal.cache.clear();
}

/** Fila "En Google Calendar" de una hoja: p = g | h | x. */
function syncGcalRow(p, hasDate) {
  const row = $(`#${p}-gcal-row`), sw = $(`#${p}-gcal`);
  row.classList.toggle('hidden', !Cal.ok);
  row.classList.toggle('disabled', !hasDate);
  sw.disabled = !hasDate;
  if (!hasDate) sw.checked = false;
  const t = Cal.target();
  $(`#${p}-gcal-hint`).textContent = !hasDate ? 'ponle fecha primero'
    : !Cal.granted ? 'al activarlo te pido acceso al calendario'
    : t ? `se guarda en ${t.name}` : 'no hay un calendario donde escribir';
}

/** Al prender el interruptor sin permiso, lo pide; si no lo dan, lo apaga. */
async function gcalSwitchOn(sw, p) {
  if (!sw.checked || Cal.granted) return true;
  const ok = await Cal.connect();
  if (!ok) sw.checked = false;
  syncGcalRow(p, !sw.disabled);
  return ok;
}

/* ══════════════════════════════════════════════════════
   REPORTE PARA UNA IA
   ══════════════════════════════════════════════════════ */
let repKind = 'week';
let repAnchor = null;

function periodRange(kind, a) {
  if (kind === 'day') return [a, a];
  if (kind === 'week') { const m = startOfWeek(a); return [m, addDays(m, 6)]; }
  const first = a.slice(0, 8) + '01';
  const d = parseYmd(first); d.setMonth(d.getMonth() + 1); d.setDate(0);
  return [first, ymd(d)];
}

function shiftPeriod(kind, a, dir) {
  if (kind === 'day') return addDays(a, dir);
  if (kind === 'week') return addDays(a, 7 * dir);
  const d = parseYmd(a.slice(0, 8) + '01'); d.setMonth(d.getMonth() + dir);
  return ymd(d);
}

function rangeText(f, t) {
  const a = parseYmd(f), b = parseYmd(t);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} al ${b.getDate()} de ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} de ${MONTHS[a.getMonth()]} al ${b.getDate()} de ${MONTHS[b.getMonth()]}`;
}

function periodLabel(kind, a) {
  const [f, t] = periodRange(kind, a);
  const hoy = today();
  if (kind === 'day') return f === hoy ? 'Hoy' : f === addDays(hoy, -1) ? 'Ayer' : prettyDate(f);
  if (kind === 'week') return f === startOfWeek(hoy) ? 'Esta semana' : `Semana del ${rangeText(f, t)}`;
  const d = parseYmd(f);
  return `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
}

/** "jueves 24 de septiembre" */
function longDate(s) {
  const d = parseYmd(s);
  return `${parseYmd(s).toLocaleDateString('es', { weekday: 'long' })} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}
/** "jue 24 sept" */
function shortDate(s) {
  const d = parseYmd(s);
  return `${DAY_NAME[d.getDay()].toLowerCase()} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, d.getMonth() === 8 ? 4 : 3)}`;
}

async function buildReport(kind, anchor) {
  const t = today();
  const [from, to] = periodRange(kind, anchor);
  const until = to < t ? to : t;
  const days = from <= until ? eachDay(from, until) : [];
  const out = [];
  const L = s => out.push(s);
  const mark = (r, d) => (isDone(r.id, d) ? '✓' : isFailed(r.id, d) ? '✗' : '○');
  const segName = r => (S.segments.find(s => s.id === r.segmentId) || {}).name || 'Sin segmento';
  const cuando = { day: 'mañana', week: 'la próxima semana', month: 'el próximo mes' }[kind];

  /* agenda de Google, si está conectado: da contexto de por qué un día salió mal */
  const agenda = new Map();
  if (Cal.granted && days.length) {
    try {
      for (const e of await Cal.fetch(from, until)) {
        for (let d = e.first < from ? from : e.first, n = 0; d <= (e.last > until ? until : e.last) && n < 40; d = addDays(d, 1), n++) {
          if (!agenda.has(d)) agenda.set(d, []);
          agenda.get(d).push(e);
        }
      }
    } catch (e) {}
  }

  const nombre = kind === 'day' ? `del ${longDate(from)}` : kind === 'week' ? `de la semana del ${rangeText(from, to)}` : `de ${MONTHS[parseYmd(from).getMonth()]} ${parseYmd(from).getFullYear()}`;
  L(`Hola. Te paso el registro ${nombre} de mi app de hábitos "Rutina".`);
  L(`Analiza cómo me fue: en qué fallé y si ves patrones (días de la semana, horas, segmentos o hábitos que se repiten), qué estoy haciendo bien, y dame 3 recomendaciones concretas y realistas para ${cuando}.`);
  L('');
  L('CÓMO LEER ESTO');
  L('- Hábitos: mi rutina permanente, agrupada en segmentos. Son los que miden mi disciplina.');
  L('- ✓ lo cumplí · ✗ marqué que no lo hice · ○ quedó sin marcar');
  L('- Imprevistos: cosas puntuales de ese día. No cuentan para mi racha.');
  L('');
  L(`PERIODO: ${kind === 'day' ? longDate(from) : `del ${longDate(from)} al ${longDate(to)}`} de ${parseYmd(to).getFullYear()}`);
  if (from <= t && to > t) L(`El periodo sigue en curso: hay datos hasta hoy, ${longDate(t)}.`);
  if (from > t) L('Este periodo todavía no empieza.');
  const now = new Date();
  L(`Reporte generado el ${longDate(t)} a las ${pad(now.getHours())}:${pad(now.getMinutes())}.`);
  const ci = cycleInfo();
  L(`Ciclo académico: del ${prettyDM(ci.start)} al ${prettyDM(ci.end)}${ci.ended ? ' (ya terminó)' : ` (quedan ${ci.left} días)`}.`);
  L('');

  /* resumen */
  const act = days.map(d => ({ d, s: dayStat(d) })).filter(x => x.s.total > 0);
  const sum = k => act.reduce((a, x) => a + x.s[k], 0);
  const tot = sum('total'), hechos = sum('done'), fallados = sum('failed');
  L('RESUMEN');
  if (!act.length) L('- No hubo hábitos programados en este periodo.');
  else {
    L(`- Cumplimiento de hábitos: ${Math.round(hechos / tot * 100)}% (${hechos} de ${tot})`);
    if (kind !== 'day') L(`- Días al 100%: ${act.filter(x => x.s.done === x.s.total).length} de ${act.length}`);
    if (fallados) L(`- Marcados como "no lo hice": ${fallados}`);
    const sinMarcar = tot - hechos - fallados;
    if (sinMarcar) {
      const hoyS = days.includes(t) ? dayStat(t) : null;
      const deHoy = hoyS ? hoyS.total - hoyS.done - hoyS.failed : 0;
      L(`- Sin marcar: ${sinMarcar}${deHoy ? ` (${deHoy === sinMarcar ? 'todos' : deHoy} de hoy, que sigue en curso)` : ''}`);
    }
    const cerrados = act.filter(x => x.d < t);   // hoy todavía no cuenta como mejor o peor día
    if (kind !== 'day' && cerrados.length > 1) {
      const orden = [...cerrados].sort((a, b) => a.s.pct - b.s.pct);
      L(`- Mejor día: ${shortDate(orden[orden.length - 1].d)} (${orden[orden.length - 1].s.pct}%) · peor día: ${shortDate(orden[0].d)} (${orden[0].s.pct}%)`);
    }
  }
  L(`- Racha actual: ${currentStreak()} día(s) · mejor racha: ${bestStreak()} día(s)`);
  if (kind !== 'day') {
    const [pf, pt] = periodRange(kind, shiftPeriod(kind, anchor, -1));
    const prevDays = eachDay(pf, pt < t ? pt : t);
    if (act.length && prevDays.some(d => dayStat(d).total > 0)) {
      const a = avgPct(prevDays), b = avgPct(days);
      L(`- Frente al periodo anterior: ${b - a > 0 ? '+' : ''}${b - a} puntos (${a}% → ${b}%)`);
    }
  }
  const estudio = days.reduce((a, d) => a + studyMins(d), 0);
  const conMeta = days.filter(d => studyGoalFor(d) > 0);
  if (estudio || conMeta.length) {
    let s = `- Horas de estudio: ${fmtMins(estudio)} en total`;
    if (conMeta.length) s += ` · meta cumplida ${conMeta.filter(d => studyMins(d) >= studyGoalFor(d)).length} de ${conMeta.length} día(s) (meta: ${fmtMins(studyGoalFor(until) || S.studyGoalMin)} al día)`;
    L(s);
  }
  const arboles = S.trees.filter(tr => tr.planted >= from && tr.planted <= to).length;
  if (arboles) L(`- Árboles plantados (semanas perfectas): ${arboles}`);
  L('');

  /* segmentos y hábitos */
  if (kind !== 'day' && act.length) {
    L('POR SEGMENTO');
    for (const seg of [...S.segments, { id: null, name: 'Sin segmento' }]) {
      const rs = S.routines.filter(r => seg.id ? r.segmentId === seg.id : !S.segments.some(s => s.id === r.segmentId));
      let sch = 0, ok = 0, x = 0;
      for (const r of rs) for (const d of days) {
        if (!isRoutineOn(r, d)) continue;
        sch++; if (isDone(r.id, d)) ok++; else if (isFailed(r.id, d)) x++;
      }
      if (sch) L(`- ${seg.name}: ${Math.round(ok / sch * 100)}% (${ok} de ${sch})${x ? ` · ${x} marcados ✗` : ''}`);
    }
    L('');
    L('POR HÁBITO (peor primero)');
    const filas = S.routines.map(r => {
      const sch = days.filter(d => isRoutineOn(r, d));
      const ok = sch.filter(d => isDone(r.id, d));
      return { r, sch, ok, x: sch.filter(d => isFailed(r.id, d)), nada: sch.filter(d => !isDone(r.id, d) && !isFailed(r.id, d)) };
    }).filter(f => f.sch.length).sort((a, b) => a.ok.length / a.sch.length - b.ok.length / b.sch.length);
    for (const f of filas) {
      const r = f.r;
      const info = [segName(r), r.repeat === 'weekly'
        ? WEEK_ORDER.filter(w => (r.days || []).includes(w)).map(w => DAY_NAME[w].toLowerCase()).join(', ')
        : 'todos los días'];
      if (r.time) info.push(r.time);
      if (r.prio === 1) info.push('prioridad alta');
      let s = `- ${r.title} [${info.join(' · ')}]: ${f.ok.length} de ${f.sch.length} (${Math.round(f.ok.length / f.sch.length * 100)}%)`;
      if (f.x.length) s += ` · ✗ ${f.x.map(shortDate).join(', ')}`;
      if (f.nada.length) s += ` · ○ ${f.nada.map(shortDate).join(', ')}`;
      L(s);
    }
    L('');
  }

  /* día por día */
  L('DÍA POR DÍA');
  if (!days.length) L('(todavía no hay días registrados)');
  for (const d of days) {
    const s = dayStat(d);
    const ex = S.extras.filter(e => e.date === d);
    const sm = studyMins(d), g = studyGoalFor(d);
    const ag = agenda.get(d) || [];
    if (kind === 'month') {
      const partes = [s.total ? `${s.pct}% (${s.done}/${s.total})` : 'sin hábitos'];
      const pendientes = routinesFor(d).filter(r => !isDone(r.id, d));
      if (pendientes.length) partes.push(pendientes.map(r => `${mark(r, d)} ${r.title}`).join(', '));
      if (sm || g) partes.push(`horas de estudio ${fmtMins(sm)}${g ? ' de ' + fmtMins(g) : ''}`);
      if (ex.length) partes.push(`imprevistos ${ex.filter(e => e.done).length}/${ex.length}`);
      if (ag.length) partes.push(`${ag.length} evento(s) en agenda`);
      L(`${shortDate(d)}${d === t ? ' (en curso)' : ''} — ${partes.join(' · ')}`);
    } else {
      L(`${cap(longDate(d))} — ${s.total ? `${s.pct}% (${s.done} de ${s.total})` : 'sin hábitos ese día'}${d === t ? ' · el día sigue en curso' : ''}`);
      for (const grp of dayGroups(d)) L(`  ${grp.seg.name}: ${grp.rs.map(r => `${mark(r, d)} ${r.title}${r.time ? ` (${r.time})` : ''}`).join(' · ')}`);
      if (sm || g) L(`  Horas de estudio: ${fmtMins(sm)}${g ? ` de ${fmtMins(g)}` : ''}`);
      if (ex.length) L(`  Imprevistos: ${ex.map(e => `${e.done ? '✓' : '○'} ${e.title}`).join(' · ')}`);
      if (ag.length) L(`  Agenda: ${ag.map(e => `${e.allDay ? 'todo el día' : hm(e.begin)} ${e.title}`).join(' · ')}`);
    }
  }
  L('');

  /* tareas */
  const pend = S.homework.filter(h => !h.done)
    .sort((a, b) => (b.prio || 0) - (a.prio || 0) || ((a.due || '9999') < (b.due || '9999') ? -1 : 1));
  const entregadas = S.homework.filter(h => h.done && h.doneOn && h.doneOn >= from && h.doneOn <= to);
  if (pend.length || entregadas.length) {
    L('TAREAS');
    for (const h of pend) {
      L(`- Pendiente: ${h.title}${h.subject ? ` (${h.subject})` : ''}${h.prio === 1 ? ' · prioridad alta' : ''}` +
        `${h.due ? ` · entrega ${shortDate(h.due)}${h.due < t ? ' (VENCIDA)' : ''}` : ' · sin fecha'}${h.mins ? ` · unas ${fmtMins(h.mins)}` : ''}`);
    }
    for (const h of entregadas) L(`- Entregada el ${shortDate(h.doneOn)}: ${h.title}`);
    L('');
  }

  /* exámenes */
  const exams = S.examSegments.filter(x => (x.name || '').trim() || x.topics.length);
  if (exams.length) {
    L('EXÁMENES');
    for (const x of exams) {
      const p = examProgress(x);
      const falta = x.topics.filter(tp => !tp.done).map(tp => tp.title);
      const fecha = x.date ? (x.date < t ? `fue el ${shortDate(x.date)}` : `es el ${shortDate(x.date)} (en ${diffDays(t, x.date)} días)`) : 'sin fecha';
      L(`- ${x.name || 'Sin nombre'}: ${fecha} · ${p.d} de ${p.n} temas listos (${p.pct}%)` +
        (falta.length ? ` · me falta: ${falta.slice(0, 10).join(', ')}${falta.length > 10 ? '…' : ''}` : ''));
    }
    L('');
  }

  /* metas */
  if (S.goals.length) {
    L('METAS');
    for (const g of S.goals) {
      const pct = g.target ? Math.min(100, Math.round((g.current || 0) / g.target * 100)) : null;
      L(`- ${g.done ? '✓' : '○'} ${g.title}${g.target ? ` · ${g.current || 0} de ${g.target}${g.unit ? ' ' + g.unit : ''} (${pct}%)` : ''}${g.due ? ` · fecha límite ${shortDate(g.due)}` : ''}`);
    }
    L('');
  }

  /* notas */
  const notas = S.notes.filter(n => n.created >= from && n.created <= to);
  if (notas.length) {
    L('NOTAS QUE ESCRIBÍ');
    for (const n of notas) L(`- ${shortDate(n.created)}: ${n.text.replace(/\s+/g, ' ').slice(0, 300)}`);
    L('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function renderReport() {
  if (!repAnchor) repAnchor = today();
  $$('#rep-kind .seg-btn').forEach(b => b.classList.toggle('is-on', b.dataset.kind === repKind));
  $('#rep-label').textContent = periodLabel(repKind, repAnchor);
  $('#rep-next').disabled = periodRange(repKind, shiftPeriod(repKind, repAnchor, 1))[0] > today();
  $('#rep-copy').textContent = { day: 'Copiar el día', week: 'Copiar la semana', month: 'Copiar el mes' }[repKind];
  if (!$('#rep-pre').classList.contains('hidden')) previewReport();
}

async function previewReport() {
  const k = repKind, a = repAnchor;
  const txt = await buildReport(k, a);
  if (k === repKind && a === repAnchor) $('#rep-pre').textContent = txt;
}

async function copyText(txt) {
  try { if (P.Clipboard) { await P.Clipboard.write({ string: txt }); return true; } } catch (e) {}
  try { await navigator.clipboard.writeText(txt); return true; } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

/* ══════════════════════════════════════════════════════
   AJUSTES
   ══════════════════════════════════════════════════════ */
function renderSettings() {
  paint($('#accent-swatches'), swatchHTML(ACCENTS, S.accent, 'accent'), 'acc');
  $('#opt-sound').checked = S.sound;
  $('#opt-vibrate').checked = S.vibrate;
  $('#f-cycle-start').value = S.cycleStart || firstDay();
  $('#f-cycle-end').value = S.cycleEnd;
  $('#study-goal-val').textContent = S.studyGoalMin ? fmtMins(S.studyGoalMin) : 'Apagada';
  $('#version').textContent = 'Rutina · 4.0' + (NATIVE ? ' · Android' : '');
  renderReport();

  const st = $('#notif-state'), note = $('#notif-note');
  if (Alarms.native) {
    st.textContent = Alarms.granted ? 'Activadas' : 'Tocar para activar';
    note.textContent = Alarms.granted
      ? 'Las alarmas suenan aunque la app esté cerrada. Si Android las retrasa, entra a Ajustes → Aplicaciones → Rutina → Batería y elige "Sin restricciones".'
      : 'Toca para permitir las alarmas del sistema.';
  } else if (!('Notification' in window)) {
    st.textContent = 'No disponibles';
    note.textContent = 'Este navegador no admite notificaciones. Las alarmas sonarán solo con la app abierta.';
  } else if (Notification.permission === 'granted') {
    st.textContent = 'Activadas';
    note.textContent = 'Estás usando la versión web: las alarmas llegan con la app abierta o en segundo plano. En la app instalada de Android suenan siempre.';
  } else if (Notification.permission === 'denied') {
    st.textContent = 'Bloqueadas';
    note.textContent = 'Las bloqueaste en el navegador. Habilítalas desde los ajustes del sitio.';
  } else {
    st.textContent = 'Desactivadas';
    note.textContent = 'Toca para permitir las alarmas.';
  }
}

/* ══════════════════════════════════════════════════════
   HOJAS
   ══════════════════════════════════════════════════════ */
let draft = null, draftKind = null;

function openSheet(id) {
  $('#backdrop').classList.add('on');
  $(id).classList.add('on');
  $('#fab').classList.add('hide');
}

function closeSheets() {
  if (draftKind === 'exam' && draft) {
    const x = S.examSegments.find(e => e.id === draft.id);
    // un segmento de examen creado y dejado en blanco no se queda guardado
    if (x && !x.name.trim() && !x.topics.length) {
      S.examSegments = S.examSegments.filter(e => e.id !== x.id);
      gcalRemove(x);
      save(); renderStudy();
    } else if (x && (x.gcalOn || x.gcal)) {
      gcalSync('exam', x);   // nombre, fecha o temas pudieron cambiar
    }
  }
  $('#backdrop').classList.remove('on');
  $$('.sheet').forEach(s => s.classList.remove('on'));
  $('#fab').classList.remove('hide');
  if (document.activeElement) document.activeElement.blur();
  draft = null; draftKind = null;
}

/** La fecha elegida en el calendario, si vienes de ahí (se usa una sola vez). */
function takePickDate() { const d = pickDate; pickDate = null; return d; }

/** Pinta el selector de prioridad de una hoja. */
function prioHTML(v) {
  return PRIOS.map(p =>
    `<button class="seg-btn ${p.v === v ? 'is-on' : ''}" data-prio="${p.v}">${p.label}</button>`).join('');
}
function bindPrio(id) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('[data-prio]'); if (!b || !draft) return;
    draft.prio = Number(b.dataset.prio);
    $$(`${id} .seg-btn`).forEach(x => x.classList.toggle('is-on', x === b));
    buzz(6);
  });
}

/* ── hábito de rutina ── */
function openRoutineSheet(r) {
  takePickDate();
  if (!r && !S.segments.length) {
    S.segments.push({ id: uid('s'), name: 'General', color: 'blue' });
    save(); renderRoutine();
    toast('Creé el segmento "General" para empezar');
  }
  draftKind = 'routine';
  draft = r ? structuredClone(r) : {
    id: uid('r'), segmentId: S.segments[0]?.id || null, title: '', note: '', color: 'blue',
    repeat: 'daily', days: [weekdayOf(today())], time: null, alarm: false, start: today(), prio: 0,
  };
  draft.prio = draft.prio || 0;
  const isNew = !r;
  $('#r-prio').innerHTML = prioHTML(draft.prio);
  $('#routine-sheet-title').textContent = isNew ? 'Nuevo hábito' : 'Editar hábito';
  $('#routine-delete').classList.toggle('hidden', isNew);
  $('#r-title').value = draft.title;
  $('#r-note').value = draft.note || '';
  $('#r-swatches').innerHTML = swatchHTML(COLORS, draft.color, 'color');
  $('#r-segments').innerHTML = S.segments.map(s =>
    `<button class="chip ${s.id === draft.segmentId ? 'on' : ''}" style="--c:${colorHex(s.color)}" data-seg="${s.id}">${esc(s.name)}</button>`
  ).join('');
  $$('#r-repeat .seg-btn').forEach(b => b.classList.toggle('is-on', b.dataset.repeat === draft.repeat));
  $('#r-days').innerHTML = WEEK_ORDER.map(w =>
    `<button class="day ${(draft.days || []).includes(w) ? 'on' : ''}" data-day="${w}">${DAY_LETTER[w]}</button>`).join('');
  $('#r-days-row').classList.toggle('hidden', draft.repeat !== 'weekly');
  $('#r-start').value = draft.start;
  $('#r-opt-time').checked = !!draft.time;
  $('#r-time-row').classList.toggle('hidden', !draft.time);
  $('#r-time').value = draft.time || '08:00';
  $('#r-alarm').checked = !!draft.alarm;
  syncAlarmRow('r');
  syncRoutineSave();
  openSheet('#sheet-routine');
  if (isNew) setTimeout(() => $('#r-title').focus(), 380);
}

function syncAlarmRow(p) {
  const on = $(`#${p}-opt-time`).checked;
  $(`#${p}-alarm-row`).classList.toggle('disabled', !on);
  $(`#${p}-alarm`).disabled = !on;
  if (!on) $(`#${p}-alarm`).checked = false;
  $(`#${p}-alarm-hint`).textContent = on ? 'te avisa a esa hora' : 'activa una hora primero';
}

function syncRoutineSave() {
  const ok = $('#r-title').value.trim() && !(draft.repeat === 'weekly' && !(draft.days || []).length);
  $('#routine-save').disabled = !ok;
}

const sameDays = (a, b) => [...(a || [])].sort().join() === [...(b || [])].sort().join();

function saveRoutine() {
  draft.title = $('#r-title').value.trim();
  draft.note = $('#r-note').value.trim();
  draft.start = $('#r-start').value || draft.start || today();
  draft.time = $('#r-opt-time').checked ? $('#r-time').value : null;
  draft.alarm = !!draft.time && $('#r-alarm').checked;
  const i = S.routines.findIndex(x => x.id === draft.id);

  /* Si cambiaron sus días, el horario nuevo corre desde hoy: los días
     pasados siguen contando con el horario que tenían. */
  if (i >= 0) {
    const prev = S.routines[i];
    const t = today();
    if (prev.repeat !== draft.repeat || (draft.repeat === 'weekly' && !sameDays(prev.days, draft.days))) {
      const nuevo = { from: t, repeat: draft.repeat, days: [...(draft.days || [])] };
      draft.sched = draft.start >= t ? [{ ...nuevo, from: draft.start }]
        : [...schedOf(prev).filter(x => x.from < t), nuevo];
    }
  }
  if (draft.sched && draft.sched.length) draft.sched[0].from = draft.sched[0].from < draft.start ? draft.sched[0].from : draft.start;

  if (i >= 0) S.routines[i] = draft; else S.routines.push(draft);
  save(); closeSheets(); renderAll(); Alarms.sync();
  toast(i >= 0 ? 'Hábito actualizado' : 'Hábito agregado a tu rutina');
  buzz(10);
}

/* ── imprevisto ── */
function openExtraSheet(e) {
  const pd = takePickDate();
  draftKind = 'extra';
  draft = e ? structuredClone(e) : {
    id: uid('e'), title: '', note: '', color: 'orange',
    date: pd || sel || today(), time: null, alarm: false, done: false, prio: 0,
  };
  draft.prio = draft.prio || 0;
  const isNew = !e;
  $('#e-prio').innerHTML = prioHTML(draft.prio);
  $('#extra-sheet-title').textContent = isNew ? 'Imprevisto' : 'Editar imprevisto';
  $('#extra-delete').classList.toggle('hidden', isNew);
  $('#e-title').value = draft.title;
  $('#e-note').value = draft.note || '';
  $('#e-swatches').innerHTML = swatchHTML(COLORS, draft.color, 'color');
  $('#e-date').value = draft.date;
  $('#e-opt-time').checked = !!draft.time;
  $('#e-time-row').classList.toggle('hidden', !draft.time);
  $('#e-time').value = draft.time || '12:00';
  $('#e-alarm').checked = !!draft.alarm;
  syncAlarmRow('e');
  $('#extra-save').disabled = !draft.title;
  openSheet('#sheet-extra');
  if (isNew) setTimeout(() => $('#e-title').focus(), 380);
}

function saveExtra() {
  draft.title = $('#e-title').value.trim();
  draft.note = $('#e-note').value.trim();
  draft.date = $('#e-date').value || today();
  draft.time = $('#e-opt-time').checked ? $('#e-time').value : null;
  draft.alarm = !!draft.time && $('#e-alarm').checked;
  const i = S.extras.findIndex(x => x.id === draft.id);
  if (i >= 0) S.extras[i] = draft; else S.extras.push(draft);
  const d = draft.date;
  save(); closeSheets();
  if (currentPage() === 'today' && d !== sel) sel = d;
  renderAll(); Alarms.sync();
  toast(d === today() ? 'Agregado para hoy' : `Agregado para ${prettyShort(d)}`);
  buzz(10);
}

/* ── segmento de rutina ── */
function openSegmentSheet(seg) {
  draftKind = 'segment';
  draft = seg ? structuredClone(seg) : { id: uid('s'), name: '', color: 'blue' };
  const isNew = !seg;
  $('#segment-sheet-title').textContent = isNew ? 'Nuevo segmento' : 'Editar segmento';
  $('#segment-delete').classList.toggle('hidden', isNew);
  $('#s-name').value = draft.name;
  $('#s-swatches').innerHTML = swatchHTML(COLORS, draft.color, 'color');
  $('#segment-save').disabled = !draft.name;
  openSheet('#sheet-segment');
  if (isNew) setTimeout(() => $('#s-name').focus(), 380);
}

function saveSegment() {
  draft.name = $('#s-name').value.trim();
  const i = S.segments.findIndex(x => x.id === draft.id);
  if (i >= 0) S.segments[i] = draft; else S.segments.push(draft);
  save(); closeSheets(); renderAll();
  toast(i >= 0 ? 'Segmento actualizado' : 'Segmento creado');
  buzz(10);
}

function deleteSegment(id) {
  const seg = S.segments.find(s => s.id === id);
  const rs = S.routines.filter(r => r.segmentId === id);
  if (!confirm(`¿Eliminar "${seg.name}"?\n\nSe borran también sus ${rs.length} hábito(s) y su historial. No se puede deshacer.`)) return;
  S.routines = S.routines.filter(r => r.segmentId !== id);
  S.segments = S.segments.filter(s => s.id !== id);
  forgetRoutines(new Set(rs.map(r => r.id)));
  save(); closeSheets(); renderAll(); Alarms.sync();
  toast('Segmento eliminado');
}

/* ── segmento de examen (se guarda al instante) ── */
function openExamSheet(x) {
  const pd = takePickDate();
  draftKind = 'exam';
  if (!x) {
    x = { id: uid('x'), name: '', color: 'purple', date: pd, topics: [] };
    S.examSegments.push(x);
    save();
  }
  draft = x;
  $('#exam-sheet-title').textContent = 'Segmento de examen';
  $('#exam-delete').classList.remove('hidden');
  $('#x-name').value = x.name;
  $('#x-date').value = x.date || '';
  $('#x-swatches').innerHTML = swatchHTML(COLORS, x.color, 'color');
  $('#x-gcal').checked = !!x.gcalOn;
  syncGcalRow('x', !!x.date);
  renderTopics();
  openSheet('#sheet-exam');
  if (!x.name) setTimeout(() => $('#x-name').focus(), 380);
}

function updateTopicCount() {
  const p = examProgress(draft);
  $('#x-count').textContent = p.n ? `${p.d} de ${p.n} · ${p.pct}%` : '';
}

function renderTopics() {
  const x = draft;
  updateTopicCount();
  $('#x-topics').innerHTML = x.topics.length
    ? x.topics.map(t => `<div class="topic ${t.done ? 'done' : ''}" style="--c:${colorHex(x.color)}">
        <button class="topic-check" data-act="x-toggle" data-id="${t.id}" aria-label="Marcar">${ICON_CHECK}</button>
        <span class="topic-txt">${esc(t.title)}</span>
        <button class="topic-del" data-act="x-deltopic" data-id="${t.id}" aria-label="Quitar tema">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>`).join('')
    : '<div class="topics-empty">Todavía no hay temas. Agrégalos abajo.</div>';
  $('#x-add-topic').disabled = !$('#x-new-topic').value.trim();
}

function commitExam() {
  const i = S.examSegments.findIndex(e => e.id === draft.id);
  if (i >= 0) S.examSegments[i] = draft;
  save();
  renderStudy();
}

/* ── tarea ── */
function openHwSheet(h) {
  const pd = takePickDate();
  draftKind = 'hw';
  draft = h ? structuredClone(h) : {
    id: uid('h'), title: '', subject: '', note: '', color: 'blue',
    due: pd, time: null, alarm: false, done: false, prio: 0, mins: 0,
  };
  draft.prio = draft.prio || 0;
  draft.mins = draft.mins || 0;
  const isNew = !h;
  $('#h-prio').innerHTML = prioHTML(draft.prio);
  $('#h-hours-val').textContent = draft.mins ? fmtMins(draft.mins) : 'Sin definir';
  $('#hw-sheet-title').textContent = isNew ? 'Nueva tarea' : 'Editar tarea';
  $('#hw-delete').classList.toggle('hidden', isNew);
  $('#h-title').value = draft.title;
  $('#h-subject').value = draft.subject || '';
  $('#h-note').value = draft.note || '';
  $('#h-swatches').innerHTML = swatchHTML(COLORS, draft.color, 'color');
  $('#h-opt-date').checked = !!draft.due;
  $('#h-date-row').classList.toggle('hidden', !draft.due);
  $('#h-date').value = draft.due || today();
  $('#h-opt-time').checked = !!draft.time;
  $('#h-time-row').classList.toggle('hidden', !draft.time);
  $('#h-time').value = draft.time || '08:00';
  $('#h-alarm').checked = !!draft.alarm;
  $('#h-gcal').checked = !!draft.gcalOn;
  syncHwRows();
  $('#hw-save').disabled = !draft.title;
  openSheet('#sheet-hw');
  if (isNew) setTimeout(() => $('#h-title').focus(), 380);
}

/* la hora depende de que haya fecha, y la alarma de que haya hora */
function syncHwRows() {
  const hasDate = $('#h-opt-date').checked;
  $('#h-time-row-wrap').classList.toggle('disabled', !hasDate);
  $('#h-opt-time').disabled = !hasDate;
  if (!hasDate) { $('#h-opt-time').checked = false; $('#h-time-row').classList.add('hidden'); }
  syncAlarmRow('h');
  syncGcalRow('h', hasDate);
}

function saveHw() {
  draft.title = $('#h-title').value.trim();
  draft.subject = $('#h-subject').value.trim();
  draft.note = $('#h-note').value.trim();
  draft.due = $('#h-opt-date').checked ? $('#h-date').value : null;
  draft.time = (draft.due && $('#h-opt-time').checked) ? $('#h-time').value : null;
  draft.alarm = !!draft.time && $('#h-alarm').checked;
  draft.gcalOn = !!draft.due && $('#h-gcal').checked;
  const i = S.homework.findIndex(x => x.id === draft.id);
  if (i >= 0) S.homework[i] = draft; else S.homework.push(draft);
  const it = draft;
  save(); closeSheets(); renderAll(); Alarms.sync();
  gcalSync('hw', it);
  toast(i >= 0 ? 'Tarea actualizada' : 'Tarea agregada');
  buzz(10);
}

/* ── nota rápida ── */
function openNoteSheet(n) {
  takePickDate();
  draftKind = 'note';
  draft = n ? structuredClone(n) : { id: uid('n'), text: '', color: 'yellow', created: today() };
  const isNew = !n;
  $('#note-sheet-title').textContent = isNew ? 'Nota rápida' : 'Editar nota';
  $('#note-delete').classList.toggle('hidden', isNew);
  $('#n-text').value = draft.text;
  $('#n-swatches').innerHTML = swatchHTML(COLORS, draft.color, 'color');
  $('#note-save').disabled = !draft.text.trim();
  openSheet('#sheet-note');
  setTimeout(() => $('#n-text').focus(), 380);
}

function saveNote() {
  draft.text = $('#n-text').value.trim();
  if (!draft.text) return;
  const i = S.notes.findIndex(x => x.id === draft.id);
  if (i >= 0) S.notes[i] = draft; else S.notes.unshift(draft);   // la más nueva arriba
  save(); closeSheets(); renderStudy();
  toast(i >= 0 ? 'Nota actualizada' : 'Nota guardada');
  buzz(10);
}

/* ── meta ── */
function openGoalSheet(g) {
  const pd = takePickDate();
  draftKind = 'goal';
  draft = g ? structuredClone(g) : {
    id: uid('g'), title: '', note: '', color: 'pink',
    target: 0, unit: '', current: 0, due: pd, done: false,
  };
  const isNew = !g;
  $('#goal-sheet-title').textContent = isNew ? 'Nueva meta' : 'Editar meta';
  $('#goal-delete').classList.toggle('hidden', isNew);
  $('#g-title').value = draft.title;
  $('#g-note').value = draft.note || '';
  $('#g-swatches').innerHTML = swatchHTML(COLORS, draft.color, 'color');
  const num = !!draft.target;
  $('#g-opt-num').checked = num;
  $('#g-num-row').classList.toggle('hidden', !num);
  $('#g-unit-row').classList.toggle('hidden', !num);
  $('#g-target').value = draft.target || '';
  $('#g-unit').value = draft.unit || '';
  $('#g-opt-due').checked = !!draft.due;
  $('#g-due-row').classList.toggle('hidden', !draft.due);
  $('#g-due').value = draft.due || S.cycleEnd;
  $('#g-gcal').checked = !!draft.gcalOn;
  syncGcalRow('g', !!draft.due);
  $('#goal-save').disabled = !draft.title;
  openSheet('#sheet-goal');
  if (isNew) setTimeout(() => $('#g-title').focus(), 380);
}

function saveGoal() {
  draft.title = $('#g-title').value.trim();
  draft.note = $('#g-note').value.trim();
  draft.target = $('#g-opt-num').checked ? Math.max(0, Number($('#g-target').value) || 0) : 0;
  draft.unit = draft.target ? $('#g-unit').value.trim() : '';
  draft.current = Math.min(draft.current || 0, draft.target || Infinity);
  draft.due = $('#g-opt-due').checked ? ($('#g-due').value || null) : null;
  draft.gcalOn = !!draft.due && $('#g-gcal').checked;
  const i = S.goals.findIndex(x => x.id === draft.id);
  if (i >= 0) S.goals[i] = draft; else S.goals.push(draft);
  const it = draft;
  save(); closeSheets(); renderProgress();
  if (currentPage() === 'calendar') renderCalendar();
  gcalSync('goal', it);
  toast(i >= 0 ? 'Meta actualizada' : 'Meta creada');
  buzz(10);
}

/* ── plantar árbol ── */
let plantWeek = null, plantSpecies = null;

function openPlantSheet(week) {
  plantWeek = week;
  plantSpecies = null;
  $('#plant-lead').innerHTML =
    `Cerraste completa la semana del <b>${prettyDM(week)}</b> al <b>${prettyDM(addDays(week, 6))}</b>. Elige qué plantar.`;
  $('#species').innerHTML = SPECIES.map(s =>
    `<button class="sp" data-sp="${s.id}">${treeSVG(s.id)}<span>${s.name}</span></button>`).join('');
  $('#btn-plant-confirm').disabled = true;
  openSheet('#sheet-plant');
}

function plantTree() {
  if (!plantWeek || !plantSpecies) return;
  S.trees.push({ id: uid('t'), week: plantWeek, species: plantSpecies, planted: today() });
  save();
  closeSheets();
  renderProgress(); renderToday();
  celebrate('Árbol plantado. Tu jardín crece.');
}

/* ══════════════════════════════════════════════════════
   ALARMAS — nativas en Android, web en el navegador
   ══════════════════════════════════════════════════════ */
function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 2000000000 + 1;
}

const Alarms = {
  native: NATIVE && !!P.LocalNotifications,
  granted: false,

  async init() {
    if (!this.native) return;
    try {
      const p = await P.LocalNotifications.checkPermissions();
      this.granted = p.display === 'granted';
    } catch (e) { this.granted = false; }
  },

  async request(interactive) {
    if (this.native) {
      try {
        const r = await P.LocalNotifications.requestPermissions();
        this.granted = r.display === 'granted';
      } catch (e) {}
      renderSettings();
      if (interactive) toast(this.granted ? 'Alarmas activadas' : 'Permiso no concedido');
      if (this.granted) this.sync();
      return;
    }
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
      renderSettings();
      if (interactive) toast(Notification.permission === 'granted' ? 'Alarmas activadas' : 'Permiso no concedido');
      this.sync();
    } else if (interactive) {
      renderSettings();
      toast(Notification.permission === 'granted' ? 'Ya estaban activadas' : 'Actívalas en los ajustes del navegador');
    }
  },

  _queue: null,
  _lastSig: null,

  sync() {
    if (!this.native) return this.syncWeb();
    /* Se encadenan: dos sincronizaciones a la vez podrían cancelar
       justo lo que la otra acaba de programar. */
    this._queue = (this._queue || Promise.resolve())
      .then(() => this.syncNative())
      .catch(e => console.warn('sync de alarmas', e));
    return this._queue;
  },

  /** Canal de Android según los interruptores de sonido y vibración (los crea MainActivity). */
  channel() {
    if (S.sound && S.vibrate) return 'rutina_alarmas';
    if (S.sound) return 'rutina_sonido';
    if (S.vibrate) return 'rutina_vibracion';
    return 'rutina_silencio';
  },

  /** Arma la lista de avisos que deberían existir ahora mismo. */
  buildList() {
    const list = [];
    const base = { smallIcon: 'ic_stat_icon', channelId: this.channel(), ongoing: false, autoCancel: true };

    for (const r of S.routines) {
      if (!r.alarm || !r.time) continue;
      const [hour, minute] = r.time.split(':').map(Number);
      const body = r.note || 'Es la hora. No lo dejes para después.';
      if (r.repeat === 'daily') {
        list.push({ ...base, id: hashId(r.id), title: r.title, body,
          schedule: { on: { hour, minute }, allowWhileIdle: true, repeats: true } });
      } else {
        for (const wd of (r.days || [])) {
          list.push({ ...base, id: hashId(r.id + ':' + wd), title: r.title, body,
            // en Capacitor el domingo es 1, por eso el +1
            schedule: { on: { weekday: wd + 1, hour, minute }, allowWhileIdle: true, repeats: true } });
        }
      }
    }

    const now = Date.now();
    const oneShot = (item, when, title, body) => {
      const ts = parseYmd(when).setHours(...item.time.split(':').map(Number), 0, 0);
      if (ts > now) list.push({ ...base, id: hashId(item.id), title, body,
        schedule: { at: new Date(ts), allowWhileIdle: true } });
    };
    for (const e of S.extras) if (e.alarm && e.time && !e.done) oneShot(e, e.date, e.title, e.note || 'Lo tenías pendiente.');
    for (const h of S.homework) if (h.alarm && h.time && h.due && !h.done) oneShot(h, h.due, h.title, h.subject || 'Tarea por entregar.');
    return list;
  },

  /* Android: AlarmManager vía Capacitor. Suenan con la app cerrada. */
  async syncNative() {
    const ln = P.LocalNotifications; if (!ln || !this.granted) return;
    try {
      const list = this.buildList();
      const sig = JSON.stringify(list);
      if (sig === this._lastSig) return;      // nada cambió: no tocamos el sistema
      this._lastSig = sig;

      const pend = await ln.getPending();
      if (pend.notifications?.length) await ln.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
      if (list.length) await ln.schedule({ notifications: list });
    } catch (e) {
      this._lastSig = null;                   // que el próximo intento vuelva a probar
      console.warn('No se pudieron programar las alarmas', e);
    }
  },

  /* Navegador: temporizadores mientras la app viva. */
  syncWeb() {
    timers.forEach(clearTimeout);
    timers = [];
    const d = today(), now = new Date();
    const arm = (item, title) => {
      if (!item.alarm || !item.time) return;
      if (S.fired[`${item.id}|${d}`]) return;
      const [h, m] = item.time.split(':').map(Number);
      const delay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0) - now;
      if (delay > 0 && delay < 26 * 3600 * 1000) timers.push(setTimeout(() => fireWeb(item, title), delay));
    };
    for (const r of routinesFor(d)) if (!isDone(r.id, d) && !isFailed(r.id, d)) arm(r, r.title);
    for (const e of S.extras) if (e.date === d && !e.done) arm(e, e.title);
    for (const h of S.homework) if (h.due === d && !h.done) arm(h, h.title);
  },
};

const hasAlarms = () => S.routines.some(r => r.alarm) || S.extras.some(e => e.alarm && !e.done) || S.homework.some(h => h.alarm && !h.done);

function chime() {
  if (!S.sound) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, .28, .56].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = [880, 1108, 1318][i];
      g.gain.setValueAtTime(0, ctx.currentTime + t);
      g.gain.linearRampToValueAtTime(.28, ctx.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + t + .24);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .26);
    });
    setTimeout(() => ctx.close(), 1400);
  } catch (e) {}
}

function fireWeb(item, title) {
  const key = `${item.id}|${today()}`;
  if (S.fired[key]) return;
  S.fired[key] = true; save();
  chime(); buzz([220, 110, 220, 110, 320]);
  const opts = {
    body: item.note || 'Es la hora. No lo dejes para después.',
    tag: item.id, renotify: true, requireInteraction: true,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [220, 110, 220],
  };
  try {
    if (navigator.serviceWorker?.ready) navigator.serviceWorker.ready.then(r => r.showNotification(title, opts)).catch(() => {});
    else if ('Notification' in window && Notification.permission === 'granted') new Notification(title, opts);
  } catch (e) {}
  if (document.visibilityState === 'visible') toast('⏰ ' + title);
  renderToday();
}

function pruneFired() {
  const cut = addDays(today(), -3);
  let ch = false;
  for (const k of Object.keys(S.fired)) if (k.split('|')[1] < cut) { delete S.fired[k]; ch = true; }
  if (ch) save();
}

/* ══════════════════════════════════════════════════════
   COPIA DE SEGURIDAD
   ══════════════════════════════════════════════════════ */
async function exportData() {
  const texto = JSON.stringify(S, null, 2);
  const nombre = `rutina-${today()}.json`;
  if (P.Sistema) {
    // Android: el selector de archivos del sistema (Descargas, Drive, etc.)
    try {
      const r = await P.Sistema.guardar({ nombre, texto, tipo: 'application/json' });
      toast(r.guardado ? 'Copia guardada' : 'No se guardó la copia');
    } catch (e) { toast('No se pudo guardar la copia'); }
    return;
  }
  const blob = new Blob([texto], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Copia descargada');
}

const RX_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RX_TIME = /^\d{2}:\d{2}$/;
const RX_ID = /^[\w:.-]{1,80}$/;

/** Revisa una copia antes de usarla: fechas, horas, ids y colores tienen que tener su forma. */
function cleanImport(data) {
  const s = Array.isArray(data.routines) ? hydrate(data) : migrateV1(data);
  const arr = v => (Array.isArray(v) ? v : []);
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  const date = v => (typeof v === 'string' && RX_DATE.test(v) ? v : null);
  const time = v => (typeof v === 'string' && RX_TIME.test(v) ? v : null);
  const okId = v => typeof v === 'string' && RX_ID.test(v);
  const color = v => (COLORS.some(c => c.id === v) ? v : 'blue');
  const prio = v => ([1, 0, -1].includes(v) ? v : 0);
  const days = v => arr(v).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
  const gid = v => (v == null ? null : str(v, 40));
  const idMap = m => {
    const out = {};
    if (m && typeof m === 'object') for (const k of Object.keys(m)) if (RX_DATE.test(k)) {
      const ids = arr(m[k]).filter(okId);
      if (ids.length) out[k] = ids;
    }
    return out;
  };

  s.theme = ['light', 'dark', 'system'].includes(s.theme) ? s.theme : 'system';
  s.accent = ACCENTS.some(a => a.id === s.accent) ? s.accent : 'blue';
  s.cycleStart = date(s.cycleStart) || DEFAULTS.cycleStart;
  s.cycleEnd = date(s.cycleEnd) || DEFAULTS.cycleEnd;
  s.studyGoalMin = Math.max(0, Math.min(720, Number(s.studyGoalMin) || 0));
  s.studyGoals = arr(s.studyGoals).filter(g => g && typeof g.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.from))
    .map(g => ({ from: g.from, min: Math.max(0, Math.min(720, Number(g.min) || 0)) }));
  s.segments = arr(s.segments).filter(x => x && okId(x.id)).map(x => ({ id: x.id, name: str(x.name, 30), color: color(x.color) }));
  s.routines = arr(s.routines).filter(x => x && okId(x.id)).map(x => ({
    id: x.id, segmentId: okId(x.segmentId) ? x.segmentId : null,
    title: str(x.title, 60), note: str(x.note, 240), color: color(x.color),
    repeat: x.repeat === 'weekly' ? 'weekly' : 'daily', days: days(x.days),
    sched: arr(x.sched).filter(z => z && date(z.from)).map(z => ({ from: z.from, repeat: z.repeat === 'weekly' ? 'weekly' : 'daily', days: days(z.days) })),
    time: time(x.time), alarm: !!x.alarm && !!time(x.time), start: date(x.start) || today(), prio: prio(x.prio),
  }));
  s.extras = arr(s.extras).filter(x => x && okId(x.id)).map(x => ({
    id: x.id, title: str(x.title, 60), note: str(x.note, 240), color: color(x.color),
    date: date(x.date) || today(), time: time(x.time), alarm: !!x.alarm && !!time(x.time), done: !!x.done, prio: prio(x.prio),
    fromCal: gid(x.fromCal),
  }));
  s.homework = arr(s.homework).filter(x => x && okId(x.id)).map(x => ({
    id: x.id, title: str(x.title, 70), subject: str(x.subject, 40), note: str(x.note, 240), color: color(x.color),
    due: date(x.due), time: date(x.due) ? time(x.time) : null, alarm: !!x.alarm && !!time(x.time), done: !!x.done,
    doneOn: date(x.doneOn), prio: prio(x.prio), mins: Math.max(0, Math.min(1440, Number(x.mins) || 0)),
    gcalOn: !!x.gcalOn, gcal: gid(x.gcal),
  }));
  s.examSegments = arr(s.examSegments).filter(x => x && okId(x.id)).map(x => ({
    id: x.id, name: str(x.name, 50), color: color(x.color), date: date(x.date),
    topics: arr(x.topics).filter(t => t && okId(t.id)).map(t => ({ id: t.id, title: str(t.title, 80), done: !!t.done })),
    gcalOn: !!x.gcalOn, gcal: gid(x.gcal),
  }));
  s.goals = arr(s.goals).filter(x => x && okId(x.id)).map(x => ({
    id: x.id, title: str(x.title, 70), note: str(x.note, 300), color: color(x.color),
    target: Math.max(0, Number(x.target) || 0), unit: str(x.unit, 16), current: Math.max(0, Number(x.current) || 0),
    due: date(x.due), done: !!x.done, gcalOn: !!x.gcalOn, gcal: gid(x.gcal), fromCal: gid(x.fromCal),
  }));
  s.notes = arr(s.notes).filter(x => x && okId(x.id)).map(x => ({ id: x.id, text: str(x.text, 1000), color: color(x.color), created: date(x.created) || today() }));
  s.trees = arr(s.trees).filter(x => x && okId(x.id) && date(x.week)).map(x => ({
    id: x.id, week: x.week, species: SPECIES.some(sp => sp.id === x.species) ? x.species : 'roble', planted: date(x.planted) || x.week }));
  const sl = {};
  if (s.studyLog && typeof s.studyLog === 'object') for (const k of Object.keys(s.studyLog)) {
    const v = Number(s.studyLog[k]);
    if (RX_DATE.test(k) && v > 0) sl[k] = Math.min(1440, Math.round(v));
  }
  s.studyLog = sl;
  s.log = idMap(s.log);
  s.fail = idMap(s.fail);
  s.fired = {};
  s.cal.hidden = arr(s.cal.hidden).map(v => str(v, 40));
  s.cal.target = s.cal.target == null ? null : str(s.cal.target, 40);
  return s;
}

function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      const ok = data && (Array.isArray(data.routines) || Array.isArray(data.tasks));
      if (!ok) throw new Error('formato');
      if (!confirm('Esto reemplazará todos tus datos actuales. ¿Continuar?')) return;
      S = cleanImport(data);
      save(); applyTheme(); sel = today(); renderAll(); Alarms.sync();
      toast('Datos restaurados');
    } catch (e) { toast('Archivo no válido'); }
  };
  r.readAsText(file);
}

/* ══════════════════════════════════════════════════════
   NAVEGACIÓN Y EVENTOS
   ══════════════════════════════════════════════════════ */
function goto(page) {
  $$('.page').forEach(p => p.classList.toggle('is-active', p.id === 'page-' + page));
  $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.page === page));
  if (page === 'progress') renderProgress();
  if (page === 'settings') renderSettings();
  if (page === 'routine') renderRoutine();
  if (page === 'study') renderStudy();
  if (page === 'calendar') renderCalendar();
  buzz(6);
}

function renderAll() {
  renderToday(); renderRoutine(); renderStudy(); renderProgress(); renderSettings();
  if (currentPage() === 'calendar') renderCalendar();
}

function currentPage() { return ($('.page.is-active') || {}).id?.replace('page-', '') || 'today'; }

/** Mueve un hábito dentro de su segmento. */
function moveRoutine(id, dir) {
  const r = S.routines.find(x => x.id === id);
  const family = S.routines.filter(x => x.segmentId === r.segmentId);
  const i = family.indexOf(r);
  const target = family[i + dir];
  if (!target) return;
  const a = S.routines.indexOf(r), b = S.routines.indexOf(target);
  S.routines.splice(a, 1);
  S.routines.splice(b, 0, r);
  save(); renderToday(); renderRoutine(); buzz(8);
}

function moveSegment(id, dir) {
  const i = S.segments.findIndex(s => s.id === id);
  const j = i + dir;
  if (j < 0 || j >= S.segments.length) return;
  [S.segments[i], S.segments[j]] = [S.segments[j], S.segments[i]];
  save(); renderToday(); renderRoutine(); buzz(8);
}

function deleteRoutine(id) {
  S.routines = S.routines.filter(r => r.id !== id);
  forgetRoutines(new Set([id]));
  save(); renderAll(); Alarms.sync();
  toast('Hábito eliminado');
}

function bind() {
  $$('.tab').forEach(b => b.addEventListener('click', () => goto(b.dataset.page)));

  /* ── botón + contextual ── */
  $('#fab').addEventListener('click', () => {
    const p = currentPage();
    pickDate = null;
    if (p === 'routine') return openRoutineSheet(null);
    if (p === 'study') {
      if (studyView === 'exams') return openExamSheet(null);
      if (studyView === 'homework') return openHwSheet(null);
      return openNoteSheet(null);
    }
    if (p === 'progress' && progressView === 'goals') return openGoalSheet(null);
    if (p === 'calendar') pickDate = calSel;
    openSheet('#sheet-pick');
  });
  $('#sheet-pick').addEventListener('click', e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const k = b.dataset.pick;
    const pd = pickDate;
    closeSheets();
    setTimeout(() => {
      pickDate = pd;
      if (k === 'routine') openRoutineSheet(null);
      else if (k === 'extra') openExtraSheet(null);
      else if (k === 'hw') openHwSheet(null);
      else if (k === 'exam') openExamSheet(null);
      else if (k === 'goal') openGoalSheet(null);
      else openNoteSheet(null);
    }, 220);
  });

  /* ── nota rápida, desde cualquier lado ── */
  $('#btn-quick-note').addEventListener('click', () => openNoteSheet(null));
  $('#empty-add-note').addEventListener('click', () => openNoteSheet(null));
  $('#n-text').addEventListener('input', e => { $('#note-save').disabled = !e.target.value.trim(); });
  $('#note-save').addEventListener('click', saveNote);
  $('#note-delete').addEventListener('click', () => {
    if (!confirm('¿Eliminar esta nota?')) return;
    S.notes = S.notes.filter(x => x.id !== draft.id);
    save(); closeSheets(); renderStudy(); toast('Nota eliminada');
  });
  $('#n-swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    draft.color = b.dataset.color;
    $$('#n-swatches .sw').forEach(x => x.classList.toggle('on', x === b)); buzz(6);
  });

  /* ── metas ── */
  $('#btn-add-goal').addEventListener('click', () => openGoalSheet(null));
  $('#empty-add-goal').addEventListener('click', () => openGoalSheet(null));
  $('#g-title').addEventListener('input', e => { $('#goal-save').disabled = !e.target.value.trim(); });
  $('#goal-save').addEventListener('click', saveGoal);
  $('#goal-delete').addEventListener('click', () => {
    if (!confirm(`¿Eliminar la meta "${draft.title}"?`)) return;
    const g = S.goals.find(x => x.id === draft.id);
    S.goals = S.goals.filter(x => x.id !== draft.id);
    gcalRemove(g);
    save(); closeSheets(); renderProgress(); toast('Meta eliminada');
    if (currentPage() === 'calendar') renderCalendar();
  });
  $('#g-swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    draft.color = b.dataset.color;
    $$('#g-swatches .sw').forEach(x => x.classList.toggle('on', x === b)); buzz(6);
  });
  $('#g-opt-num').addEventListener('change', e => {
    $('#g-num-row').classList.toggle('hidden', !e.target.checked);
    $('#g-unit-row').classList.toggle('hidden', !e.target.checked);
  });
  $('#g-opt-due').addEventListener('change', e => {
    $('#g-due-row').classList.toggle('hidden', !e.target.checked);
    syncGcalRow('g', e.target.checked);
  });
  $('#g-gcal').addEventListener('change', e => gcalSwitchOn(e.target, 'g'));

  /* ── prioridad en las tres hojas ── */
  bindPrio('#r-prio'); bindPrio('#e-prio'); bindPrio('#h-prio');

  /* ── horas estimadas de una tarea ── */
  const hwHours = d => {
    draft.mins = Math.max(0, Math.min(24 * 60, (draft.mins || 0) + d));
    $('#h-hours-val').textContent = draft.mins ? fmtMins(draft.mins) : 'Sin definir';
    buzz(6);
  };
  $('#h-hours-minus').addEventListener('click', () => hwHours(-30));
  $('#h-hours-plus').addEventListener('click', () => hwHours(30));

  /* ── horas de estudio (pestaña Estudio) ── */
  $('#study-card').addEventListener('click', e => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    addStudy(studyDay, Number(b.dataset.add));
    save(); renderStudyCard(); renderWeekStrip(); buzz(10);
    if (progressView === 'summary') renderSummary();
  });
  $('#study-prev').addEventListener('click', () => { studyDay = addDays(studyDay, -1); renderStudyCard(); buzz(6); });
  $('#study-next').addEventListener('click', () => {
    if (studyDay >= today()) return;
    studyDay = addDays(studyDay, 1); renderStudyCard(); buzz(6);
  });

  /* ── jardín ── */
  $('#btn-plant').addEventListener('click', e => openPlantSheet(e.currentTarget.dataset.week));
  $('#species').addEventListener('click', e => {
    const b = e.target.closest('[data-sp]'); if (!b) return;
    plantSpecies = b.dataset.sp;
    $$('#species .sp').forEach(x => x.classList.toggle('on', x === b));
    $('#btn-plant-confirm').disabled = false;
    buzz(8);
  });
  $('#btn-plant-confirm').addEventListener('click', plantTree);

  /* ── sub-vistas ── */
  $('#seg-progress').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    progressView = b.dataset.view; renderProgress(); buzz(6);
  });

  $('#btn-add-segment').addEventListener('click', () => openSegmentSheet(null));
  $('#empty-add-segment').addEventListener('click', () => openSegmentSheet(null));
  $('#empty-add').addEventListener('click', () => goto('routine'));
  $('#empty-add-exam').addEventListener('click', () => openExamSheet(null));
  $('#empty-add-hw').addEventListener('click', () => openHwSheet(null));
  $('#btn-add-study').addEventListener('click', () => {
    if (studyView === 'exams') openExamSheet(null);
    else if (studyView === 'homework') openHwSheet(null);
    else openNoteSheet(null);
  });

  /* ── navegación de días ── */
  $('#wk-prev').addEventListener('click', () => { sel = addDays(sel, -7); renderToday(); buzz(6); });
  $('#wk-next').addEventListener('click', () => { sel = addDays(sel, 7); renderToday(); buzz(6); });
  $('#wk-days').addEventListener('click', e => {
    const b = e.target.closest('[data-day]'); if (!b) return;
    sel = b.dataset.day; renderToday(); buzz(8);
  });
  $('#btn-back-today').addEventListener('click', () => { sel = today(); renderToday(); buzz(8); });

  $('#btn-edit-mode').addEventListener('click', e => {
    editing = !editing;
    document.querySelector('.app').classList.toggle('editing', editing);
    e.target.textContent = editing ? 'Listo' : 'Editar';
    e.target.classList.toggle('on', editing);
    renderToday();
  });

  bindSwipe();

  /* ── calendario ── */
  $('#cal-prev').addEventListener('click', () => {
    const d = parseYmd(calMonth); d.setMonth(d.getMonth() - 1); calMonth = ymd(d); renderCalendar(); buzz(6);
  });
  $('#cal-next').addEventListener('click', () => {
    const d = parseYmd(calMonth); d.setMonth(d.getMonth() + 1); calMonth = ymd(d); renderCalendar(); buzz(6);
  });
  $('#cal-today').addEventListener('click', () => { calSel = today(); calMonth = calSel.slice(0, 8) + '01'; renderCalendar(); buzz(8); });
  $('#cal-grid').addEventListener('click', e => {
    const b = e.target.closest('[data-cal]'); if (!b) return;
    calSel = b.dataset.cal;
    if (calSel.slice(0, 7) !== calMonth.slice(0, 7)) calMonth = calSel.slice(0, 8) + '01';
    renderCalendar(); buzz(6);
  });
  $('#cal-connect-btn').addEventListener('click', () => {
    if (Cal.denied && P.Sistema) P.Sistema.abrirAjustesApp().catch(() => {});
    else Cal.connect();
  });
  $('#cal-settings').addEventListener('click', openCalSettings);
  $('#ev-open').addEventListener('click', () => {
    if (!curEvent || !P.Calendario) return;
    P.Calendario.openEvent({ id: String(curEvent.id), begin: curEvent.begin, end: curEvent.end })
      .catch(() => toast('No encontré una app de calendario'));
  });
  $('#ev-to-extra').addEventListener('click', () => eventToRutina('extra'));
  $('#ev-to-goal').addEventListener('click', () => eventToRutina('goal'));
  $('#sheet-calset').addEventListener('click', e => {
    if (e.target.closest('#cs-connect')) { closeSheets(); Cal.connect(); return; }
    const b = e.target.closest('[data-target]'); if (!b) return;
    S.cal.target = b.dataset.target; save();
    $$('#cs-target .chip').forEach(x => x.classList.toggle('on', x === b)); buzz(6);
  });
  $('#sheet-calset').addEventListener('change', e => {
    const sw = e.target;
    if (sw.dataset.calid) {
      const id = sw.dataset.calid;
      S.cal.hidden = sw.checked ? S.cal.hidden.filter(x => x !== id) : [...S.cal.hidden, id];
      Cal.cache.clear();
    } else if (sw.dataset.show) {
      S.cal.show[sw.dataset.show] = sw.checked;
    } else return;
    save(); renderCalendar(); buzz(6);
  });

  /* ── acciones sobre listas ── */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (Date.now() - swipeClickBlock < 400) return;    // el toque que cierra un deslizamiento
    const { act, id } = b.dataset;

    if (act === 'r-toggle') {
      if (!canToggle(sel)) { toast('Ese día todavía no llega'); return; }
      const on = !isDone(id, sel);
      setDone(id, sel, on); save(); buzz(on ? 14 : 8);
      /* Marcamos la fila en su sitio en vez de redibujar la lista:
         así se ve la animación de la palomita. */
      afterMark(b.closest('.swipe'), id);
    }
    else if (act === 'r-open')   { if (!editing) openRoutineSheet(S.routines.find(x => x.id === id)); }
    else if (act === 'r-up')     moveRoutine(id, -1);
    else if (act === 'r-down')   moveRoutine(id, 1);
    else if (act === 'r-del')    {
      const r = S.routines.find(x => x.id === id);
      if (confirm(`¿Eliminar "${r.title}"? También se borra su historial.`)) deleteRoutine(id);
    }
    else if (act === 's-edit')   openSegmentSheet(S.segments.find(x => x.id === id));
    else if (act === 's-up')     moveSegment(id, -1);
    else if (act === 's-down')   moveSegment(id, 1);

    else if (act === 'e-toggle') {
      const x = S.extras.find(v => v.id === id);
      x.done = !x.done; save(); buzz(x.done ? 14 : 8);
      // un imprevisto vencido, al cumplirse, desaparece de la lista: ahí sí hay que redibujar
      if (extrasFor(sel).some(e2 => e2.id === id)) {
        b.closest('.item').classList.toggle('done', x.done);
        settleToday();
      } else renderToday();
      Alarms.sync();
    }
    else if (act === 'e-open')   openExtraSheet(S.extras.find(x => x.id === id));

    else if (act === 'h-toggle') {
      const x = S.homework.find(v => v.id === id);
      x.done = !x.done;
      x.doneOn = x.done ? today() : null;
      save(); buzz(x.done ? 14 : 8); renderToday(); renderStudy(); Alarms.sync();
    }
    else if (act === 'h-open')   openHwSheet(S.homework.find(x => x.id === id));

    else if (act === 'n-open')   openNoteSheet(S.notes.find(x => x.id === id));

    else if (act === 'g-open')   openGoalSheet(S.goals.find(x => x.id === id));
    else if (act === 'g-toggle') {
      const g = S.goals.find(v => v.id === id);
      g.done = !g.done;
      if (g.target) {
        // cumplida = al tope; al desmarcarla vuelve a donde estaba
        if (g.done) { g.before = g.current || 0; g.current = g.target; }
        else { g.current = g.before != null && g.before < g.target ? g.before : Math.max(0, g.target - 1); delete g.before; }
      }
      save(); buzz(g.done ? 14 : 8); renderProgress();
      if (g.done) celebrate('Meta cumplida. Bien hecho.');
    }
    else if (act === 'g-plus' || act === 'g-minus') {
      const g = S.goals.find(v => v.id === id);
      g.current = Math.max(0, Math.min(g.target, (g.current || 0) + (act === 'g-plus' ? 1 : -1)));
      if (g.current >= g.target) { g.done = true; g.before = g.target - 1; celebrate('Meta cumplida. Bien hecho.'); }
      save(); buzz(8); renderProgress();
    }

    else if (act === 'x-open')   openExamSheet(S.examSegments.find(x => x.id === id));
    else if (act === 'x-toggle') {
      const t = draft.topics.find(v => v.id === id);
      t.done = !t.done; commitExam(); buzz(t.done ? 14 : 8);
      b.closest('.topic').classList.toggle('done', t.done);   // sin redibujar: se ve la palomita
      updateTopicCount();
    }
    else if (act === 'x-deltopic') {
      draft.topics = draft.topics.filter(v => v.id !== id);
      commitExam(); renderTopics(); buzz(8);
    }

    else if (act === 'ev-open')  openEventSheet(id, b.dataset.begin);
  });

  /* ── hoja: hábito ── */
  $$('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
  $('#backdrop').addEventListener('click', closeSheets);

  $('#r-title').addEventListener('input', syncRoutineSave);
  $('#routine-save').addEventListener('click', saveRoutine);
  $('#routine-delete').addEventListener('click', () => {
    if (confirm(`¿Eliminar "${draft.title}"? También se borra su historial.`)) {
      const id = draft.id; closeSheets(); deleteRoutine(id);
    }
  });
  $('#r-swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    draft.color = b.dataset.color;
    $$('#r-swatches .sw').forEach(x => x.classList.toggle('on', x === b)); buzz(6);
  });
  $('#r-segments').addEventListener('click', e => {
    const b = e.target.closest('[data-seg]'); if (!b) return;
    draft.segmentId = b.dataset.seg;
    $$('#r-segments .chip').forEach(x => x.classList.toggle('on', x === b)); buzz(6);
  });
  $('#r-repeat').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    draft.repeat = b.dataset.repeat;
    $$('#r-repeat .seg-btn').forEach(x => x.classList.toggle('is-on', x === b));
    $('#r-days-row').classList.toggle('hidden', draft.repeat !== 'weekly');
    if (draft.repeat === 'weekly' && !(draft.days || []).length) {
      draft.days = [weekdayOf(today())];
      $$('#r-days .day').forEach(x => x.classList.toggle('on', draft.days.includes(Number(x.dataset.day))));
    }
    syncRoutineSave(); buzz(6);
  });
  $('#r-days').addEventListener('click', e => {
    const b = e.target.closest('.day'); if (!b) return;
    const i = Number(b.dataset.day);
    draft.days = (draft.days || []).includes(i) ? draft.days.filter(x => x !== i) : [...(draft.days || []), i];
    b.classList.toggle('on'); syncRoutineSave(); buzz(6);
  });
  $('#r-opt-time').addEventListener('change', e => {
    $('#r-time-row').classList.toggle('hidden', !e.target.checked); syncAlarmRow('r');
  });
  $('#r-alarm').addEventListener('change', e => { if (e.target.checked) Alarms.request(false); });

  /* ── hoja: imprevisto ── */
  $('#e-title').addEventListener('input', e => { $('#extra-save').disabled = !e.target.value.trim(); });
  $('#extra-save').addEventListener('click', saveExtra);
  $('#extra-delete').addEventListener('click', () => {
    if (!confirm(`¿Eliminar "${draft.title}"?`)) return;
    S.extras = S.extras.filter(x => x.id !== draft.id);
    save(); closeSheets(); renderAll(); Alarms.sync(); toast('Eliminado');
  });
  $('#e-swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    draft.color = b.dataset.color;
    $$('#e-swatches .sw').forEach(x => x.classList.toggle('on', x === b)); buzz(6);
  });
  $('#e-opt-time').addEventListener('change', e => {
    $('#e-time-row').classList.toggle('hidden', !e.target.checked); syncAlarmRow('e');
  });
  $('#e-alarm').addEventListener('change', e => { if (e.target.checked) Alarms.request(false); });

  /* ── hoja: segmento ── */
  $('#s-name').addEventListener('input', e => { $('#segment-save').disabled = !e.target.value.trim(); });
  $('#segment-save').addEventListener('click', saveSegment);
  $('#segment-delete').addEventListener('click', () => deleteSegment(draft.id));
  $('#s-swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    draft.color = b.dataset.color;
    $$('#s-swatches .sw').forEach(x => x.classList.toggle('on', x === b)); buzz(6);
  });

  /* ── hoja: examen (guarda al instante) ── */
  $('#x-name').addEventListener('input', e => { draft.name = e.target.value; commitExam(); });
  $('#x-date').addEventListener('change', e => {
    draft.date = e.target.value || null;
    if (!draft.date) draft.gcalOn = false;
    commitExam(); syncGcalRow('x', !!draft.date);
  });
  $('#x-gcal').addEventListener('change', async e => {
    const x = draft;
    if (!(await gcalSwitchOn(e.target, 'x'))) return;
    x.gcalOn = e.target.checked; save();
    gcalSync('exam', x);
  });
  $('#x-swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    draft.color = b.dataset.color;
    $$('#x-swatches .sw').forEach(x => x.classList.toggle('on', x === b));
    commitExam(); renderTopics(); buzz(6);
  });
  $('#exam-save').addEventListener('click', closeSheets);
  $('#exam-delete').addEventListener('click', () => {
    if (!confirm(`¿Eliminar "${draft.name || 'este segmento'}" y todos sus temas?`)) return;
    const x = draft;
    S.examSegments = S.examSegments.filter(v => v.id !== x.id);
    gcalRemove(x);
    draft = null; draftKind = null;
    save(); closeSheets(); renderStudy(); toast('Segmento eliminado');
    if (currentPage() === 'calendar') renderCalendar();
  });
  const addTopic = () => {
    const v = $('#x-new-topic').value.trim();
    if (!v) return;
    draft.topics.push({ id: uid('t'), title: v, done: false });
    $('#x-new-topic').value = '';
    commitExam(); renderTopics(); buzz(8);
    $('#x-new-topic').focus();
  };
  $('#x-add-topic').addEventListener('click', addTopic);
  $('#x-new-topic').addEventListener('input', () => { $('#x-add-topic').disabled = !$('#x-new-topic').value.trim(); });
  $('#x-new-topic').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTopic(); } });

  /* ── hoja: tarea ── */
  $('#h-title').addEventListener('input', e => { $('#hw-save').disabled = !e.target.value.trim(); });
  $('#hw-save').addEventListener('click', saveHw);
  $('#hw-delete').addEventListener('click', () => {
    if (!confirm(`¿Eliminar "${draft.title}"?`)) return;
    const h = S.homework.find(x => x.id === draft.id);
    S.homework = S.homework.filter(x => x.id !== draft.id);
    gcalRemove(h);
    save(); closeSheets(); renderAll(); Alarms.sync(); toast('Tarea eliminada');
  });
  $('#h-swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    draft.color = b.dataset.color;
    $$('#h-swatches .sw').forEach(x => x.classList.toggle('on', x === b)); buzz(6);
  });
  $('#h-opt-date').addEventListener('change', e => {
    $('#h-date-row').classList.toggle('hidden', !e.target.checked); syncHwRows();
  });
  $('#h-opt-time').addEventListener('change', e => {
    $('#h-time-row').classList.toggle('hidden', !e.target.checked); syncAlarmRow('h');
  });
  $('#h-alarm').addEventListener('change', e => { if (e.target.checked) Alarms.request(false); });
  $('#h-gcal').addEventListener('change', e => gcalSwitchOn(e.target, 'h'));

  /* ── estudio: cambiar vista ── */
  $('#seg-study').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    studyView = b.dataset.view; renderStudy(); buzz(6);
  });

  /* ── progreso ── */
  $('#seg-range').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    range = Number(b.dataset.range);
    $$('#seg-range .seg-btn').forEach(x => x.classList.toggle('is-on', x === b));
    renderProgress();
  });
  $('#btn-edit-cycle').addEventListener('click', () => { goto('settings'); setTimeout(() => $('#f-cycle-end').focus(), 300); });

  /* ── reporte para una IA ── */
  $('#rep-kind').addEventListener('click', e => {
    const b = e.target.closest('[data-kind]'); if (!b) return;
    repKind = b.dataset.kind; repAnchor = today(); renderReport(); buzz(6);
  });
  $('#rep-prev').addEventListener('click', () => { repAnchor = shiftPeriod(repKind, repAnchor, -1); renderReport(); buzz(6); });
  $('#rep-next').addEventListener('click', () => {
    const next = shiftPeriod(repKind, repAnchor, 1);
    if (periodRange(repKind, next)[0] > today()) return;
    repAnchor = next; renderReport(); buzz(6);
  });
  $('#rep-copy').addEventListener('click', async () => {
    const txt = await buildReport(repKind, repAnchor);
    const ok = await copyText(txt);
    buzz(ok ? 12 : [30, 40, 30]);
    toast(ok ? 'Copiado. Pégalo en tu IA y listo.' : 'No se pudo copiar. Usa "Compartir…"');
  });
  $('#rep-share').addEventListener('click', async () => {
    const txt = await buildReport(repKind, repAnchor);
    const titulo = `Rutina · ${periodLabel(repKind, repAnchor)}`;
    try {
      if (P.Sistema) await P.Sistema.compartir({ titulo, texto: txt });
      else if (navigator.share) await navigator.share({ title: titulo, text: txt });
      else toast((await copyText(txt)) ? 'Copiado' : 'No se pudo compartir');
    } catch (e) {}
  });
  $('#rep-preview').addEventListener('click', e => {
    const pre = $('#rep-pre');
    pre.classList.toggle('hidden');
    e.target.textContent = pre.classList.contains('hidden') ? 'Ver qué se copia' : 'Ocultar';
    if (!pre.classList.contains('hidden')) previewReport();
  });

  /* ── ajustes ── */
  $('#seg-theme').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    S.theme = b.dataset.theme; save(); applyTheme(); buzz(6);
  });
  $('#accent-swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-accent]'); if (!b) return;
    S.accent = b.dataset.accent; save(); applyTheme(); renderSettings(); buzz(8);
  });
  $('#opt-sound').addEventListener('change', e => { S.sound = e.target.checked; save(); Alarms.sync(); if (S.sound) chime(); });
  $('#opt-vibrate').addEventListener('change', e => { S.vibrate = e.target.checked; save(); Alarms.sync(); buzz(20); });
  $('#row-notif').addEventListener('click', () => Alarms.request(true));
  const setStudyGoal = d => {
    const t = today();
    S.studyGoalMin = Math.max(0, Math.min(12 * 60, S.studyGoalMin + d));
    // la meta nueva rige desde hoy; los días pasados conservan la suya
    S.studyGoals = [...S.studyGoals.filter(g => g.from < t), { from: t, min: S.studyGoalMin }];
    save(); renderSettings(); renderStudyCard(); buzz(6);
  };
  $('#study-minus').addEventListener('click', () => setStudyGoal(-30));
  $('#study-plus').addEventListener('click', () => setStudyGoal(30));

  $('#f-cycle-start').addEventListener('change', e => {
    if (!e.target.value || e.target.value >= S.cycleEnd) { e.target.value = S.cycleStart; toast('El inicio tiene que ser antes del final'); return; }
    S.cycleStart = e.target.value; save(); renderAll();
  });
  $('#f-cycle-end').addEventListener('change', e => {
    if (!e.target.value || e.target.value <= S.cycleStart) { e.target.value = S.cycleEnd; toast('El final tiene que ser después del inicio'); return; }
    S.cycleEnd = e.target.value; save(); renderAll();
  });

  $('#row-export').addEventListener('click', exportData);
  $('#row-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  $('#row-reset').addEventListener('click', () => {
    if (!confirm('Se borrará tu rutina, tus exámenes, tus tareas y todo tu historial. ¿Seguro?')) return;
    if (!confirm('Última confirmación: ¿borrar todo?')) return;
    S = structuredClone(DEFAULTS);   // conserva las fechas del ciclo por defecto
    save(); applyTheme(); sel = today(); renderAll(); Alarms.sync(); toast('Todo borrado');
  });

  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });
  // botón atrás de Android: primero cierra la hoja, luego vuelve a Hoy, y recién ahí sale
  if (P.App) {
    P.App.addListener('backButton', () => {
      if ($('.sheet.on')) closeSheets();
      else if (currentPage() !== 'today') goto('today');
      else P.App.minimizeApp().catch(() => {});
    });
  }
  // si el teléfono cambia solo entre claro y oscuro, la barra de estado lo sigue
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.theme === 'system') applyStatusBar(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    tick(true);
    // al volver de Google Calendar puede haber eventos nuevos
    Cal.cache.clear();
    if (currentPage() === 'calendar') renderCalendar(true);
  });
  window.addEventListener('resize', () => { if (currentPage() === 'progress') renderCoaster(cycleInfo()); });
}

/* ══════════════════════════════════════════════════════
   RELOJ
   ══════════════════════════════════════════════════════ */
let lastDay = today();
function tick(force) {
  const d = today();
  if (d !== lastDay) {
    const ayer = lastDay;
    lastDay = d;
    confettiFor = null;
    if (sel < d) sel = d;
    if (studyDay === ayer) studyDay = d;
    pruneFired(); renderAll(); Alarms.sync();
    return;
  }
  if (force) { renderToday(); Alarms.sync(); }
  else if (document.visibilityState === 'visible') renderToday();
}

/* ══════════════════════════════════════════════════════
   ARRANQUE
   ══════════════════════════════════════════════════════ */
async function init() {
  sel = today();
  studyDay = today();
  repAnchor = today();
  if (!S.cycleStart) { S.cycleStart = '2026-08-24'; save(); }
  applyTheme();
  bind();
  pruneFired();
  await Promise.all([Alarms.init(), Cal.init()]);
  renderAll();
  Alarms.sync();
  // si ya tienes alarmas y Android todavía no dio permiso, se pide una vez
  if (Alarms.native && !Alarms.granted && hasAlarms() && !S.tips.notifAsked) {
    S.tips.notifAsked = true; save();
    Alarms.request(false);
  }
  setInterval(tick, 30000);

  if ('serviceWorker' in navigator && !NATIVE && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
})();
