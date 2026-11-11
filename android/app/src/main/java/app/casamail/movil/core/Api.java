package app.casamail.movil.core;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.mail.internet.MimeMessage;

/**
 * Las "llamadas /api" de la interfaz de CasaMail, atendidas AQUÍ, dentro de la app (sin servidor ni PC): la misma pantalla de siempre,
 * pero el correo se lee y se envía directamente desde el teléfono.
 */
public final class Api {
    public static final class Respuesta {
        public final int estado; public final String json; public final byte[] datos; public final String tipo, nombre;
        Respuesta(int estado, String json) { this(estado, json, null, null, null); }
        Respuesta(int estado, String json, byte[] datos, String tipo, String nombre) { this.estado = estado; this.json = json; this.datos = datos; this.tipo = tipo; this.nombre = nombre; }
    }

    private final Almacen alm; private final Correo correo = new Correo(); private final String version; private final IA ia;
    public Api(Almacen alm, String version) { this.alm = alm; this.version = version; this.ia = new IA(alm); }
    public Correo correo() { return correo; }

    // ---------- cuentas guardadas ----------
    public synchronized List<Cuenta> cuentas() {
        List<Cuenta> l = new ArrayList<>();
        try { JSONArray a = new JSONArray(alm.leer("cuentas") == null ? "[]" : alm.leer("cuentas")); for (int i = 0; i < a.length(); i++) l.add(Cuenta.deJson(a.getJSONObject(i))); } catch (JSONException ignored) { }
        return l;
    }
    private synchronized void guardarCuentas(List<Cuenta> l) { JSONArray a = new JSONArray(); try { for (Cuenta c : l) a.put(c.aJson()); } catch (JSONException ignored) { } alm.guardar("cuentas", a.toString()); }
    private Cuenta cuenta(Map<String, String> q) throws Correo.ErrorCorreo {
        List<Cuenta> l = cuentas(); if (l.isEmpty()) throw new Correo.ErrorCorreo("No hay ninguna cuenta. Inicia sesión primero.", "sin_cuenta");
        String id = q.get("account"); if (id != null && !id.isEmpty()) for (Cuenta c : l) if (c.id.equals(id)) return c;
        return l.get(0);
    }
    private JSONObject jsonAlm(String clave, String def) { try { String s = alm.leer(clave); return new JSONObject(s == null ? def : s); } catch (JSONException e) { try { return new JSONObject(def); } catch (JSONException x) { return new JSONObject(); } } }

    // ---------- confirmaciones de lectura (acuses MDN) ----------
    private static String normId(String s) { return s == null ? "" : s.trim().replaceAll("[<>]", "").toLowerCase(Locale.ROOT); }
    /** Guarda, por Message-ID del correo que enviaste, cuándo y quién lo marcó como leído (nos quedamos con la primera lectura). */
    private synchronized void registrarAcuse(String origId, String readAt, String by) {
        String k = normId(origId); if (k.isEmpty()) return;
        try { JSONObject a = jsonAlm("acuses", "{}"); if (a.has(k) || a.length() >= 5000) return; a.put(k, new JSONObject().put("readAt", readAt).put("by", by == null ? "" : by)); alm.guardar("acuses", a.toString()); } catch (JSONException ignored) { }
    }
    private JSONObject acuse(String origId) { String k = normId(origId); return k.isEmpty() ? null : jsonAlm("acuses", "{}").optJSONObject(k); }
    /** Añade al mensaje los campos que espera la interfaz: receipt (si te leyeron), wantsReceipt/receiptTo (si te piden acuse); y registra el acuse si el propio mensaje es uno. */
    private JSONObject conAcuse(Cuenta c, JSONObject msg) throws JSONException {
        String dnt = msg.isNull("dispositionNotificationTo") ? null : msg.optString("dispositionNotificationTo");
        boolean mio = msg.optString("from", "").toLowerCase(Locale.ROOT).contains(c.email.toLowerCase(Locale.ROOT));
        JSONObject ac = msg.isNull("messageId") ? null : acuse(msg.optString("messageId"));
        msg.put("receipt", ac == null ? JSONObject.NULL : ac);
        msg.put("wantsReceipt", dnt != null && !dnt.isEmpty() && !mio);
        msg.put("receiptTo", dnt == null ? JSONObject.NULL : dnt);
        if (!msg.isNull("mdnFor")) registrarAcuse(msg.optString("mdnFor"), msg.isNull("date") ? java.time.Instant.now().toString() : msg.optString("date"), msg.optString("from"));
        return msg;
    }

