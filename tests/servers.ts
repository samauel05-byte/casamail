// Servidores de prueba locales: IMAP (hoodiecrow), SMTP (smtp-server) y una IA falsa compatible con OpenAI.
import http from "node:http";
import { createRequire } from "node:module";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
const require = createRequire(import.meta.url);
const hoodiecrow = require("hoodiecrow-imap");

// Correos de prueba realistas: nombres con RFC 2047 y cuerpo en UTF-8 codificado (como los envían los clientes reales).
const b64 = (t: string) => Buffer.from(t, "utf8").toString("base64");
const ascii = (t: string) => /^[\x20-\x7e\r\n]*$/.test(t);
const name = (t: string) => (/^[\x20-\x7e]*$/.test(t) ? t : `=?utf-8?B?${b64(t)}?=`);
const raw = (n: number, from: string, subj: string, body: string) => {
  const [nm, addr] = from.split(" <");
  return `From: ${name(nm)} <${addr}\r\nTo: yo@casa.test\r\nSubject: ${name(subj)}\r\nDate: Mon, ${n} Nov 2026 10:00:00 +0000\r\nMessage-ID: <m${n}@x>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n${ascii(body) ? "Content-Transfer-Encoding: 7bit\r\n\r\n" + body : "Content-Transfer-Encoding: base64\r\n\r\n" + b64(body)}`;
};

export function startImap(port = 1143) {
  const sharedTok = { accessToken: "none" }; // mismo objeto para ambos nombres de usuario
  const s = hoodiecrow({ users: { yo: { password: "secreto", xoauth2: sharedTok }, "yo@casa.test": { password: "secreto", xoauth2: sharedTok } }, storage: {
    INBOX: { messages: [
      { raw: raw(2, "Ana Pérez <ana@empresa.com>", "Presupuesto marzo", "Hola, adjunto el presupuesto de marzo: 4.500 EUR. ¿Puedes confirmar antes del viernes?") },
      { raw: raw(3, "Banco <avisos@banco.com>", "Factura 1234", "Tu factura de 89 EUR vence el día 20.") },
      { raw: raw(4, "Luis <luis@amigo.com>", "Asado el sábado", "Te apuntas al asado del sabado en mi casa?") },
    ] },
    "": { separator: "/", folders: {
      Sent: { "special-use": "\\Sent" }, Drafts: { "special-use": "\\Drafts" }, Trash: { "special-use": "\\Trash" },
      Junk: { "special-use": "\\Junk" }, Archive: { "special-use": "\\Archive" },
    } },
  }, plugins: ["special-use", "create-special-use", "move", "unselect", "idle", "namespace", "uidplus", "sasl-ir", "xoauth2"] });
  s.listen(port);
  return s;
}

// token -> caducidad (ms). Lo rellena el proveedor OAuth falso; lo consultan IMAP y SMTP.
export const oauthTokens = new Map<string, number>();
export const sentMails: Awaited<ReturnType<typeof simpleParser>>[] = [];
export function startSmtp(port = 1025) {
  const s = new SMTPServer({
    authOptional: false, allowInsecureAuth: true, disabledCommands: ["STARTTLS"], authMethods: ["PLAIN", "LOGIN", "XOAUTH2"],
    onAuth(a, _s, cb) {
      if (a.method === "XOAUTH2") { const exp = oauthTokens.get(a.accessToken ?? ""); return exp && exp > Date.now() ? cb(null, { user: a.username }) : cb(new Error("Token inválido o caducado")); }
      a.password === "secreto" ? cb(null, { user: a.username }) : cb(new Error("Auth inválida"));
    },
    onData(stream, _s, cb) { simpleParser(stream).then((m) => { sentMails.push(m); cb(); }, cb); },
  });
  s.listen(port, "127.0.0.1");
  return s;
}

