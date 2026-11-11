package app.casamail.movil.core;

import com.sun.mail.imap.IMAPFolder;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.mail.Address;
import javax.mail.AuthenticationFailedException;
import javax.mail.BodyPart;
import javax.mail.FetchProfile;
import javax.mail.Flags;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.MessagingException;
import javax.mail.Multipart;
import javax.mail.Part;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.Transport;
import javax.mail.UIDFolder;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeBodyPart;
import javax.mail.internet.MimeMessage;
import javax.mail.internet.MimeMultipart;
import javax.mail.internet.MimeUtility;
import javax.mail.search.AndTerm;
import javax.mail.search.BodyTerm;
import javax.mail.search.FlagTerm;
import javax.mail.search.FromStringTerm;
import javax.mail.search.OrTerm;
import javax.mail.search.SearchTerm;
import javax.mail.search.SubjectTerm;
import javax.activation.DataHandler;
import javax.mail.util.ByteArrayDataSource;

/**
 * Motor de correo de la app Android: habla directamente con el servidor (IMAP para leer, SMTP para enviar), sin ningún PC de por medio.
 * No depende de Android (se prueba en un ordenador contra un servidor de pruebas).
 */
public final class Correo {
    /** Error con un mensaje listo para enseñar al usuario. */
    public static final class ErrorCorreo extends Exception {
        public final String codigo;
        public ErrorCorreo(String msg, String codigo) { super(msg); this.codigo = codigo; }
    }

    private final Map<String, Store> stores = new HashMap<>();
    private final Map<String, Object> cerrojos = new HashMap<>();
    private final Map<String, JSONArray> carpetasCache = new HashMap<>();
    private final Map<String, Long> carpetasCacheT = new HashMap<>();

    private synchronized Object cerrojo(Cuenta c) { Object o = cerrojos.get(c.id); if (o == null) { o = new Object(); cerrojos.put(c.id, o); } return o; }

    // ---------- conexión ----------
    private Session sesion(Cuenta c) {
        Properties p = new Properties();
        String pr = c.imapSeguro ? "imaps" : "imap";
        p.put("mail." + pr + ".connectiontimeout", "15000"); p.put("mail." + pr + ".timeout", "40000"); p.put("mail." + pr + ".writetimeout", "40000");
        p.put("mail.mime.decodetext.strict", "false"); p.put("mail.mime.address.strict", "false");
        p.put("mail.imap.partialfetch", "true"); p.put("mail.imaps.partialfetch", "true");
        if (!c.imapSeguro && c.imapPuerto == 143) p.put("mail.imap.starttls.enable", "true");
        p.put("mail.smtp.connectiontimeout", "15000"); p.put("mail.smtp.timeout", "40000"); p.put("mail.smtp.writetimeout", "40000");
        p.put("mail.smtp.auth", "true");
        if (c.smtpSeguro) p.put("mail.smtp.ssl.enable", "true"); else if (c.smtpPuerto == 587) { p.put("mail.smtp.starttls.enable", "true"); p.put("mail.smtp.starttls.required", "true"); }
        return Session.getInstance(p);
    }

    private Store store(Cuenta c) throws ErrorCorreo {
        Store s = stores.get(c.id);
        try {
            if (s != null && s.isConnected()) return s;
            Store st = sesion(c).getStore(c.imapSeguro ? "imaps" : "imap");
            st.connect(c.imapHost, c.imapPuerto, c.usuario, c.clave);
            stores.put(c.id, st); carpetasCache.remove(c.id);
            return st;
        } catch (AuthenticationFailedException e) {
            throw new ErrorCorreo("Usuario o contraseña incorrectos. Gmail, Yahoo e iCloud exigen una contraseña de aplicación, no la normal.", "reauth");
        } catch (MessagingException e) {
            throw new ErrorCorreo("No se pudo conectar con el servidor de correo (" + c.imapHost + "): " + causa(e), "conexion");
        }
    }
    public void cerrar(Cuenta c) { Store s = stores.remove(c.id); if (s != null) try { s.close(); } catch (MessagingException ignored) { } carpetasCache.remove(c.id); }
    public void cerrarTodo() { for (String id : new ArrayList<>(stores.keySet())) { try { stores.remove(id).close(); } catch (Exception ignored) { } } }
    private static String causa(Throwable e) { Throwable t = e; while (t.getCause() != null && t.getCause() != t) t = t.getCause(); return t.getMessage() != null ? t.getMessage() : t.getClass().getSimpleName(); }

