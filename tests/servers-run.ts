// Arranca los servidores IMAP/SMTP de prueba (para probar el motor de correo de Android en la JVM). Uso: npx tsx tests/servers-run.ts
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
process.env.CASAMAIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cm-srv-"));
const { startImap, startSmtp, sentMails } = await import("./servers.js");
startImap(); startSmtp();
console.log("IMAP 1143 y SMTP 1025 listos");
setInterval(() => { fs.writeFileSync(path.join(os.tmpdir(), "cm-smtp-count"), String(sentMails.length)); }, 300);
