package app.casamail.movil.core;

import org.json.JSONException;
import org.json.JSONObject;

/** Una cuenta de correo (IMAP para leer, SMTP para enviar). */
public final class Cuenta {
    public String id, email, usuario, clave, imapHost, smtpHost;
    public int imapPuerto = 993, smtpPuerto = 465;
    public boolean imapSeguro = true, smtpSeguro = true;

    public JSONObject aJson() throws JSONException {
        return new JSONObject().put("id", id).put("email", email).put("usuario", usuario).put("clave", clave)
                .put("imapHost", imapHost).put("imapPuerto", imapPuerto).put("imapSeguro", imapSeguro)
                .put("smtpHost", smtpHost).put("smtpPuerto", smtpPuerto).put("smtpSeguro", smtpSeguro);
    }
    public static Cuenta deJson(JSONObject j) {
        Cuenta c = new Cuenta();
        c.id = j.optString("id"); c.email = j.optString("email"); c.usuario = j.optString("usuario", c.email); c.clave = j.optString("clave");
        c.imapHost = j.optString("imapHost"); c.imapPuerto = j.optInt("imapPuerto", 993); c.imapSeguro = j.optBoolean("imapSeguro", true);
        c.smtpHost = j.optString("smtpHost"); c.smtpPuerto = j.optInt("smtpPuerto", 465); c.smtpSeguro = j.optBoolean("smtpSeguro", true);
        return c;
    }
    public static String idDe(String email) { return email.toLowerCase().replaceAll("[^a-z0-9]", "_"); }
}
