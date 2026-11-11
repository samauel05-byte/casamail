package app.casamail.movil.core;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Firmas con imagen: añade la firma al mensaje (texto + HTML) y convierte las imágenes incrustadas en adjuntos "cid:" (se ven en Gmail, Outlook…). */
public final class Firma {
    private Firma() { }

    private static final Pattern IMG_DATOS = Pattern.compile("src=\"data:image/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)\"", Pattern.CASE_INSENSITIVE);
    private static final SecureRandom RND = new SecureRandom();

    public static String esc(String s) { return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }

    public static String textoAHtml(String t) {
        String e = esc(t).replaceAll("(https?://[^\\s<]+[^\\s<.,;:!?)\"'])", "<a href=\"$1\">$1</a>").replace("\n", "<br>");
        return "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45\">" + e + "</div>";
    }

    /** Limpieza básica del HTML de una firma (la escribe el propio usuario): fuera scripts, formularios, manejadores de eventos y enlaces javascript. */
    public static String limpiar(String html) {
        if (html == null) return "";
        String s = html.replaceAll("(?is)<(script|style|iframe|object|embed|form|link|meta)[^>]*>.*?</\\1>", "").replaceAll("(?is)<(script|style|iframe|object|embed|form|link|meta|input|button)[^>]*/?>", "");
        s = s.replaceAll("(?i)\\son[a-z]+\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)", "").replaceAll("(?i)(href|src)\\s*=\\s*(\"|')\\s*javascript:[^\"']*(\"|')", "$1=\"#\"");
        return s.length() > 600_000 ? s.substring(0, 600_000) : s;
    }

    public static String aTexto(String html) {
        return html.replaceAll("(?is)<(script|style)[^>]*>.*?</\\1>", "").replaceAll("(?i)<br\\s*/?>|</p>|</div>|</tr>|</li>|</h[1-6]>", "\n").replaceAll("(?i)</t[dh]>", "  ")
                .replaceAll("<[^>]+>", "").replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replaceAll("[ \\t]+\\n", "\n").replaceAll("\n{3,}", "\n\n").trim();
    }

    /** Sustituye las imágenes data: por cid: y añade cada imagen (una sola vez) a `adjuntos`. */
    public static String imagenesCid(String html, JSONArray adjuntos) throws JSONException {
        Matcher m = IMG_DATOS.matcher(html); StringBuffer sb = new StringBuffer(); Map<String, String> vistos = new HashMap<>(); int n = 0;
        while (m.find()) {
            String tipo = m.group(1).toLowerCase(), b64 = m.group(2), cid = vistos.get(b64);
            if (cid == null) {
                byte[] r = new byte[4]; RND.nextBytes(r); StringBuilder h = new StringBuilder(); for (byte x : r) h.append(String.format("%02x", x));
                cid = "firma" + (++n) + "-" + h + "@casamail"; vistos.put(b64, cid);
                String ext = tipo.equals("jpeg") ? "jpg" : tipo;
                adjuntos.put(new JSONObject().put("filename", "imagen" + n + "." + ext).put("content", b64).put("cid", cid).put("contentType", "image/" + (ext.equals("jpg") ? "jpeg" : ext)));
            }
            m.appendReplacement(sb, Matcher.quoteReplacement("src=\"cid:" + cid + "\""));
        }
        m.appendTail(sb); return sb.toString();
    }

    /**
     * Añade la firma al mensaje del usuario. `cita` (respuestas) va DESPUÉS de la firma. Sin firma, el mensaje queda en texto plano.
     * @param payload {to, subject, text, attachments…}; se rellenan `text`, `html` y `attachments`.
     */
    public static JSONObject conFirma(JSONObject payload, JSONObject firma, String citaTexto, String citaHtml) throws JSONException {
        String cuerpo = payload.optString("text", "");
        if (firma == null) { if (citaTexto != null) payload.put("text", cuerpo + "\n\n" + citaTexto); return payload; }
        JSONArray adj = payload.optJSONArray("attachments"); if (adj == null) adj = new JSONArray();
        String fhtml = imagenesCid(firma.optString("html", ""), adj);
        String ftexto = firma.optString("text", "").isEmpty() ? aTexto(firma.optString("html", "")) : firma.optString("text");
        payload.put("text", cuerpo + "\n\n-- \n" + ftexto + (citaTexto != null ? "\n\n" + citaTexto : ""));
        payload.put("html", textoAHtml(cuerpo) + "<br><div class=\"firma\">" + fhtml + "</div>" + (citaHtml != null ? "<br>" + citaHtml : ""));
        payload.put("attachments", adj);
        return payload;
    }
}