export const aiCalls: string[] = [];
export const lastSystem = { text: "" };
export const fakeStats = { total: 0, toolRequests: 0 };
export function startFakeAi(port = 1199) {
  const s = http.createServer((req, res) => {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
      const j = JSON.parse(b || "{}");
      const msgs = j.messages as { role: string; content?: string }[];
      const sys = msgs[0]?.content ?? "", last = msgs[msgs.length - 1];
      aiCalls.push(sys.slice(0, 40)); lastSystem.text = sys; fakeStats.total++; if (j.tools) fakeStats.toolRequests++;
      const reply = (message: unknown) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ choices: [{ message }] })); };
      if (!j.tools && /Redactas/.test(sys) && msgs.some((m) => (m.content ?? "").includes("FIRMA-YERLENY")))
        return reply({ content: JSON.stringify({ subject: "Prueba", body: "Hola, esto es una prueba.\n\nGracias por su tiempo.\nYerleny" }) });
      if (j.tools) { // modo asistente
        const toolMsgs = msgs.filter((m) => m.role === "tool").length;
        const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
        if (/LO-ENVIASTE/.test(lastUser)) return reply({ content: "Sí, el correo se envió correctamente a emoreno@portovalencia.com." }); // modelo que "miente"
        if (/RECUERDA/.test(lastUser)) {
          const lastIdx = msgs.map((m) => m.role).lastIndexOf("user"); // solo cuenta lo ocurrido desde el último mensaje del usuario
          const sinceUser = msgs.slice(lastIdx + 1).filter((m) => m.role === "tool").length;
          if (sinceUser === 0) return reply({ content: null, tool_calls: [{ id: "r1", type: "function", function: { name: "remember", arguments: JSON.stringify({ note: "Firmo mis correos como Sam" }) } }] });
          return reply({ content: "Si quieres, guardo que firmas como Sam. Confírmalo abajo." });
        }
        if (toolMsgs === 0) return reply({ content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "search_mail", arguments: JSON.stringify({ text: "presupuesto" }) } }] });
        if (toolMsgs === 1) return reply({ content: null, tool_calls: [{ id: "c2", type: "function", function: { name: "draft_email", arguments: JSON.stringify({ to: "ana@empresa.com", subject: "Re: Presupuesto marzo", body: "Confirmado." }) } }] });
        return reply({ content: "Encontré el presupuesto de Ana (4.500 EUR) y dejé un borrador de confirmación." });
      }
      if (/Responde solo con la palabra OK/.test(sys)) return reply({ content: "OK" });
      if (/notificaci[oó]n del m[oó]vil/.test(sys)) return reply({ content: "Ana pide confirmar el presupuesto antes del viernes." }); // resumen corto para avisos
      if (/"reunion":true\|false/.test(sys)) {                                                                                      // detección de reuniones en el texto
        const body = last?.content ?? "";
        if (!/REUNION-IA/.test(body)) return reply({ content: '{"reunion":false}' });
        const d = new Date(Date.now() + 864e5), p2 = (n: number) => String(n).padStart(2, "0");
        return reply({ content: "```json\n" + JSON.stringify({ reunion: true, titulo: "Seguimiento del proyecto", fecha: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, hora: "15:30", duracion_min: 45, lugar: "Sala 2" }) + "\n```" });
      }
      if (/Resume/.test(sys)) return reply({ content: "Resumen: Ana pide confirmar el presupuesto.\nAcciones pendientes\n- Confirmar antes del viernes" });
      if (/Redactas/.test(sys)) return reply({ content: '```json\n{"subject":"Reunión","body":"Hola, ¿nos vemos mañana?"}\n```' });
      if (/3 respuestas/.test(sys)) return reply({ content: '[{"label":"Confirmar","body":"Confirmado."},{"label":"Preguntar","body":"¿Puedes detallar?"},{"label":"Declinar","body":"No podré."}]' });
      if (/Convierte una petición/.test(sys)) return reply({ content: '{"from":"ana","text":"presupuesto"}' });
      if (/Clasifica/.test(sys)) return reply({ content: '[{"uid":1,"priority":3,"category":"trabajo","why":"pide confirmación"}]' });
      if (/Reescribes/.test(sys)) return reply({ content: "Texto mejorado." });
      reply({ content: "?" });
    });
  });
  s.listen(port, "127.0.0.1");
  return s;
}