    // ---------- punto de entrada ----------
    public Respuesta manejar(String metodo, String url, String cuerpo) {
        try {
            String ruta = url, consulta = ""; int i = url.indexOf('?'); if (i >= 0) { ruta = url.substring(0, i); consulta = url.substring(i + 1); }
            Map<String, String> q = parse(consulta); JSONObject b = cuerpo == null || cuerpo.isEmpty() ? new JSONObject() : new JSONObject(cuerpo);
            return despachar(metodo.toUpperCase(Locale.ROOT), ruta, q, b);
        } catch (Correo.ErrorCorreo e) {
            try { return new Respuesta(500, new JSONObject().put("error", e.getMessage()).put("code", "reauth".equals(e.codigo) ? "reauth" : JSONObject.NULL).toString()); } catch (JSONException x) { return new Respuesta(500, "{}"); }
        } catch (Exception e) {
            try { return new Respuesta(500, new JSONObject().put("error", String.valueOf(e.getMessage())).toString()); } catch (JSONException x) { return new Respuesta(500, "{}"); }
        }
    }
    private static Map<String, String> parse(String s) {
        Map<String, String> m = new HashMap<>(); if (s == null || s.isEmpty()) return m;
        for (String par : s.split("&")) { int k = par.indexOf('='); try { m.put(URLDecoder.decode(k < 0 ? par : par.substring(0, k), "UTF-8"), k < 0 ? "" : URLDecoder.decode(par.substring(k + 1), "UTF-8")); } catch (UnsupportedEncodingException ignored) { } }
        return m;
    }
    private static Respuesta ok(Object o) { return new Respuesta(200, o == null ? "null" : o.toString()); }
    private static int num(String s, int def) { try { return s == null ? def : Integer.parseInt(s); } catch (NumberFormatException e) { return def; } }
    private static final Pattern RE_MSG = Pattern.compile("^/api/message/(\\d+)(?:/([a-z]+)(?:/(\\d+))?)?$");

