// Logger estructurado (JSON por línea) para poder enviar a un agregador de
// logs (Railway, Datadog, etc.) en vez de texto suelto por console.log.
const ORDEN = { debug: 10, info: 20, warn: 30, error: 40 };
const nivelMinimo = ORDEN[process.env.LOG_LEVEL] ? process.env.LOG_LEVEL : 'info';

function serializar(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  try { return JSON.stringify(arg); } catch { return String(arg); }
}

function escribir(level, args) {
  if (ORDEN[level] < ORDEN[nivelMinimo]) return;
  const linea = {
    level,
    time: new Date().toISOString(),
    msg: args.map(serializar).join(' '),
  };
  const out = JSON.stringify(linea);
  if (level === 'error' || level === 'warn') console.error(out);
  else console.log(out);
}

const logger = {
  debug: (...args) => escribir('debug', args),
  info:  (...args) => escribir('info', args),
  warn:  (...args) => escribir('warn', args),
  error: (...args) => escribir('error', args),
};

export default logger;
