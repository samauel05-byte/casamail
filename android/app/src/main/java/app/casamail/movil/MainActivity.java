package app.casamail.movil;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
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
    private SharedPreferences prefs;
    private LinearLayout root;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private int pad;

    @Override protected void onStart() { super.onStart(); visible = true; }
    @Override protected void onStop() { visible = false; super.onStop(); }
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
        String server = prefs.getString("server", null), token = prefs.getString("token", null);
        if (server != null && token != null) openWeb(server, token); else showForm(null, server);
    }

    // ---------- pantalla de conexión ----------
    private void showForm(String error, String presetUrl) {
        destroyWeb();
        root.removeAllViews();
        ScrollView sv = new ScrollView(this);
        LinearLayout f = new LinearLayout(this);
        f.setOrientation(LinearLayout.VERTICAL);
        f.setPadding(pad * 2, pad * 3, pad * 2, pad * 2);
        sv.addView(f);
        root.addView(sv, new LinearLayout.LayoutParams(-1, -1));

        TextView h = text("CasaMail", 30, true);
        TextView p = text("Conecta con tu CasaMail (en tu PC o en tu servidor). Tu correo no se guarda en el móvil.", 15, false);
        p.setPadding(0, dp(8), 0, dp(24));
        f.addView(h); f.addView(p);

        EditText url = field("Dirección de tu CasaMail (https://…)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        if (presetUrl != null) url.setText(presetUrl);
        EditText tok = field("Clave de acceso (o pega el enlace completo)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        f.addView(url); f.addView(tok);

        TextView err = text(error == null ? "" : error, 14, false);
        err.setTextColor(Color.rgb(176, 0, 32));
        err.setPadding(0, dp(8), 0, dp(8));
        f.addView(err);

        Button go = new Button(this);
        go.setText("Conectar");
        go.setAllCaps(false);
        go.setOnClickListener(v -> {
            Conexion c = Conexion.de(url.getText().toString(), tok.getText().toString());
            if (c.error != null) { err.setText(c.error); return; }
            prefs.edit().putString("server", c.servidor).putString("token", c.token).apply();
            openWeb(c.servidor, c.token);
        });
        f.addView(go);

        TextView help = text("¿Dónde encuentro esto? Al arrancar CasaMail en tu PC se imprime un enlace con la clave (…/?t=CLAVE). Pégalo aquí entero. La guía paso a paso está en github.com/samauel05-byte/casamail (docs/ANDROID.md).", 13, false);
        help.setTextColor(Color.GRAY);
        help.setPadding(0, dp(24), 0, 0);
        f.addView(help);
    }

    // ---------- navegador integrado ----------
    private void openWeb(String server, String token) {
        Notifs.canales(this);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 21);   // Android 13+: hay que pedir permiso para avisar
        AvisosJob.programar(this);
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
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
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
                DownloadManager.Request q = new DownloadManager.Request(Uri.parse(url));
                String name = URLUtil.guessFileName(url, cd, mime);
                q.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                q.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                q.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(q);
                Toast.makeText(this, "Descargando " + name, Toast.LENGTH_SHORT).show();
            } catch (Exception e) { Toast.makeText(this, "No se pudo descargar", Toast.LENGTH_SHORT).show(); }
        });
        web.loadUrl(server + "/?t=" + token);    // el servidor guarda una cookie y redirige a la página sin la clave
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
        Button retry = new Button(this); retry.setText("Reintentar"); retry.setAllCaps(false);
        retry.setOnClickListener(v -> { String tk = prefs.getString("token", null); if (tk != null) openWeb(server, tk); else showForm(null, server); });
        Button change = new Button(this); change.setText("Cambiar servidor"); change.setAllCaps(false);
        change.setOnClickListener(v -> showForm(null, server));
        f.addView(t); f.addView(retry); f.addView(change);
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
        e.setLayoutParams(new LinearLayout.LayoutParams(-1, -2));
        return e;
    }
}