    /** Comprueba que los datos sirven: entra por IMAP y comprueba el acceso al servidor de envío (SMTP). */
    public void probar(Cuenta c) throws ErrorCorreo {
        cerrar(c); store(c).isConnected();
        try { Transport t = sesion(c).getTransport("smtp"); t.connect(c.smtpHost, c.smtpPuerto, c.usuario, c.clave); t.close(); }
        catch (AuthenticationFailedException e) { throw new ErrorCorreo("El servidor de envío rechazó el usuario o la contraseña.", "reauth"); }
        catch (MessagingException e) { throw new ErrorCorreo("No se pudo conectar con el servidor de envío (" + c.smtpHost + "): " + causa(e), "conexion"); }
    }

    // ---------- utilidades ----------
    private static final SimpleDateFormat ISO = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
    static { ISO.setTimeZone(TimeZone.getTimeZone("UTC")); }
    private static synchronized String iso(Date d) { return d == null ? null : ISO.format(d); }
    private static String dir(Address[] as) {
        if (as == null || as.length == 0) return "";
        StringBuilder sb = new StringBuilder();
        for (Address a : as) {
            if (sb.length() > 0) sb.append(", ");
            if (a instanceof InternetAddress) {
                InternetAddress ia = (InternetAddress) a; String n = ia.getPersonal();
                try { if (n != null) n = MimeUtility.decodeText(n); } catch (Exception ignored) { }
                sb.append(n != null && !n.isEmpty() ? n + " <" + ia.getAddress() + ">" : String.valueOf(ia.getAddress()));
            } else sb.append(a);
        }
        return sb.toString();
    }
    private static String decod(String s) { try { return s == null ? "" : MimeUtility.decodeText(s); } catch (Exception e) { return s; } }

    private static final Pattern RE_TRASH = Pattern.compile("trash|papelera|basura|eliminados|deleted", Pattern.CASE_INSENSITIVE),
            RE_SENT = Pattern.compile("sent|enviad", Pattern.CASE_INSENSITIVE), RE_DRAFT = Pattern.compile("draft|borrador", Pattern.CASE_INSENSITIVE),
            RE_JUNK = Pattern.compile("junk|spam|correo no deseado|no deseado", Pattern.CASE_INSENSITIVE), RE_ARCH = Pattern.compile("archive|archivo|all mail|todos", Pattern.CASE_INSENSITIVE);
    private static final Pattern RE_MDN_ORIG = Pattern.compile("Original-Message-ID:\\s*(<[^>]+>)", Pattern.CASE_INSENSITIVE);

    private static String especial(IMAPFolder f) {
        try { for (String a : f.getAttributes()) { String x = a.toLowerCase(Locale.ROOT); for (String k : new String[]{"\\sent", "\\drafts", "\\trash", "\\junk", "\\archive", "\\all"}) if (x.equals(k)) return k.equals("\\all") ? "\\Archive" : "\\" + Character.toUpperCase(k.charAt(1)) + k.substring(2); } } catch (MessagingException ignored) { }
        String n = f.getFullName();
        if (n.equalsIgnoreCase("INBOX")) return "\\Inbox";
        if (RE_TRASH.matcher(n).find()) return "\\Trash"; if (RE_SENT.matcher(n).find()) return "\\Sent"; if (RE_DRAFT.matcher(n).find()) return "\\Drafts";
        if (RE_JUNK.matcher(n).find()) return "\\Junk"; if (RE_ARCH.matcher(n).find()) return "\\Archive";
        return null;
    }

    // ---------- carpetas ----------
    public JSONArray carpetas(Cuenta c) throws ErrorCorreo {
        synchronized (cerrojo(c)) {
            Long t = carpetasCacheT.get(c.id); JSONArray hit = carpetasCache.get(c.id);
            if (hit != null && t != null && System.currentTimeMillis() - t < 15_000) return hit;
            try {
                Store st = store(c); JSONArray out = new JSONArray();
                for (Folder f : st.getDefaultFolder().list("*")) {
                    if ((f.getType() & Folder.HOLDS_MESSAGES) == 0) continue;
                    IMAPFolder imf = (IMAPFolder) f;
                    int total = 0, unread = 0; try { total = f.getMessageCount(); unread = f.getUnreadMessageCount(); } catch (MessagingException ignored) { }
                    out.put(new JSONObject().put("path", f.getFullName()).put("name", f.getName()).put("specialUse", especial(imf) == null ? JSONObject.NULL : especial(imf)).put("total", total).put("unread", unread));
                }
                carpetasCache.put(c.id, out); carpetasCacheT.put(c.id, System.currentTimeMillis());
                return out;
            } catch (MessagingException | JSONException e) { throw new ErrorCorreo("No se pudieron leer las carpetas: " + causa(e), "conexion"); }
        }
    }
    public void invalidarCarpetas(Cuenta c) { carpetasCache.remove(c.id); }

