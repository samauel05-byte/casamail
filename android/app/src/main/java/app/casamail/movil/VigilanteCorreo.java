package app.casamail.movil;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Vigilancia de correo en primer plano (app independiente). Mantiene la app viva y comprueba el correo cada ~20 s,
 * para avisar casi al instante aunque esté cerrada, sin que el ahorro de batería de Android la mate. Muestra un aviso
 * permanente y discreto ("vigilando tu correo"), obligatorio para un servicio en primer plano.
 */
public final class VigilanteCorreo extends Service {
    static final int NOTIF_ID = 99;
    private static final long INTERVALO_MS = 20_000;
    private volatile boolean activo;
    private Thread hilo;

    /** Arranca la vigilancia si hay cuentas. Idempotente. */
    static void iniciar(Context c) {
        try {
            if (!Nativo.hayCuentas(c)) return;
            Intent i = new Intent(c, VigilanteCorreo.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Throwable ignored) { /* algunos fabricantes restringen iniciar servicios; los avisos periódicos (AvisosJob) siguen de respaldo */ }
    }
    static void detener(Context c) { try { c.stopService(new Intent(c, VigilanteCorreo.class)); } catch (Throwable ignored) { } }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        Notifs.canales(this);
        try { startForeground(NOTIF_ID, persistente()); } catch (Throwable t) { stopSelf(); return START_NOT_STICKY; }
        if (activo) return START_STICKY;
        activo = true;
        final Context ctx = getApplicationContext();
        hilo = new Thread(() -> {
            while (activo) {
                try {
                    app.casamail.movil.core.Api api = Nativo.api(ctx);
                    api.procesarBandeja(System.currentTimeMillis());
                    if (!MainActivity.visible) {   // con la app abierta ya se ven dentro
                        JSONArray n = api.avisos();
                        for (int i = 0; i < n.length() && i < 8; i++) {
                            JSONObject m = n.getJSONObject(i);
                            Notifs.mostrar(ctx, (int) (m.getLong("uid") * 31 + m.getString("cuenta").hashCode()), Notifs.CH_MAIL,
                                    m.optString("titulo"), m.optString("cuerpo"), m.getLong("uid"), m.getString("cuenta"));
                        }
                    }
                } catch (Throwable ignored) { /* sin red o contraseña caducada: se reintenta en el siguiente ciclo */ }
                long fin = System.currentTimeMillis() + INTERVALO_MS;
                while (activo && System.currentTimeMillis() < fin) { try { Thread.sleep(1000); } catch (InterruptedException e) { break; } }
            }
        });
        hilo.setDaemon(true); hilo.start();
        return START_STICKY;
    }

    private Notification persistente() {
        PendingIntent pi = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, Notifs.CH_ESTADO) : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
                .setContentTitle("CasaMail")
                .setContentText("Vigilando tu correo para avisarte al instante")
                .setContentIntent(pi).setOngoing(true).build();
    }

    @Override public void onDestroy() { activo = false; if (hilo != null) hilo.interrupt(); super.onDestroy(); }
    @Override public IBinder onBind(Intent i) { return null; }
}
