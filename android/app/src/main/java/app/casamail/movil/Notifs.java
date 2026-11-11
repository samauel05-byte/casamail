package app.casamail.movil;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Canales y publicación de notificaciones de Android. */
final class Notifs {
    static final String CH_MAIL = "correo", CH_REUNION = "reuniones", CH_ESTADO = "estado";
    private Notifs() { }

    static void canales(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH_MAIL, "Correo nuevo", NotificationManager.IMPORTANCE_DEFAULT));
        NotificationChannel r = new NotificationChannel(CH_REUNION, "Reuniones y recordatorios", NotificationManager.IMPORTANCE_HIGH);
        r.setDescription("Invitaciones, recordatorios de reuniones y la agenda de la mañana");
        nm.createNotificationChannel(r);
        // Canal silencioso y minimizado para el aviso permanente de "vigilando tu correo" (servicio en primer plano).
        NotificationChannel e = new NotificationChannel(CH_ESTADO, "Vigilancia de correo", NotificationManager.IMPORTANCE_MIN);
        e.setDescription("Aviso permanente mientras CasaMail vigila tu correo para avisarte de los nuevos.");
        e.setShowBadge(false);
        nm.createNotificationChannel(e);
    }

    /** Publica una notificación. Al tocarla se abre CasaMail (y, si es de un correo, ese mensaje). */
    static void mostrar(Context c, int id, String canal, String titulo, String cuerpo, long uid, String cuenta) {
        canales(c);
        Intent i = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (uid > 0 && cuenta != null && !cuenta.isEmpty()) i.putExtra("uid", uid).putExtra("account", cuenta);
        PendingIntent pi = PendingIntent.getActivity(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, canal) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_dialog_email).setContentTitle(titulo).setContentText(primeraLinea(cuerpo))
                .setStyle(new Notification.BigTextStyle().bigText(cuerpo)).setContentIntent(pi).setAutoCancel(true);
        if (Build.VERSION.SDK_INT < 26 && CH_REUNION.equals(canal)) b.setPriority(Notification.PRIORITY_HIGH);
        try { c.getSystemService(NotificationManager.class).notify(id, b.build()); } catch (SecurityException ignored) { /* sin permiso de notificaciones */ }
    }

    static String primeraLinea(String s) { int i = s.indexOf('\n'); return i < 0 ? s : s.substring(0, i); }
}