    /** Ruta de la carpeta especial ("\\Trash", "\\Sent"…) o null. */
    public String carpetaEspecial(Cuenta c, String uso) throws ErrorCorreo {
        try { JSONArray a = carpetas(c); for (int i = 0; i < a.length(); i++) if (uso.equals(a.getJSONObject(i).optString("specialUse"))) return a.getJSONObject(i).getString("path"); } catch (JSONException ignored) { }
        return null;
    }

    // ---------- listas de mensajes ----------
    private static final FetchProfile PERFIL = new FetchProfile();
    static { PERFIL.add(FetchProfile.Item.ENVELOPE); PERFIL.add(FetchProfile.Item.FLAGS); PERFIL.add(FetchProfile.Item.CONTENT_INFO); PERFIL.add(UIDFolder.FetchProfileItem.UID); }

    private JSONObject resumen(UIDFolder uf, Message m) throws MessagingException, JSONException {
        boolean adj = false; try { adj = m.isMimeType("multipart/mixed") || m.isMimeType("multipart/signed") || m.isMimeType("multipart/report"); } catch (MessagingException ignored) { }
        return new JSONObject().put("uid", uf.getUID(m)).put("subject", m.getSubject() == null ? "(sin asunto)" : decod(m.getSubject()))
                .put("from", dir(m.getFrom())).put("to", dir(m.getRecipients(Message.RecipientType.TO))).put("date", m.getSentDate() != null ? iso(m.getSentDate()) : m.getReceivedDate() != null ? iso(m.getReceivedDate()) : JSONObject.NULL)
                .put("unread", !m.isSet(Flags.Flag.SEEN)).put("starred", m.isSet(Flags.Flag.FLAGGED)).put("hasAttachments", adj);
    }
    private List<JSONObject> resumenes(IMAPFolder f, Message[] ms) throws MessagingException, JSONException {
        if (ms.length == 0) return new ArrayList<>();
        f.fetch(ms, PERFIL);
        List<JSONObject> out = new ArrayList<>(); for (Message m : ms) out.add(resumen(f, m));
        Collections.sort(out, (a, b) -> b.optString("date", "").compareTo(a.optString("date", "")));
        return out;
    }

    /** Una página de mensajes (los más nuevos primero). `soloNoLeidos`: filtra. Devuelve {total, next, messages}. */
    public JSONObject mensajes(Cuenta c, String carpeta, int limite, int desplazamiento, boolean soloNoLeidos) throws ErrorCorreo {
        limite = Math.max(1, Math.min(limite, 200)); desplazamiento = Math.max(0, desplazamiento);
        synchronized (cerrojo(c)) {
            IMAPFolder f = null;
            try {
                f = (IMAPFolder) store(c).getFolder(carpeta); f.open(Folder.READ_ONLY);
                Message[] pagina; int total;
                if (soloNoLeidos) {
                    Message[] todos = f.search(new FlagTerm(new Flags(Flags.Flag.SEEN), false)); total = todos.length;
                    Arrays.sort(todos, (a, b) -> Integer.compare(b.getMessageNumber(), a.getMessageNumber()));
                    pagina = Arrays.copyOfRange(todos, Math.min(desplazamiento, todos.length), Math.min(todos.length, desplazamiento + limite));
                } else {
                    total = f.getMessageCount(); int hi = total - desplazamiento;
                    pagina = hi < 1 ? new Message[0] : f.getMessages(Math.max(1, hi - limite + 1), hi);
                }
                JSONArray arr = new JSONArray(); for (JSONObject o : resumenes(f, pagina)) arr.put(o);
                return new JSONObject().put("total", total).put("next", desplazamiento + pagina.length).put("messages", arr);
            } catch (MessagingException | JSONException e) { throw new ErrorCorreo("No se pudo leer la carpeta: " + causa(e), "conexion"); }
            finally { cerrarCarpeta(f); }
        }
    }

    /** Búsqueda sencilla: texto (asunto, remitente o cuerpo), destacados, no leídos. */
    public JSONObject buscar(Cuenta c, String carpeta, String texto, boolean destacados, boolean noLeidos, int limite, int desplazamiento) throws ErrorCorreo {
        limite = Math.max(1, Math.min(limite, 200)); desplazamiento = Math.max(0, desplazamiento);
        synchronized (cerrojo(c)) {
            IMAPFolder f = null;
            try {
                f = (IMAPFolder) store(c).getFolder(carpeta); f.open(Folder.READ_ONLY);
                List<SearchTerm> t = new ArrayList<>();
                if (texto != null && !texto.trim().isEmpty()) t.add(new OrTerm(new SearchTerm[]{new SubjectTerm(texto), new FromStringTerm(texto), new BodyTerm(texto)}));
                if (destacados) t.add(new FlagTerm(new Flags(Flags.Flag.FLAGGED), true));
                if (noLeidos) t.add(new FlagTerm(new Flags(Flags.Flag.SEEN), false));
                Message[] found = t.isEmpty() ? f.getMessages() : f.search(t.size() == 1 ? t.get(0) : new AndTerm(t.toArray(new SearchTerm[0])));
                Arrays.sort(found, (a, b) -> Integer.compare(b.getMessageNumber(), a.getMessageNumber()));
                Message[] pagina = Arrays.copyOfRange(found, Math.min(desplazamiento, found.length), Math.min(found.length, desplazamiento + limite));
                JSONArray arr = new JSONArray(); for (JSONObject o : resumenes(f, pagina)) arr.put(o);
                return new JSONObject().put("total", found.length).put("next", desplazamiento + pagina.length).put("messages", arr);
            } catch (MessagingException | JSONException e) { throw new ErrorCorreo("No se pudo buscar: " + causa(e), "conexion"); }
            finally { cerrarCarpeta(f); }
        }
    }

