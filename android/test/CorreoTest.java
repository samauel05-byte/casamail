import app.casamail.movil.core.Almacen;
import app.casamail.movil.core.Api;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Base64;
import java.util.Properties;

import javax.mail.Flags;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.internet.MimeMessage;

/**
 * Prueba del motor de correo de la app Android (sin móvil) contra el servidor IMAP/SMTP de pruebas:
 *   npx tsx tests/servers-run.ts &      (en la raíz del repo)
 *   javac -cp <jars> -d out app/src/main/java/app/casamail/movil/core/*.java test/CorreoTest.java && java -cp out:<jars> CorreoTest
 */
public class CorreoTest {
    static int fallos = 0, ok = 0;
    interface Prueba { void run() throws Exception; }
    static void t(String nombre, Prueba r) { try { r.run(); ok++; System.out.println("  ✔ " + nombre); } catch (Throwable e) { fallos++; System.out.println("  ✘ " + nombre + " → " + e); } }
    static void afirmar(boolean c, String m) { if (!c) throw new AssertionError(m); }
    static void igual(Object a, Object b, String m) { if (!String.valueOf(a).equals(String.valueOf(b))) throw new AssertionError(m + ": esperaba " + b + " y obtuve " + a); }

    static Api api = new Api(new Almacen.Memoria(), "test");
    static String llamar(String metodo, String url, String cuerpo) { Api.Respuesta r = api.manejar(metodo, url, cuerpo); if (r.json == null) return "<binario " + r.datos.length + ">"; return r.json; }
    static JSONObject obj(String m, String u, String b) { try { return new JSONObject(llamar(m, u, b)); } catch (Exception e) { throw new RuntimeException(u + " → " + e); } }
    static JSONArray arr(String m, String u, String b) { try { return new JSONArray(llamar(m, u, b)); } catch (Exception e) { throw new RuntimeException(u + " → " + e); } }
    static String cuerpoCuenta(String email, String clave) { return "{\"email\":\"" + email + "\",\"pass\":\"" + clave + "\",\"user\":\"yo\",\"imapHost\":\"127.0.0.1\",\"imapPort\":1143,\"imapSecure\":false,\"smtpHost\":\"127.0.0.1\",\"smtpPort\":1025,\"smtpSecure\":false}"; }

    static Store directo() throws Exception {
        Properties p = new Properties(); Store st = Session.getInstance(p).getStore("imap"); st.connect("127.0.0.1", 1143, "yo", "secreto"); return st;
    }

