package app.casamail.movil;

import java.net.URI;
import java.util.Locale;

/** Interpreta lo que escribe el usuario: dirección del servidor y clave. Sin dependencias de Android (se prueba con javac). */
final class Conexion {
    final String servidor, token, error;
    private Conexion(String s, String t, String e) { servidor = s; token = t; error = e; }

    private static String tokenDe(String s) {
        int i = s.indexOf("?t="); if (i < 0) i = s.indexOf("&t=");
        if (i < 0) return null;
        String x = s.substring(i + 3); int e = x.indexOf('&'); if (e >= 0) x = x.substring(0, e);
        int h = x.indexOf('#'); if (h >= 0) x = x.substring(0, h);
        return x;
    }

    /** Acepta "host", "https://host", "https://host:8443/loquesea" o el enlace completo "https://host/?t=CLAVE". */
    static Conexion de(String urlTxt, String tokenTxt) {
        String u = urlTxt == null ? "" : urlTxt.trim(), t = tokenTxt == null ? "" : tokenTxt.trim();
        if (u.isEmpty()) return new Conexion(null, null, "Escribe la dirección de tu CasaMail.");
        String enLink = tokenDe(u); if (enLink == null) enLink = tokenDe(t);
        if (enLink != null) t = enLink;
        if (!u.matches("(?i)^[a-z][a-z0-9+.-]*://.*")) u = "https://" + u;
        URI uri;
        try { uri = new URI(u); } catch (Exception e) { return new Conexion(null, null, "La dirección no es válida."); }
        if (!"https".equals(uri.getScheme() == null ? null : uri.getScheme().toLowerCase(Locale.ROOT)))
            return new Conexion(null, null, "Por seguridad la dirección debe empezar por https:// (usa Tailscale Serve o un túnel; mira la guía).");
        if (uri.getHost() == null || uri.getHost().isEmpty()) return new Conexion(null, null, "La dirección no es válida.");
        if (!t.matches("[A-Za-z0-9]{16,128}")) return new Conexion(null, null, "La clave de acceso no es válida (son letras y números, sin espacios).");
        return new Conexion("https://" + uri.getHost().toLowerCase(Locale.ROOT) + (uri.getPort() > 0 ? ":" + uri.getPort() : ""), t, null);
    }
}
