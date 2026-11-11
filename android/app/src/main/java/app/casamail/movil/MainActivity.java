package app.casamail.movil;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.widget.ImageView;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.window.OnBackInvokedDispatcher;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.net.URI;

/**
 * CasaMail para Android: un cliente ligero. El correo, el Archivo local y Yerleny viven en TU CasaMail
 * (en tu PC o en un servidor tuyo); esta app solo lo muestra de forma segura (solo HTTPS) y cómoda en el móvil.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "casamail";
    private static final int REQ_FILE = 7;

    /** true mientras la app está en pantalla: entonces los avisos se ven dentro y no se duplican como notificaciones. */
    static volatile boolean visible;
    private String pendingUid, pendingAccount; // mensaje que abrir al tocar una notificación
    private boolean nativo;                            // modo independiente: el correo se gestiona dentro del móvil, sin servidor
    private Nativo puente;
    private final android.os.Handler reloj = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable bandeja = new Runnable() { @Override public void run() {
        if (nativo) new Thread(() -> { try { Nativo.api(MainActivity.this).procesarBandeja(System.currentTimeMillis()); } catch (Throwable ignored) { } }).start();
        reloj.postDelayed(this, 20000);
    } };
    private boolean demo;                              // modo demostración: datos de ejemplo, sin servidor
    private static final String DEMO_ORIGIN = "https://appassets.androidplatform.net";
    private SharedPreferences prefs;
    private LinearLayout root;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private int pad;

    @Override protected void onStart() { super.onStart(); visible = true; reloj.postDelayed(bandeja, 5000); }
    @Override protected void onStop() { visible = false; reloj.removeCallbacks(bandeja); super.onStop(); }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); leerExtras(i); abrirPendiente(); }

    private void leerExtras(Intent i) {
        long uid = i == null ? 0 : i.getLongExtra("uid", 0); String acc = i == null ? null : i.getStringExtra("account");
        // solo se aceptan valores con forma de identificador: se insertan en una llamada JavaScript
        if (uid > 0 && acc != null && acc.matches("[A-Za-z0-9_.@-]{1,100}")) { pendingUid = String.valueOf(uid); pendingAccount = acc; }
    }
    private void abrirPendiente() {
        if (web == null || pendingUid == null) return;
        final String js = "if (typeof openFromNotif === 'function') openFromNotif({uid:" + pendingUid + ",account:'" + pendingAccount + "'});";
        pendingUid = null; pendingAccount = null;
        web.evaluateJavascript(js, null);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        leerExtras(getIntent());
        // Android 13+ (y obligatorio al apuntar a Android 16): el botón/gesto Atrás se registra así; onBackPressed() ya no se llama.
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::atras);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        // Red de seguridad: si algo cierra la app, guardamos el detalle para mostrarlo en el próximo arranque (no hay forma de verlo si no, sin PC).
        Thread.setDefaultUncaughtExceptionHandler((th, ex) -> { guardarError(ex); android.os.Process.killProcess(android.os.Process.myPid()); });
        pad = dp(16);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        setContentView(root);
        // Android 15 dibuja a pantalla completa: se deja sitio a la barra de estado y a la de navegación.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                top = i.top; bottom = i.bottom;
            } else { top = insets.getSystemWindowInsetTop(); bottom = insets.getSystemWindowInsetBottom(); }
            v.setPadding(0, top, 0, bottom);
            return insets;
        });
        // Si el arranque anterior se cerró solo, mostramos el detalle en vez de volver a intentarlo a ciegas.
        String errPrevio = prefs.getString("ultimo_error", null);
        if (errPrevio != null) { prefs.edit().remove("ultimo_error").apply(); mostrarTraza(errPrevio); return; }
        try {
            String server = prefs.getString("server", null), token = prefs.getString("token", null);
            if (server != null && token != null) openWeb(server, token); else { nativo = true; openWeb(DEMO_ORIGIN, null); }   // sin servidor guardado: la app funciona sola en el móvil
        } catch (Throwable t) { guardarError(t); mostrarTraza(trazaDe(t)); }
    }

    private String trazaDe(Throwable t) { java.io.StringWriter sw = new java.io.StringWriter(); t.printStackTrace(new java.io.PrintWriter(sw)); return sw.toString(); }

    private void guardarError(Throwable t) {
        try {
            String v = ""; try { v = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Throwable ignored) { }
            prefs.edit().putString("ultimo_error", "CasaMail " + v + " · Android " + Build.VERSION.SDK_INT + "\n" + trazaDe(t)).commit();
        } catch (Throwable ignored) { }
    }

    /** Pantalla de diagnóstico: muestra el error del cierre para poder arreglarlo (sin depender de un PC para leer el logcat). */
    private void mostrarTraza(String texto) {
        destroyWeb();
        root.removeAllViews();
        ScrollView sv = new ScrollView(this);
        LinearLayout f = new LinearLayout(this); f.setOrientation(LinearLayout.VERTICAL); f.setPadding(pad, pad, pad, pad); sv.addView(f);
        TextView h = text("CasaMail se cerró. Copia o captura esto y envíalo para arreglarlo:", 16, true); h.setPadding(0, 0, 0, dp(10)); f.addView(h);
        TextView t = text(texto, 12, false); t.setTypeface(Typeface.MONOSPACE); t.setTextIsSelectable(true); f.addView(t);
        Button copiar = boton("Copiar", false);
        copiar.setOnClickListener(v -> { ((android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("CasaMail error", texto)); Toast.makeText(this, "Copiado", Toast.LENGTH_SHORT).show(); });
        LinearLayout.LayoutParams l1 = new LinearLayout.LayoutParams(-1, dp(48)); l1.topMargin = dp(14); f.addView(copiar, l1);
        Button reintentar = boton("Reintentar", true); reintentar.setOnClickListener(v -> recreate());
        LinearLayout.LayoutParams l2 = new LinearLayout.LayoutParams(-1, dp(48)); l2.topMargin = dp(10); f.addView(reintentar, l2);
        root.addView(sv, new LinearLayout.LayoutParams(-1, -1));
    }

    // ---------- pantalla de conexión ----------
    private static final int AZUL = Color.rgb(10, 92, 230), MARINO = Color.rgb(13, 37, 80), GRIS = Color.rgb(96, 108, 130);

    private void showForm(String error, String presetUrl) {
        destroyWeb();
        root.removeAllViews();
        root.setBackgroundColor(Color.rgb(238, 243, 249));
        ScrollView sv = new ScrollView(this);
        LinearLayout f = new LinearLayout(this);
        f.setOrientation(LinearLayout.VERTICAL);
        f.setGravity(Gravity.CENTER_HORIZONTAL);
        f.setPadding(pad * 2, pad * 2, pad * 2, pad * 2);
        sv.addView(f);
        root.addView(sv, new LinearLayout.LayoutParams(-1, -1));

        // cabecera con el logo
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(84), dp(84)); lp.topMargin = dp(16);
        f.addView(logo, lp);
        TextView h = text("CasaMail", 30, true); h.setGravity(Gravity.CENTER); h.setPadding(0, dp(12), 0, dp(4));
        TextView p = text("Tu correo, en tu propio equipo.", 15, false); p.setGravity(Gravity.CENTER); p.setTextColor(GRIS); p.setPadding(0, 0, 0, dp(20));
        f.addView(h); f.addView(p);

        // ver la app sin cuenta ni servidor
        Button demoBtn = boton("Probar con datos de ejemplo", true);
        demoBtn.setOnClickListener(v -> { demo = true; nativo = false; openWeb(DEMO_ORIGIN, null); });
        f.addView(demoBtn, new LinearLayout.LayoutParams(-1, dp(52)));
        TextView nota = text("Sin cuenta ni servidor: para verla y probarla.", 13, false); nota.setGravity(Gravity.CENTER); nota.setTextColor(GRIS); nota.setPadding(0, dp(6), 0, dp(22));
        f.addView(nota);

        Button movil = boton("Iniciar sesión en el móvil", false);
        movil.setOnClickListener(v -> { nativo = true; demo = false; openWeb(DEMO_ORIGIN, null); });
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(-1, dp(52)); mlp.bottomMargin = dp(16); f.addView(movil, mlp);

        // conectar con tu CasaMail
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(16), dp(18), dp(18));
        GradientDrawable fondo = new GradientDrawable(); fondo.setColor(Color.WHITE); fondo.setCornerRadius(dp(18)); fondo.setStroke(dp(1), Color.rgb(221, 229, 239));
        card.setBackground(fondo);
        TextView t2 = text("¿Ya tienes tu CasaMail? Conéctalo", 16, true); t2.setPadding(0, 0, 0, dp(4));
        TextView t3 = text("Está en tu PC o en tu servidor. Tu correo no se guarda en el móvil.", 13, false); t3.setTextColor(GRIS); t3.setPadding(0, 0, 0, dp(8));
        card.addView(t2); card.addView(t3);
        EditText url = field("Dirección (https://…)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        if (presetUrl != null) url.setText(presetUrl);
        EditText tok = field("Clave de acceso o enlace completo", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        card.addView(url); card.addView(tok);
        TextView err = text(error == null ? "" : error, 14, false);
        err.setTextColor(Color.rgb(176, 0, 32)); err.setPadding(0, dp(8), 0, dp(4));
        card.addView(err);
        Button go = boton("Conectar", false);
        go.setOnClickListener(v -> {
            Conexion c = Conexion.de(url.getText().toString(), tok.getText().toString());
            if (c.error != null) { err.setText(c.error); return; }
            prefs.edit().putString("server", c.servidor).putString("token", c.token).apply();
            openWeb(c.servidor, c.token);
        });
        card.addView(go, new LinearLayout.LayoutParams(-1, dp(48)));
        f.addView(card, new LinearLayout.LayoutParams(-1, -2));

        TextView help = text("¿Dónde encuentro esto? Al arrancar CasaMail en tu PC se imprime un enlace con la clave (…/?t=CLAVE). Pégalo aquí entero. Guía paso a paso: github.com/samauel05-byte/casamail (docs/ANDROID.md).", 12, false);
        help.setTextColor(GRIS); help.setPadding(dp(4), dp(18), dp(4), 0);
        f.addView(help);
        TextView cl = text("Desarrollado por CasaLabs", 12, false); cl.setTextColor(GRIS); cl.setGravity(Gravity.CENTER); cl.setPadding(0, dp(18), 0, 0); f.addView(cl);
    }

    /** Botón redondeado de la marca: relleno azul (principal) o con borde azul (secundario). */
    private Button boton(String texto, boolean relleno) {
        Button b = new Button(this);
        b.setText(texto); b.setAllCaps(false); b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16); b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(26));
        if (relleno) { g.setColor(AZUL); b.setTextColor(Color.WHITE); } else { g.setColor(Color.WHITE); g.setStroke(dp(2), AZUL); b.setTextColor(AZUL); }
        b.setBackground(g); b.setStateListAnimator(null);
        return b;
    }

    // ---------- navegador integrado ----------
    private void openWeb(String server, String token) {
        if (!demo) {
            Notifs.canales(this);
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED)
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 21);   // Android 13+: hay que pedir permiso para avisar
            AvisosJob.programar(this);
        }
        root.removeAllViews();
        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(-1, -1));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);        // la interfaz de CasaMail lo necesita (es tu propia página, no contenido de terceros)
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setGeolocationEnabled(false);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, false);
        final String origin = server;
        if (nativo && !demo) { puente = new Nativo(this, web); web.addJavascriptInterface(puente, "CasaNative"); }
        web.setWebViewClient(new WebViewClient() {
            /** En la demostración todo sale de los recursos de la app: no hay red. */
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (!demo && !nativo) return null;
                Uri u = r.getUrl(); String path = u.getPath() == null ? "" : u.getPath();
                if (nativo && puente != null && DEMO_ORIGIN.equals(u.getScheme() + "://" + u.getHost()) && path.startsWith("/api/") && "GET".equals(r.getMethod())) return puente.servir(u);   // adjuntos
                if (!DEMO_ORIGIN.equals(u.getScheme() + "://" + u.getHost()) || !path.startsWith("/demo/") || path.contains("..")) return new WebResourceResponse("text/plain", "UTF-8", 404, "No encontrado", null, new java.io.ByteArrayInputStream(new byte[0]));
                try { return new WebResourceResponse(mime(path), "UTF-8", getAssets().open(path.substring(1))); }
                catch (java.io.IOException e) { return new WebResourceResponse("text/plain", "UTF-8", 404, "No encontrado", null, new java.io.ByteArrayInputStream(new byte[0])); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("casamail-demo-exit".equals(u.getScheme())) { demo = false; nativo = false; showForm(null, prefs.getString("server", null)); return true; }
                if ("casamail-demo-start".equals(u.getScheme())) { demo = true; nativo = false; openWeb(DEMO_ORIGIN, null); return true; }
                if (sameOrigin(u, origin)) return false;
                String sch = u.getScheme() == null ? "" : u.getScheme();
                if (sch.equals("https") || sch.equals("mailto") || sch.equals("tel")) {       // enlaces externos: en el navegador, nunca dentro de la app
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
                }
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (!sameOrigin(Uri.parse(url), origin)) return;
                v.evaluateJavascript("window.casamailAndroid=true;", null);   // la interfaz lo usa para explicar cómo llegan los avisos
                abrirPendiente();
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) fail("No se pudo conectar con " + origin + ". Comprueba que CasaMail está encendido en tu PC y que el túnel/HTTPS está activo.");
            }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse resp) {
                if (!r.isForMainFrame()) return;
                int c = resp.getStatusCode();
                if (c == 401) { prefs.edit().remove("token").apply(); showForm("La clave de acceso ya no es válida. Vuelve a escribirla.", origin); }
                else if (c == 403) fail("El servidor no acepta esta dirección. Añádela a CASAMAIL_ALLOWED_HOSTS en tu CasaMail.");
                else if (c == 429) fail("Demasiados intentos. Espera unos minutos.");
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try { startActivityForResult(p.createIntent(), REQ_FILE); }
                catch (Exception e) { fileCallback = null; return false; }
                return true;
            }
        });
        web.setDownloadListener((url, ua, cd, mime, len) -> {                      // exportar a MBOX, adjuntos…
            try {
                if (!sameOrigin(Uri.parse(url), origin)) return;
                if (nativo && Uri.parse(url).getPath() != null && Uri.parse(url).getPath().startsWith("/api/")) {   // adjunto del correo del propio móvil
                    final Uri du = Uri.parse(url);
                    new Thread(() -> { String nombre = puente == null ? null : puente.descargar(this, du); runOnUiThread(() -> Toast.makeText(this, nombre != null ? "Guardado en Descargas: " + nombre : "No se pudo descargar", Toast.LENGTH_LONG).show()); }).start();
                    return;
                }
                DownloadManager.Request q = new DownloadManager.Request(Uri.parse(url));
                String name = URLUtil.guessFileName(url, cd, mime);
                q.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                q.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                q.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(q);
                Toast.makeText(this, "Descargando " + name, Toast.LENGTH_SHORT).show();
            } catch (Exception e) { Toast.makeText(this, "No se pudo descargar", Toast.LENGTH_SHORT).show(); }
        });
        web.loadUrl(demo ? DEMO_ORIGIN + "/demo/index.html?demo=1" : nativo ? DEMO_ORIGIN + "/demo/index.html" : server + "/?t=" + token);    // el servidor guarda una cookie y redirige a la página sin la clave
    }

    private static String mime(String path) {
        String p = path.toLowerCase(java.util.Locale.ROOT);
        if (p.endsWith(".html")) return "text/html"; if (p.endsWith(".js")) return "text/javascript"; if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png"; if (p.endsWith(".svg")) return "image/svg+xml"; if (p.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    private static boolean sameOrigin(Uri u, String origin) {
        try {
            URI o = new URI(origin);
            int port = u.getPort() == -1 ? 443 : u.getPort(), op = o.getPort() == -1 ? 443 : o.getPort();
            return "https".equals(u.getScheme()) && o.getHost().equalsIgnoreCase(u.getHost()) && port == op;
        } catch (Exception e) { return false; }
    }

    private void fail(String msg) {
        String server = prefs.getString("server", "");
        destroyWeb();
        root.removeAllViews();
        LinearLayout f = new LinearLayout(this);
        f.setOrientation(LinearLayout.VERTICAL);
        f.setGravity(Gravity.CENTER);
        f.setPadding(pad * 2, pad * 2, pad * 2, pad * 2);
        TextView t = text(msg, 16, false);
        t.setGravity(Gravity.CENTER);
        Button retry = boton("Reintentar", true);
        retry.setOnClickListener(v -> { String tk = prefs.getString("token", null); if (tk != null) openWeb(server, tk); else showForm(null, server); });
        Button change = boton("Cambiar servidor", false);
        change.setOnClickListener(v -> showForm(null, server));
        f.addView(t); LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(-1, dp(48)); bl.topMargin = dp(16); f.addView(retry, bl); LinearLayout.LayoutParams bl2 = new LinearLayout.LayoutParams(-1, dp(48)); bl2.topMargin = dp(10); f.addView(change, bl2);
        root.addView(f, new LinearLayout.LayoutParams(-1, -1));
    }

    private void destroyWeb() {
        if (web != null) { ((ViewGroup) web.getParent()).removeView(web); web.destroy(); web = null; }
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(res == RESULT_OK && data != null ? android.webkit.WebChromeClient.FileChooserParams.parseResult(res, data) : null);
            fileCallback = null;
        } else super.onActivityResult(req, res, data);
    }

    private void atras() {
        if (web != null && web.canGoBack()) web.goBack(); else finish();
    }
    @Override public void onBackPressed() { // Android 12 e inferiores
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    // ---------- utilidades de interfaz ----------
    private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }
    private TextView text(String s, int sp, boolean bold) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(Color.rgb(13, 37, 80));
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }
    private EditText field(String hint, int type) {
        EditText e = new EditText(this); e.setHint(hint); e.setInputType(type); e.setSingleLine(true);
        e.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(48))); e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        return e;
    }
}