    private Respuesta despachar(String m, String r, Map<String, String> q, JSONObject b) throws Exception {
        // ----- cuentas -----
        if (r.equals("/api/accounts")) {
            if (m.equals("POST")) return crearCuenta(b);
            JSONArray a = new JSONArray(); for (Cuenta c : cuentas()) a.put(new JSONObject().put("id", c.id).put("email", c.email).put("auth", "password")); return ok(a);
        }
        if (r.startsWith("/api/accounts/") && m.equals("DELETE")) {
            String id = r.substring("/api/accounts/".length()); List<Cuenta> l = cuentas(), n = new ArrayList<>(); for (Cuenta c : l) { if (c.id.equals(id)) correo.cerrar(c); else n.add(c); } guardarCuentas(n); return ok("{\"ok\":true}");
        }
        if (r.equals("/api/presets")) { JSONArray a = new JSONArray(); for (String e : new String[]{"gmail", "outlook", "yahoo", "icloud", "zoho", "aol", "gmx", "fastmail"}) a.put(new JSONObject().put("id", e).put("note", "")); return ok(a); }
        if (r.equals("/api/detect")) return detectar(q.get("email"));

        // ----- ajustes sencillos -----
        if (r.equals("/api/settings")) { if (m.equals("POST") && b.has("sendDelayMin")) alm.guardar("retraso", String.valueOf(b.optInt("sendDelayMin", 10))); return ok(new JSONObject().put("signatures", new JSONObject()).put("sendDelayMin", retraso())); }
        if (r.equals("/api/send-delay")) { if (!m.equals("GET")) alm.guardar("retraso", String.valueOf(Math.max(0, Math.min(10, b.optInt("minutes", 10))))); return ok(new JSONObject().put("minutes", retraso())); }
        if (r.equals("/api/yerleny")) return ok(new JSONObject().put("userName", "").put("notes", new JSONArray()));
        if (r.equals("/api/archive/stats")) return ok(new JSONObject().put("messages", 0).put("folders", 0).put("storedBytes", 0).put("freeBytes", JSONObject.NULL).put("dir", ""));
        if (r.equals("/api/ai/config")) {
            if (m.equals("POST")) { ia.guardar(b.optString("apiKey", b.optString("clave", "")), b.optString("model", "")); return ok(estadoIA()); }
            return ia.configurada() ? ok(estadoIA()) : ok("null");
        }
        if (r.equals("/api/ai/engines")) {
            if (m.equals("POST")) return ok(new JSONArray());   // la versión independiente no usa "motores"; la clave se guarda en /api/ai/config
            return ok(ia.configurada() ? new JSONArray().put(estadoIA()) : new JSONArray());
        }
        if (r.startsWith("/api/ai/")) return ai(m, r, q, b);
        if (r.equals("/api/update")) return ok(new JSONObject().put("info", JSONObject.NULL).put("version", version));
        if (r.equals("/api/contacts")) return ok("[]");
        if (r.equals("/api/changes")) { dormir(q.get("wait")); return ok("{\"seq\":0,\"accounts\":[]}"); }
        if (r.equals("/api/notifications")) { dormir(q.get("wait")); return ok("{\"items\":[],\"last\":0,\"unread\":0}"); }
        if (r.startsWith("/api/notifications/")) return ok("{\"items\":[],\"last\":0,\"unread\":0,\"ok\":true}");
        if (r.equals("/api/notify/settings")) return ok("{\"enabled\":true,\"mail\":true,\"aiSummary\":false,\"meetings\":false,\"autoAgenda\":false,\"reminders\":[1440,60,10],\"digest\":false,\"digestHour\":8}");
        if (r.equals("/api/outbox")) return ok(bandeja());
        if (r.startsWith("/api/outbox/")) return bandejaAccion(m, r.substring("/api/outbox/".length()));
        if (r.startsWith("/api/calendar")) return calendario(m, r, q, b);
        if (r.equals("/api/signatures")) return ok(todasFirmas());
        if (r.startsWith("/api/signatures/")) { if (m.equals("PUT")) return ok(guardarFirmas(r.substring("/api/signatures/".length()), b)); return ok("{\"candidates\":[]}"); }

        // ----- correo -----
        if (r.equals("/api/folders")) { Cuenta c = cuenta(q); if (m.equals("POST")) { correo.crearCarpeta(c, b.optString("name")); return ok("{\"ok\":true}"); } return ok(correo.carpetas(c)); }
        if (r.equals("/api/messages")) { Cuenta c = cuenta(q); return ok(correo.mensajes(c, carpeta(q), num(q.get("limit"), 40), num(q.get("offset"), 0), "1".equals(q.get("unread")))); }
        if (r.equals("/api/unified")) return ok(unificada(num(q.get("limit"), 50), num(q.get("offset"), 0)));
        if (r.equals("/api/search")) { Cuenta c = cuenta(q); return ok(correo.buscar(c, carpeta(q), q.get("q"), "1".equals(q.get("starred")), "1".equals(q.get("unread")), num(q.get("limit"), 50), num(q.get("offset"), 0))); }
        if (r.equals("/api/send") && m.equals("POST")) return enviar(cuenta(q), b, false, null);
        if (r.equals("/api/draft") && m.equals("POST")) { Cuenta c = cuenta(q); correo.guardarBorrador(c, correo.construir(c, b)); return ok("{\"ok\":true}"); }
        Matcher mm = RE_MSG.matcher(r);
        if (mm.matches()) {
            Cuenta c = cuenta(q); long uid = Long.parseLong(mm.group(1)); String acc = mm.group(2), f = carpeta(q);
            if (acc == null) return ok(conAcuse(c, correo.mensaje(c, f, uid, true)));
            switch (acc) {
                case "receipt": { JSONObject o = correo.mensaje(c, f, uid, false); return ok(new JSONObject().put("to", correo.enviarAcuse(c, o))); }
                case "flags": correo.marcar(c, f, uid, b.has("read") ? b.optBoolean("read") : null, b.has("starred") ? b.optBoolean("starred") : null); return ok("{\"ok\":true}");
                case "trash": correo.papelera(c, f, uid); return ok("{\"ok\":true}");
                case "archive": destino(c, f, uid, "\\Archive", "Archive"); return ok("{\"ok\":true}");
                case "spam": destino(c, f, uid, "\\Junk", "Junk"); return ok("{\"ok\":true}");
                case "move": correo.mover(c, f, uid, b.optString("dest")); return ok("{\"ok\":true}");
                case "snooze": return ok("{\"ok\":true}");
                case "reply": return responder(c, f, uid, b);
                case "attachment": { Object[] a = correo.adjunto(c, f, uid, Integer.parseInt(mm.group(3) == null ? "0" : mm.group(3))); return new Respuesta(200, null, (byte[]) a[2], (String) a[1], (String) a[0]); }
                default: break;
            }
        }
        return m.equals("GET") ? ok("{}") : ok("{\"ok\":true}");
    }