// ---------- Proveedor OAuth falso (estilo Google/Microsoft): PKCE S256, caducidad, rotación y revocación ----------
import crypto from "node:crypto";
export const oauth = { ttlMs: 3_600_000, rotate: false, refreshCalls: 0, codeCalls: 0, revoked: new Set<string>(), seenChallengeMethods: [] as string[], clientSecretSeen: "" as string | undefined };
export function startMockOAuth(imap: { getUser: (u: string) => { xoauth2: { accessToken: string } } }, port = 1300) {
  const codes = new Map<string, { challenge: string; redirect: string }>();
  const refreshTokens = new Map<string, string>(); // refresh -> email
  const issue = (email: string) => {
    const at = "at_" + crypto.randomBytes(12).toString("hex");
    oauthTokens.set(at, Date.now() + oauth.ttlMs);
    imap.getUser("yo").xoauth2.accessToken = at; // el IMAP de prueba acepta el último token emitido
    setTimeout(() => { if (imap.getUser("yo").xoauth2.accessToken === at) imap.getUser("yo").xoauth2.accessToken = "expired"; }, oauth.ttlMs).unref();
    return { access_token: at, expires_in: Math.round(oauth.ttlMs / 1000), email };
  };
  const jwt = (email: string) => ["e30", Buffer.from(JSON.stringify({ email })).toString("base64url"), "sig"].join(".");
  const s = http.createServer((req, res) => {
    const u = new URL(req.url!, "http://x");
    const send = (code: number, body: unknown) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
    if (u.pathname === "/authorize") {
      const q = u.searchParams;
      oauth.seenChallengeMethods.push(q.get("code_challenge_method") ?? "");
      if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) return send(400, { error: "invalid_request", error_description: "PKCE S256 obligatorio" });
      const code = "code_" + crypto.randomBytes(8).toString("hex");
      codes.set(code, { challenge: q.get("code_challenge")!, redirect: q.get("redirect_uri")! });
      const back = new URL(q.get("redirect_uri")!); back.searchParams.set("code", code); back.searchParams.set("state", q.get("state")!);
      res.statusCode = 302; res.setHeader("Location", back.toString()); return res.end();
    }
    if (u.pathname === "/token" && req.method === "POST") {
      let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
        const f = new URLSearchParams(b); oauth.clientSecretSeen = f.get("client_secret") ?? undefined;
        if (f.get("grant_type") === "authorization_code") {
          oauth.codeCalls++;
          const c = codes.get(f.get("code") ?? ""); codes.delete(f.get("code") ?? "");
          if (!c) return send(400, { error: "invalid_grant", error_description: "código inválido o ya usado" });
          if (c.redirect !== f.get("redirect_uri")) return send(400, { error: "invalid_grant", error_description: "redirect_uri distinto" });
          const ok = crypto.createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url") === c.challenge;
          if (!ok) return send(400, { error: "invalid_grant", error_description: "PKCE: code_verifier no coincide" });
          const rt = "rt_" + crypto.randomBytes(12).toString("hex"); refreshTokens.set(rt, "yo@casa.test");
          const t = issue("yo@casa.test"); return send(200, { ...t, refresh_token: rt, id_token: jwt("yo@casa.test") });
        }
        if (f.get("grant_type") === "refresh_token") {
          oauth.refreshCalls++;
          const old = f.get("refresh_token") ?? "";
          if (oauth.revoked.has(old) || !refreshTokens.has(old)) return send(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
          const t = issue(refreshTokens.get(old)!);
          if (oauth.rotate) { refreshTokens.delete(old); const nrt = "rt_" + crypto.randomBytes(12).toString("hex"); refreshTokens.set(nrt, t.email); return send(200, { ...t, refresh_token: nrt }); }
          return send(200, t);
        }
        send(400, { error: "unsupported_grant_type" });
      });
      return;
    }
    send(404, {});
  });
  s.listen(port, "127.0.0.1");
  return s;
}