    private static void cerrarCarpeta(Folder f) { if (f != null && f.isOpen()) try { f.close(false); } catch (MessagingException ignored) { } }

    // ---------- leer un mensaje ----------
    private static final class Partes {
        final StringBuilder texto = new StringBuilder(); final StringBuilder html = new StringBuilder();
        final List<Part> adjuntos = new ArrayList<>(); final Map<String, Part> cid = new HashMap<>();
        String dnOriginalId = null; // si es una confirmación de lectura (MDN): el Message-ID del correo original
    }
    private static void recorrer(Part p, Partes out) throws MessagingException, IOException {
        if (p.isMimeType("message/disposition-notification")) { // la parte del acuse de lectura: saca a qué correo confirma
            try { Matcher mt = RE_MDN_ORIG.matcher(new String(leer(p.getInputStream()), "UTF-8")); if (mt.find()) out.dnOriginalId = mt.group(1); } catch (Exception ignored) { }
            return;
        }
        if (p.isMimeType("multipart/*")) { Multipart mp = (Multipart) p.getContent(); for (int i = 0; i < mp.getCount(); i++) recorrer(mp.getBodyPart(i), out); return; }
        if (p.isMimeType("message/rfc822")) { Object o = p.getContent(); if (o instanceof Part) { Partes sub = new Partes(); recorrer((Part) o, sub); out.texto.append(sub.texto); } return; }
        String disp = p.getDisposition(); String nombre = null; try { nombre = p.getFileName(); } catch (Exception ignored) { }
        boolean esAdjunto = Part.ATTACHMENT.equalsIgnoreCase(disp) || (nombre != null && !nombre.isEmpty() && !p.isMimeType("text/plain") && !p.isMimeType("text/html") && !isInlineImage(p));
        if (p.isMimeType("text/plain") && !esAdjunto) { out.texto.append(leerTexto(p)); return; }
        if (p.isMimeType("text/html") && !esAdjunto) { out.html.append(leerTexto(p)); return; }
        String[] ids = p.getHeader("Content-ID");
        if (ids != null && ids.length > 0 && p.isMimeType("image/*")) { out.cid.put(ids[0].replaceAll("[<>]", "").trim(), p); return; }
        if (esAdjunto || nombre != null) out.adjuntos.add(p);
    }
    private static boolean isInlineImage(Part p) throws MessagingException { String[] ids = p.getHeader("Content-ID"); return ids != null && ids.length > 0 && p.isMimeType("image/*") && Part.INLINE.equalsIgnoreCase(p.getDisposition()); }
    private static String leerTexto(Part p) throws MessagingException, IOException {
        try { Object o = p.getContent(); if (o instanceof String) return (String) o; if (o instanceof InputStream) return new String(leer((InputStream) o), "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { return new String(leer(p.getInputStream()), "UTF-8"); }
        return "";
    }
    private static byte[] leer(InputStream in) throws IOException { ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0) b.write(buf, 0, n); in.close(); return b.toByteArray(); }

    private static String aTextoPlano(String html) {
        return html.replaceAll("(?is)<(script|style)[^>]*>.*?</\\1>", "").replaceAll("(?i)<br\\s*/?>|</p>|</div>|</tr>|</li>", "\n").replaceAll("<[^>]+>", "")
                .replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replaceAll("\n{3,}", "\n\n").trim();
    }

    /** El mensaje completo. `marcarLeido`: lo marca como leído en el servidor. */
    public JSONObject mensaje(Cuenta c, String carpeta, long uid, boolean marcarLeido) throws ErrorCorreo {
        synchronized (cerrojo(c)) {
            IMAPFolder f = null;
            try {
                f = (IMAPFolder) store(c).getFolder(carpeta); f.open(marcarLeido ? Folder.READ_WRITE : Folder.READ_ONLY);
                Message m = f.getMessageByUID(uid); if (m == null) throw new ErrorCorreo("El mensaje ya no existe en el servidor.", "no_existe");
                Partes ps = new Partes(); recorrer(m, ps);
                String html = ps.html.length() > 0 ? ps.html.toString() : null;
                if (html != null) { // las imágenes incrustadas (cid:) se convierten en datos para poder verlas
                    for (Map.Entry<String, Part> e : ps.cid.entrySet()) {
                        Part ip = e.getValue(); if (ip.getSize() > 400_000) continue;
                        String ct = ip.getContentType().split(";")[0].trim().toLowerCase(Locale.ROOT);
                        html = html.replace("cid:" + e.getKey(), "data:" + ct + ";base64," + Base64.getEncoder().encodeToString(leer(ip.getInputStream())));
                    }
                    if (html.length() > 1_500_000) html = html.substring(0, 1_500_000);
                }
                String texto = (ps.texto.length() > 0 ? ps.texto.toString() : html != null ? aTextoPlano(html) : "").replace("\r\n", "\n"); // el servidor separa líneas con \r\n
                JSONArray adj = new JSONArray(); int i = 0;
                for (Part a : ps.adjuntos) { String n = a.getFileName(); adj.put(new JSONObject().put("index", i++).put("filename", n == null ? "adjunto-" + i : decod(n)).put("contentType", a.getContentType().split(";")[0].trim()).put("size", Math.max(0, a.getSize()))); }
                if (marcarLeido && !m.isSet(Flags.Flag.SEEN)) m.setFlag(Flags.Flag.SEEN, true);
                String[] refs = m.getHeader("References"); JSONArray rf = new JSONArray(); if (refs != null && refs.length > 0) for (String r : refs[0].trim().split("\\s+")) if (!r.isEmpty()) rf.put(r);
                String[] mid = m.getHeader("Message-ID");
                String[] dnt = m.getHeader("Disposition-Notification-To");
                return new JSONObject().put("uid", uid).put("subject", m.getSubject() == null ? "(sin asunto)" : decod(m.getSubject())).put("from", dir(m.getFrom())).put("to", dir(m.getRecipients(Message.RecipientType.TO)))
                        .put("cc", dir(m.getRecipients(Message.RecipientType.CC))).put("date", m.getSentDate() != null ? iso(m.getSentDate()) : JSONObject.NULL).put("unread", false).put("starred", m.isSet(Flags.Flag.FLAGGED))
                        .put("hasAttachments", adj.length() > 0).put("messageId", mid != null && mid.length > 0 ? mid[0] : JSONObject.NULL).put("references", rf)
                        .put("dispositionNotificationTo", dnt != null && dnt.length > 0 ? decod(dnt[0]) : JSONObject.NULL).put("mdnFor", ps.dnOriginalId != null ? ps.dnOriginalId : JSONObject.NULL)
                        .put("text", texto).put("html", html == null ? JSONObject.NULL : html).put("attachments", adj);
            } catch (MessagingException | JSONException | IOException e) { throw new ErrorCorreo("No se pudo abrir el mensaje: " + causa(e), "conexion"); }
            finally { cerrarCarpeta(f); }
        }
    }

    /** Contenido de un adjunto: {nombre, tipo, bytes}. */
    public Object[] adjunto(Cuenta c, String carpeta, long uid, int indice) throws ErrorCorreo {
        synchronized (cerrojo(c)) {
            IMAPFolder f = null;
            try {
                f = (IMAPFolder) store(c).getFolder(carpeta); f.open(Folder.READ_ONLY);
                Message m = f.getMessageByUID(uid); if (m == null) throw new ErrorCorreo("El mensaje ya no existe.", "no_existe");
                Partes ps = new Partes(); recorrer(m, ps);
                if (indice < 0 || indice >= ps.adjuntos.size()) throw new ErrorCorreo("Adjunto no encontrado.", "no_existe");
                Part a = ps.adjuntos.get(indice); String n = a.getFileName();
                return new Object[]{n == null ? "adjunto-" + indice : decod(n), a.getContentType().split(";")[0].trim(), leer(a.getInputStream())};
            } catch (MessagingException | IOException e) { throw new ErrorCorreo("No se pudo descargar el adjunto: " + causa(e), "conexion"); }
            finally { cerrarCarpeta(f); }
        }
    }

    // ---------- cambios ----------
    public void marcar(Cuenta c, String carpeta, long uid, Boolean leido, Boolean destacado) throws ErrorCorreo {
        synchronized (cerrojo(c)) {
            IMAPFolder f = null;
            try {
                f = (IMAPFolder) store(c).getFolder(carpeta); f.open(Folder.READ_WRITE);
                Message m = f.getMessageByUID(uid); if (m == null) return;
                if (leido != null) m.setFlag(Flags.Flag.SEEN, leido); if (destacado != null) m.setFlag(Flags.Flag.FLAGGED, destacado);
                invalidarCarpetas(c);
            } catch (MessagingException e) { throw new ErrorCorreo("No se pudo guardar el cambio: " + causa(e), "conexion"); }
            finally { cerrarCarpeta(f); }
        }
    }

    /** Mueve un mensaje a otra carpeta (copiar + borrar el original). */
    public void mover(Cuenta c, String carpeta, long uid, String destino) throws ErrorCorreo {
        synchronized (cerrojo(c)) {
            IMAPFolder f = null;
            try {
                Store st = store(c); f = (IMAPFolder) st.getFolder(carpeta); f.open(Folder.READ_WRITE);
                Message m = f.getMessageByUID(uid); if (m == null) return;
                Folder d = st.getFolder(destino); if (!d.exists()) d.create(Folder.HOLDS_MESSAGES);
                f.copyMessages(new Message[]{m}, d);
                m.setFlag(Flags.Flag.DELETED, true);
                try { f.expunge(new Message[]{m}); } catch (MessagingException e) { f.expunge(); }
                invalidarCarpetas(c);
            } catch (MessagingException e) { throw new ErrorCorreo("No se pudo mover el mensaje: " + causa(e), "conexion"); }
            finally { cerrarCarpeta(f); }
        }
    }

    /** Papelera: mueve a la papelera; si ya está en ella (o no hay), lo borra definitivamente. */
    public void papelera(Cuenta c, String carpeta, long uid) throws ErrorCorreo {
        String t = carpetaEspecial(c, "\\Trash");
        if (t != null && !t.equals(carpeta)) { mover(c, carpeta, uid, t); return; }
        synchronized (cerrojo(c)) {
            IMAPFolder f = null;
            try { f = (IMAPFolder) store(c).getFolder(carpeta); f.open(Folder.READ_WRITE); Message m = f.getMessageByUID(uid); if (m != null) { m.setFlag(Flags.Flag.DELETED, true); try { f.expunge(new Message[]{m}); } catch (MessagingException e) { f.expunge(); } } invalidarCarpetas(c); }
            catch (MessagingException e) { throw new ErrorCorreo("No se pudo borrar: " + causa(e), "conexion"); }
            finally { cerrarCarpeta(f); }
        }
    }

    public void crearCarpeta(Cuenta c, String nombre) throws ErrorCorreo {
        synchronized (cerrojo(c)) { try { Folder f = store(c).getFolder(nombre); if (!f.exists()) f.create(Folder.HOLDS_MESSAGES); invalidarCarpetas(c); } catch (MessagingException e) { throw new ErrorCorreo("No se pudo crear la carpeta: " + causa(e), "conexion"); } }
    }

    // ---------- enviar ----------
    /** Construye el mensaje a partir de los datos de la interfaz: {to, cc, bcc, subject, text, html, inReplyTo, references[], attachments[{filename, content(base64), cid?, contentType?}]}. */
    public MimeMessage construir(Cuenta c, JSONObject d) throws ErrorCorreo {
        try {
            MimeMessage msg = new MimeMessage(sesion(c));
            msg.setFrom(new InternetAddress(c.email));
            String to = d.optString("to"), cc = d.optString("cc"), bcc = d.optString("bcc");
            if (to.trim().isEmpty()) throw new ErrorCorreo("Falta el destinatario.", "datos");
            msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to, false));
            if (!cc.trim().isEmpty()) msg.setRecipients(Message.RecipientType.CC, InternetAddress.parse(cc, false));
            if (!bcc.trim().isEmpty()) msg.setRecipients(Message.RecipientType.BCC, InternetAddress.parse(bcc, false));
            msg.setSubject(d.optString("subject"), "UTF-8"); msg.setSentDate(new Date());
            if (d.optBoolean("readReceipt")) { msg.setHeader("Disposition-Notification-To", c.email); msg.setHeader("Return-Receipt-To", c.email); } // pedir confirmación de lectura
            if (d.optString("inReplyTo").length() > 0) msg.setHeader("In-Reply-To", d.getString("inReplyTo"));
            JSONArray refs = d.optJSONArray("references"); if (refs != null && refs.length() > 0) { StringBuilder sb = new StringBuilder(); for (int i = 0; i < refs.length(); i++) sb.append(i > 0 ? " " : "").append(refs.getString(i)); msg.setHeader("References", sb.toString()); }
            String texto = d.optString("text", ""), html = d.optString("html", "");
            List<MimeBodyPart> cids = new ArrayList<>(), files = new ArrayList<>();
            JSONArray adj = d.optJSONArray("attachments");
            if (adj != null) for (int i = 0; i < adj.length(); i++) {
                JSONObject a = adj.getJSONObject(i); byte[] bytes = Base64.getDecoder().decode(a.optString("content"));
                String ct = a.optString("contentType", ""); if (ct.isEmpty()) ct = "application/octet-stream";
                MimeBodyPart bp = new MimeBodyPart(); bp.setDataHandler(new DataHandler(new ByteArrayDataSource(bytes, ct))); bp.setFileName(MimeUtility.encodeText(a.optString("filename", "adjunto"), "UTF-8", null));
                if (a.optString("cid").length() > 0) { bp.setHeader("Content-ID", "<" + a.getString("cid") + ">"); bp.setDisposition(Part.INLINE); cids.add(bp); } else { bp.setDisposition(Part.ATTACHMENT); files.add(bp); }
            }
            MimeMultipart cuerpo;
            if (html.isEmpty()) { MimeBodyPart t = new MimeBodyPart(); t.setText(texto, "UTF-8"); cuerpo = new MimeMultipart("mixed"); cuerpo.addBodyPart(t); }
            else {
                MimeBodyPart t = new MimeBodyPart(); t.setText(texto, "UTF-8"); MimeBodyPart h = new MimeBodyPart(); h.setContent(html, "text/html; charset=UTF-8");
                MimeMultipart alt = new MimeMultipart("alternative"); alt.addBodyPart(t);
                if (cids.isEmpty()) alt.addBodyPart(h);
                else { MimeMultipart rel = new MimeMultipart("related"); rel.addBodyPart(h); for (MimeBodyPart ci : cids) rel.addBodyPart(ci); MimeBodyPart rp = new MimeBodyPart(); rp.setContent(rel); alt.addBodyPart(rp); }
                MimeBodyPart ap = new MimeBodyPart(); ap.setContent(alt); cuerpo = new MimeMultipart("mixed"); cuerpo.addBodyPart(ap);
            }
            for (MimeBodyPart fb : files) cuerpo.addBodyPart(fb);
            if (cuerpo.getCount() == 1 && files.isEmpty()) { BodyPart only = cuerpo.getBodyPart(0); Object con = only.getContent(); if (con instanceof Multipart) msg.setContent((Multipart) con); else msg.setText(texto, "UTF-8"); }
            else msg.setContent(cuerpo);
            msg.saveChanges();
            return msg;
        } catch (ErrorCorreo e) { throw e;
        } catch (Exception e) { throw new ErrorCorreo("No se pudo preparar el mensaje: " + causa(e), "datos"); }
    }

    /** Envía por SMTP y guarda una copia en Enviados (Gmail ya la guarda solo). */
    public void enviar(Cuenta c, MimeMessage msg) throws ErrorCorreo {
        try {
            Transport t = sesion(c).getTransport("smtp");
            try { t.connect(c.smtpHost, c.smtpPuerto, c.usuario, c.clave); t.sendMessage(msg, msg.getAllRecipients()); }
            finally { try { t.close(); } catch (MessagingException ignored) { } }
        } catch (AuthenticationFailedException e) { throw new ErrorCorreo("El servidor de envío rechazó el usuario o la contraseña.", "reauth");
        } catch (MessagingException e) { throw new ErrorCorreo("No se pudo enviar: " + causa(e), "envio"); }
        if (c.smtpHost.toLowerCase(Locale.ROOT).contains("gmail")) return;
        try { guardarEn(c, "\\Sent", msg, new Flags(Flags.Flag.SEEN)); } catch (ErrorCorreo ignored) { /* el correo salió: la copia es opcional */ }
    }
    /** Envía una confirmación de lectura (MDN) al remitente del correo `orig` ({from, subject, messageId, dispositionNotificationTo}). Devuelve el destino. */
    public String enviarAcuse(Cuenta c, JSONObject orig) throws ErrorCorreo {
        String to;
        MimeMessage msg;
        try {
            String dnt = orig.isNull("dispositionNotificationTo") ? "" : orig.optString("dispositionNotificationTo");
            String destStr = dnt.trim().isEmpty() ? orig.optString("from") : dnt;
            InternetAddress[] da = InternetAddress.parse(destStr, false);
            to = da.length > 0 ? da[0].getAddress() : null;
            if (to == null || !to.contains("@")) throw new ErrorCorreo("El correo no indica a dónde enviar la confirmación.", "datos");
            String subj = orig.optString("subject", "(sin asunto)").replaceAll("[\\r\\n]+", " ");
            String origId = orig.isNull("messageId") ? "" : orig.optString("messageId").trim();
            if (!origId.isEmpty() && !origId.startsWith("<")) origId = "<" + origId + ">";
            String fecha = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss Z", Locale.US).format(new Date());

            msg = new MimeMessage(sesion(c));
            msg.setFrom(new InternetAddress(c.email));
            msg.setRecipients(Message.RecipientType.TO, new InternetAddress[]{new InternetAddress(to)});
            msg.setSubject("Leído: " + subj, "UTF-8"); msg.setSentDate(new Date());

            MimeBodyPart humano = new MimeBodyPart();
            humano.setText("Tu mensaje \"" + subj + "\" fue mostrado (leído) por " + c.email + " el " + fecha + ".\r\n" +
                    "Esto es una confirmación de lectura automática; no asegura que el contenido se haya leído por completo.", "UTF-8");

            StringBuilder sb = new StringBuilder();
            sb.append("Reporting-UA: CasaMail\r\n").append("Final-Recipient: rfc822;").append(c.email).append("\r\n");
            if (!origId.isEmpty()) sb.append("Original-Message-ID: ").append(origId).append("\r\n");
            sb.append("Disposition: manual-action/MDN-sent-manually; displayed\r\n");
            MimeBodyPart notif = new MimeBodyPart();
            notif.setDataHandler(new DataHandler(new ByteArrayDataSource(sb.toString().getBytes("UTF-8"), "message/disposition-notification")));
            notif.setHeader("Content-Type", "message/disposition-notification");

            MimeMultipart mp = new MimeMultipart("report"); mp.addBodyPart(humano); mp.addBodyPart(notif);
            msg.setContent(mp); msg.saveChanges();
            // añade report-type al Content-Type (saveChanges solo deja multipart/report; boundary=...)
            String ct = msg.getContentType(); msg.setHeader("Content-Type", ct.replaceFirst("(?i)multipart/report", "multipart/report; report-type=disposition-notification"));
        } catch (ErrorCorreo e) { throw e; }
        catch (Exception e) { throw new ErrorCorreo("No se pudo preparar la confirmación: " + causa(e), "datos"); }
        try {
            Transport t = sesion(c).getTransport("smtp");
            try { t.connect(c.smtpHost, c.smtpPuerto, c.usuario, c.clave); t.sendMessage(msg, msg.getAllRecipients()); }
            finally { try { t.close(); } catch (MessagingException ignored) { } }
        } catch (AuthenticationFailedException e) { throw new ErrorCorreo("El servidor de envío rechazó el usuario o la contraseña.", "reauth");
        } catch (MessagingException e) { throw new ErrorCorreo("No se pudo enviar la confirmación: " + causa(e), "envio"); }
        return to;
    }
    /** Si el mensaje es una confirmación de lectura (MDN), el Message-ID del correo original; si no, null. */
    private static String mdnDe(Message m) {
        try { if (!m.isMimeType("multipart/report")) return null; Partes ps = new Partes(); recorrer(m, ps); return ps.dnOriginalId; }
        catch (Exception e) { return null; }
    }
    public void guardarBorrador(Cuenta c, MimeMessage msg) throws ErrorCorreo { guardarEn(c, "\\Drafts", msg, new Flags(Flags.Flag.DRAFT)); }
    private void guardarEn(Cuenta c, String uso, MimeMessage msg, Flags flags) throws ErrorCorreo {
        synchronized (cerrojo(c)) {
            try {
                String ruta = carpetaEspecial(c, uso); if (ruta == null) throw new ErrorCorreo("No hay carpeta para guardar.", "datos");
                IMAPFolder f = (IMAPFolder) store(c).getFolder(ruta); msg.setFlags(flags, true); f.appendMessages(new Message[]{msg}); invalidarCarpetas(c);
            } catch (MessagingException e) { throw new ErrorCorreo("No se pudo guardar la copia: " + causa(e), "conexion"); }
        }
    }

    /** Para las notificaciones: mensajes no leídos con UID mayor que `desdeUid` en Recibidos. Devuelve [{uid, from, subject}] y el UID máximo en `max[0]`. */
    public JSONArray nuevos(Cuenta c, long desdeUid, long[] max) throws ErrorCorreo {
        synchronized (cerrojo(c)) {
            IMAPFolder f = null;
            try {
                f = (IMAPFolder) store(c).getFolder("INBOX"); f.open(Folder.READ_ONLY);
                long top = f.getUIDNext() - 1; max[0] = top;
                JSONArray out = new JSONArray(); if (desdeUid < 0 || top <= desdeUid) return out;
                Message[] ms = f.getMessagesByUID(desdeUid + 1, top); ms = ms == null ? new Message[0] : ms; ArrayList<Message> l = new ArrayList<>(); for (Message m : ms) if (m != null) l.add(m);
                f.fetch(l.toArray(new Message[0]), PERFIL);
                for (Message m : l) if (!m.isSet(Flags.Flag.SEEN)) { JSONObject r = resumen(f, m); String mf = mdnDe(m); if (mf != null) r.put("mdnFor", mf); out.put(r); }
                return out;
            } catch (MessagingException | JSONException e) { throw new ErrorCorreo("No se pudo comprobar el correo nuevo: " + causa(e), "conexion"); }
            finally { cerrarCarpeta(f); }
        }
    }
}