    private static String carpeta(Map<String, String> q) { String f = q.get("folder"); return f == null || f.isEmpty() ? "INBOX" : f; }
    private int retraso() { try { return Integer.parseInt(alm.leer("retraso") == null ? "10" : alm.leer("retraso")); } catch (NumberFormatException e) { return 10; } }
    private static void dormir(String w) { int s = Math.min(num(w, 0), 25); if (s > 0) try { Thread.sleep(s * 1000L); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); } }
    private void destino(Cuenta c, String f, long uid, String uso, String def) throws Correo.ErrorCorreo { String d = correo.carpetaEspecial(c, uso); if (d == null) d = def; if (!d.equals(f)) correo.mover(c, f, uid, d); }

    // ---------- iniciar sesión ----------
    private Respuesta detectar(String email) throws JSONException {
        Servidores.Ajuste a = email == null ? null : Servidores.porDominio(email); boolean conocido = a != null; if (a == null && email != null) a = Servidores.suponer(email);
        if (a == null) return ok(new JSONObject().put("conocido", false));
        return ok(new JSONObject().put("conocido", conocido).put("id", a.id).put("imapHost", a.imapHost).put("imapPuerto", a.imapPuerto).put("smtpHost", a.smtpHost).put("smtpPuerto", a.smtpPuerto)
                .put("nota", a.nota == null ? "" : a.nota).put("enlaceClaveApp", a.enlaceClaveApp == null ? JSONObject.NULL : a.enlaceClaveApp));
    }
    private Respuesta crearCuenta(JSONObject b) throws Exception {
        String email = b.optString("email").trim(), clave = b.optString("pass");
        if (!email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw new Correo.ErrorCorreo("Escribe un correo válido (nombre@dominio.com).", "datos");
        if (clave.isEmpty()) throw new Correo.ErrorCorreo("Escribe la contraseña.", "datos");
        Cuenta c = new Cuenta(); c.id = Cuenta.idDe(email); c.email = email; c.usuario = b.optString("user", email).isEmpty() ? email : b.optString("user", email); c.clave = clave;
        Servidores.Ajuste a = Servidores.porDominio(email); if (a == null) a = Servidores.suponer(email);
        c.imapHost = b.optString("imapHost").isEmpty() ? a.imapHost : b.optString("imapHost"); c.imapPuerto = b.optInt("imapPort", a.imapPuerto); c.imapSeguro = b.optBoolean("imapSecure", c.imapPuerto != 143);
        c.smtpHost = b.optString("smtpHost").isEmpty() ? a.smtpHost : b.optString("smtpHost"); c.smtpPuerto = b.optInt("smtpPort", a.smtpPuerto); c.smtpSeguro = b.optBoolean("smtpSecure", c.smtpPuerto == 465);
        try { correo.probar(c); } catch (Correo.ErrorCorreo e) { if (a.nota != null && ("reauth".equals(e.codigo) || "conexion".equals(e.codigo))) throw new Correo.ErrorCorreo(e.getMessage() + "\n\n" + a.nota, e.codigo); throw e; }
        List<Cuenta> l = cuentas(); List<Cuenta> n = new ArrayList<>(); for (Cuenta x : l) if (!x.id.equals(c.id)) n.add(x); n.add(c); guardarCuentas(n);
        return ok(new JSONObject().put("ok", true).put("id", c.id));
    }

    // ---------- bandeja unificada ----------
    private JSONObject unificada(int limite, int desplazamiento) throws Exception {
        int need = desplazamiento + Math.min(limite, 3000), total = 0; List<JSONObject> todos = new ArrayList<>();
        for (Cuenta c : cuentas()) {
            try {
                int got = 0, off = 0;
                while (got < need) { JSONObject r = correo.mensajes(c, "INBOX", Math.min(200, need - got), off, false); JSONArray ms = r.getJSONArray("messages"); if (off == 0) total += r.getInt("total"); for (int i = 0; i < ms.length(); i++) { JSONObject o = ms.getJSONObject(i); o.put("account", c.id); todos.add(o); } got += ms.length(); off += ms.length(); if (ms.length() == 0 || off >= r.getInt("total")) break; }
            } catch (Correo.ErrorCorreo ignored) { /* una cuenta caída no impide ver las demás */ }
        }
        Collections.sort(todos, (x, y) -> { int d = y.optString("date", "").compareTo(x.optString("date", "")); if (d != 0) return d; d = x.optString("account").compareTo(y.optString("account")); return d != 0 ? d : Long.compare(y.optLong("uid"), x.optLong("uid")); });
        JSONArray arr = new JSONArray(); for (int i = desplazamiento; i < Math.min(todos.size(), need); i++) arr.put(todos.get(i));
        return new JSONObject().put("total", total).put("next", desplazamiento + limite).put("messages", arr);
    }

    // ---------- firmas ----------
    private JSONObject todasFirmas() throws JSONException {
        JSONObject guardadas = jsonAlm("firmas", "{}"), out = new JSONObject();
        for (Cuenta c : cuentas()) out.put(c.id, guardadas.has(c.id) ? guardadas.getJSONObject(c.id) : new JSONObject().put("items", new JSONArray()).put("newDefault", "").put("replyDefault", ""));
        return out;
    }
    private JSONObject guardarFirmas(String cuentaId, JSONObject b) throws JSONException {
        JSONArray items = new JSONArray(), src = b.optJSONArray("items"); String nd = b.optString("newDefault"), rd = b.optString("replyDefault"); boolean ndOk = false, rdOk = false;
        if (src != null) for (int i = 0; i < Math.min(src.length(), 10); i++) {
            JSONObject s = src.getJSONObject(i); String id = s.optString("id"); if (!id.matches("[\\w-]{1,40}")) id = UUID.randomUUID().toString().substring(0, 8);
            String html = Firma.limpiar(s.optString("html")); items.put(new JSONObject().put("id", id).put("name", s.optString("name", "Firma").trim().isEmpty() ? "Firma" : s.optString("name")).put("html", html).put("text", Firma.aTexto(html)));
            ndOk |= id.equals(nd); rdOk |= id.equals(rd);
        }
        String primero = items.length() > 0 ? items.getJSONObject(0).getString("id") : "";
        JSONObject set = new JSONObject().put("items", items).put("newDefault", ndOk ? nd : primero).put("replyDefault", rdOk ? rd : (ndOk ? nd : primero));
        JSONObject todas = jsonAlm("firmas", "{}"); todas.put(cuentaId, set); alm.guardar("firmas", todas.toString()); return set;
    }
    private JSONObject elegirFirma(String cuentaId, String eleccion, boolean respuesta) throws JSONException {
        if ("".equals(eleccion)) return null;
        JSONObject set = jsonAlm("firmas", "{}").optJSONObject(cuentaId); if (set == null) return null; JSONArray it = set.optJSONArray("items"); if (it == null) return null;
        String id = eleccion != null ? eleccion : set.optString(respuesta ? "replyDefault" : "newDefault");
        for (int i = 0; i < it.length(); i++) if (it.getJSONObject(i).optString("id").equals(id)) return it.getJSONObject(i);
        return null;
    }

    // ---------- enviar y responder (con bandeja de salida: 10 minutos para retirarlo) ----------
    private Respuesta enviar(Cuenta c, JSONObject b, boolean esRespuesta, JSONObject cita) throws Exception {
        if (!b.has("html") || b.optString("html").isEmpty()) {
            JSONObject firma = elegirFirma(c.id, b.has("signature") && !b.isNull("signature") ? b.optString("signature") : null, esRespuesta);
            Firma.conFirma(b, firma, cita == null ? null : cita.optString("text"), cita == null ? null : cita.optString("html"));
        }
        b.remove("signature");
        boolean ya = b.optBoolean("now"); int min = retraso(); long cuando = 0;
        if (!b.optString("sendAt").isEmpty() && b.opt("sendAt") != JSONObject.NULL) try { cuando = java.time.Instant.parse(b.getString("sendAt")).toEpochMilli(); } catch (Exception ignored) { }
        long ahora = System.currentTimeMillis(); if (cuando > ahora + 30_000) { /* programado */ } else if (ya || min == 0) { correo.enviar(c, correo.construir(c, b)); return ok("{\"sent\":true,\"accepted\":[\"ok\"]}"); } else cuando = ahora + min * 60_000L;
        JSONObject item = new JSONObject().put("id", UUID.randomUUID().toString().substring(0, 8)).put("account", c.id).put("kind", cuando > ahora + min * 60_000L + 60_000 ? "scheduled" : "outbox").put("to", b.optString("to")).put("subject", b.optString("subject")).put("sendAt", cuando).put("payload", b);
        synchronized (this) { JSONArray a = new JSONArray(alm.leer("bandeja") == null ? "[]" : alm.leer("bandeja")); a.put(item); alm.guardar("bandeja", a.toString()); }
        return ok(new JSONObject().put("queued", true).put("kind", item.getString("kind")).put("id", item.getString("id")).put("sendAt", cuando));
    }
    private Respuesta responder(Cuenta c, String f, long uid, JSONObject b) throws Exception {
        JSONObject o = correo.mensaje(c, f, uid, false); String asunto = o.optString("subject"), fecha = o.optString("date", ""), de = o.optString("from");
        String citaTxt = "El " + fecha + ", " + de + " escribió:\n> " + o.optString("text").replace("\n", "\n> "), cab = "El " + Firma.esc(fecha) + ", " + Firma.esc(de) + " escribió:";
        String citaHtml = "<div>" + cab + "</div><blockquote style=\"margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex\">" + Firma.esc(o.optString("text")).replace("\n", "<br>") + "</blockquote>";
        JSONObject p = new JSONObject().put("to", de).put("subject", asunto.toLowerCase(Locale.ROOT).startsWith("re:") ? asunto : "Re: " + asunto).put("text", b.optString("text")).put("now", b.optBoolean("now"));
        if (b.optJSONArray("attachments") != null && b.getJSONArray("attachments").length() > 0) p.put("attachments", b.getJSONArray("attachments"));
        if (b.optBoolean("replyAll") && !o.optString("cc").isEmpty()) p.put("cc", o.optString("cc"));
        if (b.has("signature") && !b.isNull("signature")) p.put("signature", b.optString("signature"));
        if (!o.isNull("messageId")) { p.put("inReplyTo", o.getString("messageId")); JSONArray refs = new JSONArray(o.getJSONArray("references").toString()); refs.put(o.getString("messageId")); p.put("references", refs); }
        return enviar(c, p, true, new JSONObject().put("text", citaTxt).put("html", citaHtml));
    }

    private JSONArray bandeja() throws JSONException {
        JSONArray out = new JSONArray(), a = new JSONArray(alm.leer("bandeja") == null ? "[]" : alm.leer("bandeja"));
        for (int i = 0; i < a.length(); i++) { JSONObject x = a.getJSONObject(i); out.put(new JSONObject().put("id", x.getString("id")).put("kind", x.getString("kind")).put("to", x.optString("to")).put("subject", x.optString("subject")).put("sendAt", x.getLong("sendAt")).put("canCancel", x.getLong("sendAt") > System.currentTimeMillis())); }
        return out;
    }
    private synchronized Respuesta bandejaAccion(String metodo, String resto) throws Exception {
        boolean ya = resto.endsWith("/now"); String id = ya ? resto.substring(0, resto.length() - 4) : resto;
        JSONArray a = new JSONArray(alm.leer("bandeja") == null ? "[]" : alm.leer("bandeja")), n = new JSONArray(); JSONObject enviarYa = null;
        for (int i = 0; i < a.length(); i++) { JSONObject x = a.getJSONObject(i); if (x.getString("id").equals(id)) { if (ya) enviarYa = x; } else n.put(x); }
        if (!ya && n.length() == a.length()) return new Respuesta(409, "{\"error\":\"Ya no se puede retirar: el mensaje ya salió.\"}");
        alm.guardar("bandeja", n.toString());
        if (enviarYa != null) { Cuenta c = cuentaPorId(enviarYa.getString("account")); if (c != null) correo.enviar(c, correo.construir(c, enviarYa.getJSONObject("payload"))); }
        return ok("{\"ok\":true}");
    }
    private Cuenta cuentaPorId(String id) { for (Cuenta c : cuentas()) if (c.id.equals(id)) return c; return null; }

    /** Envía lo que ya cumplió su plazo. Lo llama un temporizador mientras la app está abierta y una tarea en segundo plano. */
    public synchronized int procesarBandeja(long ahora) {
        int enviados = 0;
        try {
            JSONArray a = new JSONArray(alm.leer("bandeja") == null ? "[]" : alm.leer("bandeja")), resto = new JSONArray();
            for (int i = 0; i < a.length(); i++) {
                JSONObject x = a.getJSONObject(i);
                if (x.getLong("sendAt") > ahora) { resto.put(x); continue; }
                Cuenta c = cuentaPorId(x.getString("account")); if (c == null) continue;
                try { correo.enviar(c, correo.construir(c, x.getJSONObject("payload"))); enviados++; } catch (Correo.ErrorCorreo e) { if (!"datos".equals(e.codigo)) resto.put(x); /* sin red: se reintenta */ }
            }
            alm.guardar("bandeja", resto.toString());
        } catch (JSONException ignored) { }
        return enviados;
    }

    /** Correo nuevo sin leer desde la última vez, de todas las cuentas: [{uid, cuenta, titulo, cuerpo}]. La primera vez solo toma nota (no avisa de lo que ya había). */
    public synchronized JSONArray avisos() {
        JSONArray out = new JSONArray();
        for (Cuenta c : cuentas()) {
            try {
                String clave = "visto:" + c.id, v = alm.leer(clave); long desde = v == null ? -1 : Long.parseLong(v); long[] max = new long[1];
                JSONArray n = correo.nuevos(c, desde, max); alm.guardar(clave, String.valueOf(max[0]));
                for (int i = 0; i < n.length() && out.length() < 20; i++) {
                    JSONObject m = n.getJSONObject(i);
                    if (m.has("mdnFor") && !m.isNull("mdnFor")) { registrarAcuse(m.optString("mdnFor"), m.optString("date", java.time.Instant.now().toString()), m.optString("from", "")); continue; } // es un acuse de lectura: se registra y no se avisa como correo
                    out.put(new JSONObject().put("uid", m.optLong("uid")).put("cuenta", c.id).put("titulo", m.optString("from", c.email)).put("cuerpo", m.optString("subject", "(sin asunto)")));
                }
            } catch (Exception ignored) { /* sin red o contraseña caducada: se reintenta en la próxima */ }
        }
        return out;
    }

    // ---------- Yerleny (IA en la nube, nivel gratuito) ----------
    private JSONObject estadoIA() throws JSONException { return new JSONObject().put("provider", "gemini").put("model", ia.modelo()).put("ok", true).put("free", true); }

    private Respuesta ai(String m, String r, Map<String, String> q, JSONObject b) throws Exception {
        try {
            if (r.equals("/api/ai/warmup")) return ok("{\"ok\":true}");
            if (r.equals("/api/ai/test")) return ok(new JSONObject().put("reply", ia.probar()));
            if (r.equals("/api/ai/rewrite")) return ok(new JSONObject().put("text", ia.reescribir(b.optString("text"), b.optString("mode", ""))));
            if (r.equals("/api/ai/agent")) return ok(ia.chat(b.optJSONArray("history"), b.optString("text")));
            if (r.equals("/api/ai/triage")) { JSONObject pag = correo.mensajes(cuenta(q), q.getOrDefault("folder", "INBOX"), 40, 0, false); return ok(new JSONObject().put("items", ia.triage(pag.getJSONArray("messages")))); }
            if (r.equals("/api/ai/summarize")) { JSONObject msg = correo.mensaje(cuenta(q), b.optString("folder", "INBOX"), b.getLong("uid"), false); return ok(new JSONObject().put("summary", ia.resumir(msg))); }
            if (r.equals("/api/ai/replies")) { JSONObject msg = correo.mensaje(cuenta(q), b.optString("folder", "INBOX"), b.getLong("uid"), false); return ok(new JSONObject().put("options", ia.respuestas(msg))); }
            if (r.equals("/api/ai/draft")) {
                JSONObject original = b.has("uid") && !b.isNull("uid") ? correo.mensaje(cuenta(q), b.optString("folder", "INBOX"), b.getLong("uid"), false) : null;
                return ok(ia.borrador(b.optString("instruction"), b.optString("tone", ""), original));
            }
            if (m.equals("GET")) return ok("{}");    // presets, local, models… no aplican en la versión independiente
            return ok("{}");
        } catch (IA.ErrorIA e) {
            return new Respuesta(500, new JSONObject().put("error", e.getMessage()).toString());
        }
    }

    // ---------- calendario sencillo (guardado en el teléfono) ----------
    private Respuesta calendario(String m, String r, Map<String, String> q, JSONObject b) throws Exception {
        JSONArray ev = new JSONArray(alm.leer("eventos") == null ? "[]" : alm.leer("eventos"));
        if (r.equals("/api/calendar") && m.equals("POST")) {
            long s = java.time.Instant.parse(b.getString("start")).toEpochMilli(), e = b.has("end") && !b.isNull("end") ? java.time.Instant.parse(b.getString("end")).toEpochMilli() : s + 3600_000;
            JSONObject x = new JSONObject().put("id", UUID.randomUUID().toString().substring(0, 8)).put("title", b.optString("title")).put("start", s).put("end", e).put("allDay", b.optBoolean("allDay")).put("location", b.optString("location")).put("via", "manual").put("reminded", new JSONArray()).put("created", System.currentTimeMillis());
            ev.put(x); alm.guardar("eventos", ev.toString()); return ok(new JSONObject().put("event", x).put("duplicate", false));
        }
        if (r.startsWith("/api/calendar/")) {
            String id = r.substring("/api/calendar/".length()); JSONArray n = new JSONArray();
            for (int i = 0; i < ev.length(); i++) { JSONObject x = ev.getJSONObject(i); if (!x.getString("id").equals(id)) n.put(x); else if (m.equals("PUT")) { if (b.has("title")) x.put("title", b.getString("title")); if (b.has("start")) x.put("start", java.time.Instant.parse(b.getString("start")).toEpochMilli()); if (b.has("end")) x.put("end", java.time.Instant.parse(b.getString("end")).toEpochMilli()); if (b.has("location")) x.put("location", b.getString("location")); n.put(x); } }
            alm.guardar("eventos", n.toString()); return ok("{\"ok\":true}");
        }
        long from = q.containsKey("from") ? Long.parseLong(q.get("from")) : 0, to = q.containsKey("to") ? Long.parseLong(q.get("to")) : Long.MAX_VALUE; JSONArray out = new JSONArray();
        for (int i = 0; i < ev.length(); i++) { JSONObject x = ev.getJSONObject(i); if (x.getLong("end") > from && x.getLong("start") < to) out.put(x); }
        return ok(new JSONObject().put("events", out).put("tz", java.util.TimeZone.getDefault().getID()));
    }
}
