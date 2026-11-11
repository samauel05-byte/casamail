package app.casamail.movil;

import android.content.ContentValues;
import android.content.Context;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import app.casamail.movil.core.Api;

/** Puente entre la interfaz web y el motor de correo del propio móvil (sin servidor). La web llama a `CasaNative.llamar(...)`; la respuesta vuelve con `__casaRes(...)`. */
final class Nativo {
    private static Api api;
    private static final ExecutorService HILOS = Executors.newFixedThreadPool(4);

    static synchronized Api api(Context c) {
        if (api == null) {
            String v = "0"; try { v = c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception ignored) { }
            api = new Api(new AlmacenSeguro(c.getApplicationContext()), v);
        }
        return api;
    }

    static boolean hayCuentas(Context c) { try { return !api(c).cuentas().isEmpty(); } catch (Exception e) { return false; } }

    private final Api motor; private final WebView web;
    Nativo(Context c, WebView web) { this.motor = api(c); this.web = web; }

    @JavascriptInterface public void llamar(final int id, final String metodo, final String url, final String cuerpo) {
        HILOS.execute(() -> {
            Api.Respuesta r;
            try { r = motor.manejar(metodo, url, cuerpo); } catch (Throwable t) { r = null; }
            final int estado = r == null ? 500 : r.estado;
            final String json = r == null ? "{\"error\":\"Error interno\"}" : (r.json != null ? r.json : "{}");
            web.post(() -> web.evaluateJavascript("__casaRes(" + id + "," + estado + "," + JSONObject.quote(json) + ")", null));
        });
    }

    /** Descargas (adjuntos): peticiones GET a /api/… se sirven directamente desde el motor. */
    WebResourceResponse servir(Uri u) {
        try {
            String ruta = u.getEncodedPath() + (u.getEncodedQuery() == null ? "" : "?" + u.getEncodedQuery());
            Api.Respuesta r = motor.manejar("GET", ruta, "");
            Map<String, String> h = new HashMap<>(); h.put("Cache-Control", "no-store");
            byte[] datos = r.datos != null ? r.datos : (r.json == null ? new byte[0] : r.json.getBytes("UTF-8"));
            if (r.datos != null) h.put("Content-Disposition", "attachment; filename=\"" + (r.nombre == null ? "adjunto" : r.nombre.replace("\"", "")) + "\"");
            return new WebResourceResponse(r.datos != null ? (r.tipo == null ? "application/octet-stream" : r.tipo) : "application/json", "UTF-8", r.estado, r.estado == 200 ? "OK" : "Error", h, new ByteArrayInputStream(datos));
        } catch (Exception e) { return new WebResourceResponse("text/plain", "UTF-8", 500, "Error", null, new ByteArrayInputStream(new byte[0])); }
    }

    /** Guarda un adjunto o un .eml en Descargas. Devuelve el nombre del archivo, o null si falla. */
    String descargar(Context c, Uri u) {
        try {
            String ruta = u.getEncodedPath() + (u.getEncodedQuery() == null ? "" : "?" + u.getEncodedQuery());
            Api.Respuesta r = motor.manejar("GET", ruta, "");
            if (r.estado != 200 || r.datos == null) return null;
            String nombre = (r.nombre == null || r.nombre.isEmpty() ? "adjunto" : r.nombre).replaceAll("[\\\\/:*?\"<>|]", "_");
            java.io.OutputStream o;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues(); v.put(MediaStore.Downloads.DISPLAY_NAME, nombre); v.put(MediaStore.Downloads.MIME_TYPE, r.tipo == null ? "application/octet-stream" : r.tipo);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri d = c.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v); if (d == null) return null;
                o = c.getContentResolver().openOutputStream(d);
            } else {
                java.io.File dir = c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS); if (dir == null) return null; dir.mkdirs();
                o = new java.io.FileOutputStream(new java.io.File(dir, nombre));
            }
            try { o.write(r.datos); } finally { o.close(); }
            return nombre;
        } catch (Exception e) { return null; }
    }
}