    public static void main(String[] args) throws Exception {
        System.out.println("Motor de correo de Android (JVM)");
        t("una contraseña mala se rechaza con un mensaje claro (y no guarda la cuenta)", () -> {
            JSONObject e = obj("POST", "/api/accounts", cuerpoCuenta("yo@casa.test", "mala"));
            afirmar(e.optString("error").contains("contraseña"), "mensaje: " + e); igual(e.opt("code"), "reauth", "código"); igual(arr("GET", "/api/accounts", null).length(), 0, "cuentas");
        });
        t("servidor inalcanzable: error claro, sin colgarse", () -> {
            long t0 = System.currentTimeMillis(); JSONObject e = obj("POST", "/api/accounts", cuerpoCuenta("yo@casa.test", "secreto").replace("1143", "1"));
            afirmar(e.optString("error").contains("No se pudo conectar") && System.currentTimeMillis() - t0 < 10_000, e.toString());
        });
        t("iniciar sesión: con los datos buenos se guarda la cuenta", () -> { JSONObject r = obj("POST", "/api/accounts", cuerpoCuenta("yo@casa.test", "secreto")); afirmar(r.optBoolean("ok"), r.toString()); igual(arr("GET", "/api/accounts", null).getJSONObject(0).getString("email"), "yo@casa.test", "email"); });
        t("detecta el servidor por el dominio (Gmail, Yahoo, iCloud…) y avisa de la contraseña de aplicación", () -> {
            JSONObject g = obj("GET", "/api/detect?email=" + "alguien%40gmail.com", null); igual(g.getString("imapHost"), "imap.gmail.com", "gmail"); afirmar(g.getString("nota").contains("contraseña de aplicación") && g.getString("enlaceClaveApp").startsWith("https://"), g.toString());
            igual(obj("GET", "/api/detect?email=a%40yahoo.com", null).getString("imapHost"), "imap.mail.yahoo.com", "yahoo"); igual(obj("GET", "/api/detect?email=a%40icloud.com", null).getString("smtpHost"), "smtp.mail.me.com", "icloud");
            JSONObject otro = obj("GET", "/api/detect?email=a%40miempresa.com", null); afirmar(!otro.getBoolean("conocido") && otro.getString("imapHost").equals("imap.miempresa.com"), otro.toString());
        });
        t("carpetas con sus recuentos y usos (Recibidos, Enviados, Papelera…)", () -> {
            JSONArray f = arr("GET", "/api/folders?account=yo_casa_test", null); boolean inbox = false, trash = false, sent = false;
            for (int i = 0; i < f.length(); i++) { JSONObject x = f.getJSONObject(i); if (x.getString("path").equals("INBOX")) { inbox = true; igual(x.getInt("total"), 3, "total"); } if (x.getString("path").equals("Trash")) trash = x.optString("specialUse").equals("\\Trash"); if (x.getString("path").equals("Sent")) sent = x.optString("specialUse").equals("\\Sent"); }
            afirmar(inbox && trash && sent, f.toString());
        });
        long[] uid = new long[1];
        t("lista de mensajes: asuntos y remitentes con acentos bien leídos, los más nuevos primero", () -> {
            JSONObject r = obj("GET", "/api/messages?account=yo_casa_test&folder=INBOX&limit=50&offset=0", null); igual(r.getInt("total"), 3, "total"); JSONArray m = r.getJSONArray("messages"); igual(m.length(), 3, "página");
            String all = m.toString(); afirmar(all.contains("Presupuesto marzo") && all.contains("Ana Pérez <ana@empresa.com>") && all.contains("Asado el sábado"), all);
            for (int i = 0; i < m.length(); i++) if (m.getJSONObject(i).getString("subject").equals("Presupuesto marzo")) uid[0] = m.getJSONObject(i).getLong("uid");
            afirmar(m.getJSONObject(0).getString("date").compareTo(m.getJSONObject(2).getString("date")) >= 0, "orden");
        });
        t("leer un mensaje: cuerpo con acentos, lo marca como leído en el servidor", () -> {
            JSONObject m = obj("GET", "/api/message/" + uid[0] + "?account=yo_casa_test&folder=INBOX", null); afirmar(m.getString("text").contains("¿Puedes confirmar antes del viernes?") && m.getString("from").contains("Ana Pérez"), m.toString());
            JSONObject un = obj("GET", "/api/messages?account=yo_casa_test&folder=INBOX&unread=1", null); afirmar(!un.getJSONArray("messages").toString().contains("Presupuesto marzo"), "debía quedar leído: " + un);
        });
        t("destacar y quitar el destacado", () -> {
            llamar("POST", "/api/message/" + uid[0] + "/flags?account=yo_casa_test&folder=INBOX", "{\"starred\":true}");
            afirmar(obj("GET", "/api/search?account=yo_casa_test&folder=INBOX&starred=1", null).getJSONArray("messages").length() == 1, "no aparece destacado");
            llamar("POST", "/api/message/" + uid[0] + "/flags?account=yo_casa_test&folder=INBOX", "{\"starred\":false}"); igual(obj("GET", "/api/search?account=yo_casa_test&folder=INBOX&starred=1", null).getJSONArray("messages").length(), 0, "sigue destacado");
        });
        t("buscar por texto (asunto, remitente o cuerpo)", () -> { igual(obj("GET", "/api/search?account=yo_casa_test&folder=INBOX&q=asado", null).getJSONArray("messages").length(), 1, "asado"); igual(obj("GET", "/api/search?account=yo_casa_test&folder=INBOX&q=banco", null).getJSONArray("messages").length(), 1, "banco"); });

        // ----- enviar con firma e imagen, y comprobar lo enviado en la carpeta Enviados -----
        String PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
        t("firma con logo: se guarda, y al enviar el correo sale en HTML con el logo incrustado (cid), con el adjunto del usuario y copia en Enviados", () -> {
            JSONObject f = obj("PUT", "/api/signatures/yo_casa_test", "{\"items\":[{\"name\":\"Principal\",\"html\":\"<script>x()</script><div onclick=\\\"y()\\\"><b>Sam Pérez</b><br><img src=\\\"data:image/png;base64," + PNG + "\\\" width=\\\"80\\\"></div>\"}]}");
            afirmar(!f.toString().contains("script") && !f.toString().contains("onclick") && f.getJSONArray("items").getJSONObject(0).getString("text").contains("Sam Pérez"), f.toString());
            String adj = Base64.getEncoder().encodeToString("datos de prueba".getBytes());
            JSONObject r = obj("POST", "/api/send?account=yo_casa_test", "{\"to\":\"Ana <ana@empresa.com>\",\"subject\":\"Con firma ñandú\",\"text\":\"Hola Ana,\\nTe escribo con mi firma.\",\"now\":true,\"attachments\":[{\"filename\":\"datos.txt\",\"content\":\"" + adj + "\"}]}"); afirmar(r.optBoolean("sent"), r.toString());
            JSONObject s = obj("GET", "/api/messages?account=yo_casa_test&folder=Sent&limit=5", null); JSONObject env = null; for (int i = 0; i < s.getJSONArray("messages").length(); i++) if (s.getJSONArray("messages").getJSONObject(i).getString("subject").equals("Con firma ñandú")) env = s.getJSONArray("messages").getJSONObject(i);
            afirmar(env != null, "no está en Enviados: " + s); JSONObject m = obj("GET", "/api/message/" + env.getLong("uid") + "?account=yo_casa_test&folder=Sent", null);
            afirmar(m.getString("html").contains("Te escribo con mi firma") && m.getString("html").contains("Sam Pérez") && m.getString("html").contains("data:image/png"), "html: " + m.getString("html"));
            afirmar(m.getString("text").contains("-- \nSam Pérez") && m.getString("text").contains("Hola Ana,\nTe escribo"), "texto: " + m.getString("text"));
            igual(m.getJSONArray("attachments").getJSONObject(0).getString("filename"), "datos.txt", "adjunto");
            Api.Respuesta a = api.manejar("GET", "/api/message/" + env.getLong("uid") + "/attachment/0?account=yo_casa_test&folder=Sent", null); igual(new String(a.datos), "datos de prueba", "contenido del adjunto"); igual(a.nombre, "datos.txt", "nombre");
        });
        t("responder: asunto 'Re:', hilo (In-Reply-To/References), firma entre la respuesta y lo citado", () -> {
            llamar("POST", "/api/message/" + uid[0] + "/reply?account=yo_casa_test&folder=INBOX", "{\"text\":\"Confirmado, gracias.\",\"now\":true}");
            JSONObject s = obj("GET", "/api/messages?account=yo_casa_test&folder=Sent&limit=5", null); JSONObject rep = null; for (int i = 0; i < s.getJSONArray("messages").length(); i++) if (s.getJSONArray("messages").getJSONObject(i).getString("subject").equals("Re: Presupuesto marzo")) rep = s.getJSONArray("messages").getJSONObject(i);
            afirmar(rep != null, "no hay respuesta en Enviados"); JSONObject m = obj("GET", "/api/message/" + rep.getLong("uid") + "?account=yo_casa_test&folder=Sent", null); String t = m.getString("text");
            afirmar(t.indexOf("Confirmado") < t.indexOf("-- \nSam") && t.indexOf("-- \nSam") < t.indexOf("escribió:") && t.contains("> Hola, adjunto el presupuesto"), t); afirmar(m.getString("to").contains("ana@empresa.com"), m.getString("to"));
            afirmar(m.getJSONArray("references").toString().contains("m2@x"), "referencias: " + m.getJSONArray("references"));
        });
        t("bandeja de salida: 10 minutos para retirar un envío (retirar = no sale; enviar ya = sale; pasado el plazo sale solo)", () -> {
            int antes = obj("GET", "/api/messages?account=yo_casa_test&folder=Sent&limit=1", null).getInt("total");
            JSONObject q = obj("POST", "/api/send?account=yo_casa_test", "{\"to\":\"ana@empresa.com\",\"subject\":\"Retirable\",\"text\":\"x\"}"); afirmar(q.optBoolean("queued"), q.toString());
            JSONArray o = arr("GET", "/api/outbox", null); igual(o.length(), 1, "en la salida"); afirmar(o.getJSONObject(0).getLong("sendAt") - System.currentTimeMillis() > 9 * 60_000, "plazo ~10 min");
            igual(obj("GET", "/api/messages?account=yo_casa_test&folder=Sent&limit=1", null).getInt("total"), antes, "no debe haber salido aún");
            llamar("DELETE", "/api/outbox/" + q.getString("id"), null); igual(arr("GET", "/api/outbox", null).length(), 0, "retirado");
            JSONObject q2 = obj("POST", "/api/send?account=yo_casa_test", "{\"to\":\"ana@empresa.com\",\"subject\":\"Ahora\",\"text\":\"x\"}"); llamar("POST", "/api/outbox/" + q2.getString("id") + "/now", "{}");
            igual(arr("GET", "/api/outbox", null).length(), 0, "salió"); igual(obj("GET", "/api/messages?account=yo_casa_test&folder=Sent&limit=1", null).getInt("total"), antes + 1, "enviado ya");
            obj("POST", "/api/send?account=yo_casa_test", "{\"to\":\"ana@empresa.com\",\"subject\":\"Por plazo\",\"text\":\"x\"}"); igual(api.procesarBandeja(System.currentTimeMillis()), 0, "aún no toca"); igual(api.procesarBandeja(System.currentTimeMillis() + 11 * 60_000), 1, "pasado el plazo sale solo");
            igual(arr("GET", "/api/outbox", null).length(), 0, "vacía");
        });
        t("papelera y archivo: mueven el mensaje (no lo pierden)", () -> {
            JSONObject l = obj("GET", "/api/messages?account=yo_casa_test&folder=INBOX&limit=10", null); long u = 0; for (int i = 0; i < l.getJSONArray("messages").length(); i++) if (l.getJSONArray("messages").getJSONObject(i).getString("subject").startsWith("Factura")) u = l.getJSONArray("messages").getJSONObject(i).getLong("uid");
            int tr = obj("GET", "/api/messages?account=yo_casa_test&folder=Trash&limit=1", null).getInt("total"); llamar("POST", "/api/message/" + u + "/trash?account=yo_casa_test&folder=INBOX", "{}");
            igual(obj("GET", "/api/messages?account=yo_casa_test&folder=Trash&limit=1", null).getInt("total"), tr + 1, "en papelera"); afirmar(!obj("GET", "/api/messages?account=yo_casa_test&folder=INBOX&limit=10", null).toString().contains("Factura 1234"), "sigue en Recibidos");
        });

        // ----- sin límite de correos: páginas -----
        t("450 correos en una carpeta: se recorren TODOS por páginas de 200, 50 y 37, sin repetir ni saltarse ninguno", () -> {
            llamar("POST", "/api/folders?account=yo_casa_test", "{\"name\":\"Grande\"}");
            try (Store st = directo()) { Folder f = st.getFolder("Grande"); f.open(Folder.READ_WRITE); Message[] lote = new Message[450];
                for (int i = 1; i <= 450; i++) { MimeMessage m = new MimeMessage(Session.getInstance(new Properties())); m.setFrom("P <p@x.com>"); m.setRecipients(Message.RecipientType.TO, "yo@casa.test"); m.setSubject("Grande " + i); m.setSentDate(new java.util.Date(1767225600000L + i * 60_000L)); m.setText("cuerpo " + i); if (i % 2 == 0) m.setFlag(Flags.Flag.SEEN, true); lote[i - 1] = m; }
                f.appendMessages(lote); f.close(false); }
            for (int tam : new int[]{200, 50, 37}) {
                java.util.Set<String> vistos = new java.util.HashSet<>(); int off = 0, total;
                while (true) { JSONObject r = obj("GET", "/api/messages?account=yo_casa_test&folder=Grande&limit=" + tam + "&offset=" + off, null); total = r.getInt("total"); JSONArray ms = r.getJSONArray("messages"); if (ms.length() == 0) break; for (int i = 0; i < ms.length(); i++) vistos.add(ms.getJSONObject(i).getString("subject")); off += ms.length(); if (off >= total) break; }
                igual(total, 450, "total"); igual(vistos.size(), 450, "distintos con páginas de " + tam);
            }
            igual(obj("GET", "/api/messages?account=yo_casa_test&folder=Grande&limit=5", null).getJSONArray("messages").getJSONObject(0).getString("subject"), "Grande 450", "primera página = lo más nuevo");
            JSONObject un = obj("GET", "/api/messages?account=yo_casa_test&folder=Grande&limit=200&unread=1", null); igual(un.getInt("total"), 225, "no leídos");
            JSONObject bus = obj("GET", "/api/search?account=yo_casa_test&folder=Grande&q=cuerpo&limit=200&offset=400", null); igual(bus.getInt("total"), 450, "búsqueda total"); igual(bus.getJSONArray("messages").length(), 50, "última página de la búsqueda");
        });
        t("bandeja unificada de 2 cuentas: páginas coherentes (sin repetir ni saltar)", () -> {
            obj("POST", "/api/accounts", cuerpoCuenta("otra@casa.test", "secreto")); igual(arr("GET", "/api/accounts", null).length(), 2, "dos cuentas");
            int tot = obj("GET", "/api/messages?account=yo_casa_test&folder=INBOX&limit=1", null).getInt("total") * 2; java.util.Set<String> vistos = new java.util.HashSet<>(); int off = 0;
            while (off < tot) { JSONObject r = obj("GET", "/api/unified?limit=" + (off + 4) + "&offset=0", null); JSONArray ms = r.getJSONArray("messages"); vistos.clear(); for (int i = 0; i < ms.length(); i++) vistos.add(ms.getJSONObject(i).getString("account") + "|" + ms.getJSONObject(i).getLong("uid")); igual(vistos.size(), ms.length(), "repetidos"); off += 4; if (ms.length() < off) break; }
            igual(vistos.size(), tot, "todos los correos de las 2 cuentas");
            llamar("DELETE", "/api/accounts/otra_casa_test", null); igual(arr("GET", "/api/accounts", null).length(), 1, "cuenta quitada");
        });
        t("correo nuevo para los avisos: detecta solo lo no leído que llegó después del último visto", () -> {
            long[] max = new long[1]; api.correo().nuevos(api.cuentas().get(0), -1, max); long base = max[0]; afirmar(base > 0, "uid base");
            try (Store st = directo()) { Folder f = st.getFolder("INBOX"); f.open(Folder.READ_WRITE); MimeMessage m = new MimeMessage(Session.getInstance(new Properties())); m.setFrom("Marta <marta@estudio.es>"); m.setRecipients(Message.RecipientType.TO, "yo@casa.test"); m.setSubject("Aviso nuevo"); m.setText("hola"); f.appendMessages(new Message[]{m}); f.close(false); }
            JSONArray n = api.correo().nuevos(api.cuentas().get(0), base, max); igual(n.length(), 1, "uno nuevo"); afirmar(n.getJSONObject(0).getString("subject").equals("Aviso nuevo") && n.getJSONObject(0).getString("from").contains("Marta"), n.toString()); afirmar(max[0] > base, "uid máximo sube");
            igual(api.correo().nuevos(api.cuentas().get(0), max[0], new long[1]).length(), 0, "sin repetir");
        });
        // ----- confirmaciones de lectura (acuses MDN) -----
        t("pedir acuse: el correo enviado lleva la cabecera Disposition-Notification-To", () -> {
            JSONObject r = obj("POST", "/api/send?account=yo_casa_test", "{\"to\":\"ana@empresa.com\",\"subject\":\"Con acuse\",\"text\":\"leelo\",\"now\":true,\"readReceipt\":true}"); afirmar(r.optBoolean("sent"), r.toString());
            JSONArray ms = obj("GET", "/api/messages?account=yo_casa_test&folder=Sent&limit=10", null).getJSONArray("messages"); long u = 0; for (int i = 0; i < ms.length(); i++) if (ms.getJSONObject(i).getString("subject").equals("Con acuse")) u = ms.getJSONObject(i).getLong("uid");
            afirmar(u > 0, "no está en Enviados"); JSONObject m = obj("GET", "/api/message/" + u + "?account=yo_casa_test&folder=Sent", null);
            afirmar(!m.isNull("receiptTo") && m.getString("receiptTo").contains("yo@casa.test"), "falta Disposition-Notification-To: " + m.opt("receiptTo"));
        });
        t("me piden acuse: se detecta (wantsReceipt) y se envía la confirmación al remitente", () -> {
            String raw = "From: Ana <ana@empresa.com>\r\nTo: yo@casa.test\r\nSubject: Necesito acuse\r\nMessage-ID: <pide-1@empresa.com>\r\nDisposition-Notification-To: ana@empresa.com\r\n\r\nAbre esto, por favor.\r\n";
            try (Store st = directo()) { Folder f = st.getFolder("INBOX"); f.open(Folder.READ_WRITE); f.appendMessages(new Message[]{new MimeMessage(Session.getInstance(new Properties()), new java.io.ByteArrayInputStream(raw.getBytes("UTF-8")))}); f.close(false); }
            JSONArray ms = obj("GET", "/api/messages?account=yo_casa_test&folder=INBOX&limit=20", null).getJSONArray("messages"); long u = 0; for (int i = 0; i < ms.length(); i++) if (ms.getJSONObject(i).getString("subject").equals("Necesito acuse")) u = ms.getJSONObject(i).getLong("uid");
            afirmar(u > 0, "no encuentro el mensaje"); JSONObject m = obj("GET", "/api/message/" + u + "?account=yo_casa_test&folder=INBOX", null);
            afirmar(m.optBoolean("wantsReceipt") && m.optString("receiptTo").contains("ana@empresa.com"), "no detecta la petición de acuse: " + m);
            igual(obj("POST", "/api/message/" + u + "/receipt?account=yo_casa_test&folder=INBOX", "{}").optString("to"), "ana@empresa.com", "destino del acuse");
        });
        t("recibir una confirmación: se registra (no se anuncia) y el correo original figura como leído", () -> {
            api.avisos(); // fija la base de 'visto' para esta cuenta
            String origId = "<orig-xyz@casa.test>";
            String mdn = "From: Ana <ana@empresa.com>\r\nTo: yo@casa.test\r\nSubject: Lectura confirmada\r\nMIME-Version: 1.0\r\n" +
                    "Content-Type: multipart/report; report-type=disposition-notification; boundary=\"BB\"\r\n\r\n" +
                    "--BB\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nTu mensaje fue leído.\r\n\r\n" +
                    "--BB\r\nContent-Type: message/disposition-notification\r\n\r\nReporting-UA: X\r\nFinal-Recipient: rfc822;ana@empresa.com\r\nOriginal-Message-ID: " + origId + "\r\nDisposition: manual-action/MDN-sent-manually; displayed\r\n\r\n--BB--\r\n";
            String orig = "From: yo <yo@casa.test>\r\nTo: ana@empresa.com\r\nSubject: Mi mensaje original\r\nMessage-ID: " + origId + "\r\n\r\nhola\r\n";
            try (Store st = directo()) { Folder f = st.getFolder("INBOX"); f.open(Folder.READ_WRITE);
                f.appendMessages(new Message[]{ new MimeMessage(Session.getInstance(new Properties()), new java.io.ByteArrayInputStream(mdn.getBytes("UTF-8"))),
                        new MimeMessage(Session.getInstance(new Properties()), new java.io.ByteArrayInputStream(orig.getBytes("UTF-8"))) }); f.close(false); }
            JSONArray avisos = api.avisos(); afirmar(!avisos.toString().contains("Lectura confirmada"), "el acuse no debe anunciarse como correo: " + avisos);
            JSONArray ms = obj("GET", "/api/messages?account=yo_casa_test&folder=INBOX&limit=30", null).getJSONArray("messages"); long u = 0; for (int i = 0; i < ms.length(); i++) if (ms.getJSONObject(i).getString("subject").equals("Mi mensaje original")) u = ms.getJSONObject(i).getLong("uid");
            afirmar(u > 0, "no encuentro el original"); JSONObject m = obj("GET", "/api/message/" + u + "?account=yo_casa_test&folder=INBOX", null);
            afirmar(!m.isNull("receipt") && m.getJSONObject("receipt").getString("readAt").length() > 0, "el original debería figurar como leído: " + m.opt("receipt"));
        });
        t("si el servidor corta la conexión, se reconecta sola", () -> {
            api.correo().cerrarTodo(); afirmar(obj("GET", "/api/messages?account=yo_casa_test&folder=INBOX&limit=1", null).getInt("total") > 0, "no reconectó");
        });
        t("sin cuentas: mensaje claro (no se rompe)", () -> { llamar("DELETE", "/api/accounts/yo_casa_test", null); JSONObject e = obj("GET", "/api/messages?folder=INBOX", null); afirmar(e.optString("error").contains("Inicia sesión"), e.toString()); });

        System.out.println(fallos == 0 ? "\n" + ok + " OK, 0 fallos" : "\n" + ok + " OK, " + fallos + " fallos");
        System.exit(fallos == 0 ? 0 : 1);
    }
}
