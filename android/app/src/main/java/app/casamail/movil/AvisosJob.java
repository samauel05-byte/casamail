package app.casamail.movil;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;

/**
 * Avisos en segundo plano. Cada ~15 min (el mínimo que permite Android sin Google Firebase) consulta TU CasaMail:
 *  - muestra como notificación cada aviso nuevo (correo con su resumen, invitaciones, agenda de la mañana);
 *  - programa alarmas locales para los recordatorios de las próximas reuniones, para que lleguen a su hora aunque
 *    el móvil esté dormido (los recordatorios del servidor se ignoran aquí para no duplicarlos).
 */
public class AvisosJob extends JobService {
    private static final int JOB_ID = 4711;
    private static volatile Thread running;

    /** Programa la consulta periódica (idempotente). Se llama al conectar. */
    static void programar(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB_ID) return;
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, AvisosJob.class))
                .setPeriodic(15 * 60 * 1000L).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).build());
    }
    static void cancelar(Context c) { c.getSystemService(JobScheduler.class).cancel(JOB_ID); }

    @Override public boolean onStartJob(JobParameters p) {
        final Context ctx = getApplicationContext();
        running = new Thread(() -> { try { consultar(ctx); } catch (Exception ignored) { /* sin red o servidor apagado: se reintenta en la próxima */ } finally { jobFinished(p, false); } });
        running.start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters p) { return true; }

    // ---------- red ----------
    static String get(String server, String token, String path) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(server + path).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(20000); c.setRequestProperty("Authorization", "Bearer " + token); c.setInstanceFollowRedirects(false);
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) { StringBuilder sb = new StringBuilder(); String l; while ((l = r.readLine()) != null) sb.append(l); return sb.toString(); }
    }

    static void consultar(Context ctx) throws Exception {
        SharedPreferences prefs = ctx.getSharedPreferences("casamail", Context.MODE_PRIVATE);
        String server = prefs.getString("server", null), token = prefs.getString("token", null);
        if (server == null || token == null) { avisosNativos(ctx); return; }
        long ultimo = prefs.getLong("avisos_ultimo", -1);
        JSONObject r = new JSONObject(get(server, token, "/api/notifications?after=" + Math.max(ultimo, 0)));
        JSONArray items = r.getJSONArray("items"); // del más nuevo al más antiguo
        long last = r.getLong("last");
        if (ultimo < 0) { prefs.edit().putLong("avisos_ultimo", last).apply(); }   // primera vez: no se avisa de lo que ya estaba
        else {
            prefs.edit().putLong("avisos_ultimo", last).apply();
            int shown = 0;
            for (int i = items.length() - 1; i >= 0 && shown < 8; i--) {
                JSONObject n = items.getJSONObject(i);
                String kind = n.optString("kind");
                if (n.optBoolean("read") || "reminder".equals(kind)) continue; // los recordatorios los dan las alarmas locales
                if (MainActivity.visible) continue;                           // con la app abierta ya se ven dentro
                String canal = "mail".equals(kind) ? Notifs.CH_MAIL : Notifs.CH_REUNION;
                Notifs.mostrar(ctx, (int) n.getLong("id"), canal, n.optString("title", "CasaMail"), n.optString("body", ""), n.optLong("uid", 0), n.optString("account", ""));
                shown++;
            }
        }
        alarmas(ctx, server, token);
    }

    // ---------- recordatorios con alarmas locales ----------
    static void alarmas(Context ctx, String server, String token) throws Exception {
        SharedPreferences prefs = ctx.getSharedPreferences("casamail", Context.MODE_PRIVATE);
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        JSONArray rem = new JSONObject(get(server, token, "/api/notify/settings")).getJSONArray("reminders");
        long now = System.currentTimeMillis();
        JSONArray evs = new JSONObject(get(server, token, "/api/calendar?from=" + now + "&to=" + (now + 40L * 3600_000))).getJSONArray("events");
        Set<String> nuevos = new HashSet<>();
        for (int i = 0; i < evs.length(); i++) {
            JSONObject e = evs.getJSONObject(i);
            if (e.optBoolean("allDay")) continue;
            long start = e.getLong("start");
            for (int k = 0; k < rem.length(); k++) {
                int min = rem.getInt(k); long at = start - min * 60_000L;
                if (at <= now) continue;
                String key = e.getString("id") + ":" + min; nuevos.add(key);
                Intent in = new Intent(ctx, AlarmaReceiver.class).putExtra("t", e.optString("title")).putExtra("s", start).putExtra("l", e.optString("location")).putExtra("c", e.optString("link"));
                PendingIntent pi = PendingIntent.getBroadcast(ctx, key.hashCode(), in, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi); // aviso a su hora (±pocos minutos en modo ahorro); no pide permisos especiales
            }
        }
        // las que ya no existen (reunión borrada, movida o cancelada) se anulan
        Set<String> antes = prefs.getStringSet("alarmas", new HashSet<>());
        for (String key : antes) if (!nuevos.contains(key)) {
            PendingIntent pi = PendingIntent.getBroadcast(ctx, key.hashCode(), new Intent(ctx, AlarmaReceiver.class), PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pi != null) { am.cancel(pi); pi.cancel(); }
        }
        prefs.edit().putStringSet("alarmas", nuevos).apply();
    }

    /** Modo independiente: envía lo pendiente de la bandeja de salida y avisa del correo nuevo de cada cuenta (comprobando directamente su servidor IMAP). */
    static void avisosNativos(Context ctx) {
        if (!Nativo.hayCuentas(ctx)) return;
        app.casamail.movil.core.Api api = Nativo.api(ctx);
        api.procesarBandeja(System.currentTimeMillis());
        JSONArray n = api.avisos();
        if (MainActivity.visible) return;                                        // con la app abierta ya se ven dentro
        for (int i = 0; i < n.length() && i < 8; i++) {
            try { JSONObject m = n.getJSONObject(i); Notifs.mostrar(ctx, (int) (m.getLong("uid") * 31 + m.getString("cuenta").hashCode()), Notifs.CH_MAIL, m.optString("titulo"), m.optString("cuerpo"), m.getLong("uid"), m.getString("cuenta")); } catch (Exception ignored) { }
        }
    }
}
