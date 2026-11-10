'use strict';
/**
 * Registro de errores de la app de escritorio.
 *  - Es un archivo LOCAL (~/.casamail/logs/casamail.log). Nunca se envía a ningún sitio: solo lo comparte el usuario si quiere.
 *  - Antes de escribir se ocultan claves, tokens, contraseñas, enlaces de acceso, la carpeta personal y la parte local de los emails.
 *  - Nunca guarda el contenido de los correos. Rota a los 2 MB (conserva el anterior).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const util = require('node:util');

const dataDir = process.env.CASAMAIL_HOME || path.join(os.homedir(), '.casamail');
const dir = path.join(dataDir, 'logs');
const file = path.join(dir, 'casamail.log');
const MAX_BYTES = 2 * 1024 * 1024;

/** Oculta datos sensibles de un texto antes de escribirlo en el registro. */
function redact(input) {
  let s = String(input);
  const home = os.homedir();
  if (home && home.length > 2) s = s.split(home).join('~');
  return s
    .replace(/([?&](?:t|code|state|token|access_token|refresh_token|id_token|key|api_key|apikey|client_secret|password|pass)=)[^&\s"'<>]+/gi, '$1[oculto]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{6,}/g, '$1 [oculto]')
    .replace(/("(?:accessToken|refreshToken|apiKey|clientSecret|pass|password|token)"\s*:\s*")[^"]*/g, '$1[oculto]')
    .replace(/\b(?:sk|gsk|rt|at)[-_][A-Za-z0-9_-]{16,}/g, '[clave oculta]')
    .replace(/\bAIza[0-9A-Za-z_-]{30,}/g, '[clave oculta]')
    .replace(/\b[a-f0-9]{40,}\b/gi, '[oculto]')
    .replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2');
}

function rotate() {
  try { if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, path.join(dir, 'casamail.1.log')); } catch { /* aún no existe */ }
}

/** Escribe una línea. Nunca lanza: un fallo del registro no debe romper la app. */
function write(level, ...args) {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    rotate();
    const text = redact(util.format(...args)).replace(/\r?\n/g, '\n    ');
    fs.appendFileSync(file, `${new Date().toISOString()} [${level}] ${text}\n`, { mode: 0o600 });
  } catch { /* sin permisos o disco lleno: se ignora */ }
}

/** Últimas líneas del registro (ya redactadas al escribirlas). */
function tail(lines = 80) {
  try {
    const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size, len = Math.min(size, 96 * 1024), buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len); fs.closeSync(fd);
    return buf.toString('utf8').split('\n').filter(Boolean).slice(-lines).join('\n');
  } catch { return '(el registro está vacío)'; }
}

/** Texto listo para pegar al pedir ayuda: versiones, sistema y las últimas líneas del registro. */
function diagnostics(header) {
  return [redact(header), `Registro: ${redact(file)}`, '', '--- últimas líneas ---', tail(80)].join('\n');
}

module.exports = {
  dir, file, redact, write, tail, diagnostics,
  info: (...a) => write('info', ...a), warn: (...a) => write('warn', ...a), error: (...a) => write('error', ...a),
};
