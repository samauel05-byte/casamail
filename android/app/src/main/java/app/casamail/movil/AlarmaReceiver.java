package app.casamail.movil;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.text.format.DateFormat;

import java.util.Date;

/** Recordatorio de una reunión (lo dispara una alarma programada por AvisosJob). */
public class AlarmaReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        long start = i.getLongExtra("s", 0); String titulo = i.getStringExtra("t"), lugar = i.getStringExtra("l"), link = i.getStringExtra("c");
        long mins = Math.round((start - System.currentTimeMillis()) / 60000.0);
        if (start == 0 || mins < -5) return; // ya empezó hace rato: no tiene sentido avisar
        String hora = DateFormat.getTimeFormat(c).format(new Date(start));
        String cuando = mins <= 1 ? "Reunión ahora (" + hora + ")" : mins < 60 ? "Reunión en " + mins + " min (" + hora + ")" : mins < 24 * 60 ? "Reunión hoy a las " + hora : "Reunión: " + DateFormat.getMediumDateFormat(c).format(new Date(start)) + " " + hora;
        StringBuilder sb = new StringBuilder(titulo == null ? "" : titulo);
        if (lugar != null && !lugar.isEmpty()) sb.append("\n").append(lugar);
        if (link != null && !link.isEmpty()) sb.append("\n").append(link);
        Notifs.mostrar(c, (int) (start / 60000) ^ (int) mins, Notifs.CH_REUNION, cuando, sb.toString(), 0, null);
    }
}
