package app.casamail.movil.core;

import java.util.Locale;

/** Servidores de correo conocidos: a partir del dominio del email se rellena todo solo. */
public final class Servidores {
    private Servidores() { }

    public static final class Ajuste {
        public final String id, imapHost, smtpHost, nota, enlaceClaveApp;
        public final int imapPuerto, smtpPuerto; public final boolean imapSeguro, smtpSeguro;
        Ajuste(String id, String imapHost, int imapPuerto, String smtpHost, int smtpPuerto, boolean smtpSeguro, String nota, String enlace) {
            this.id = id; this.imapHost = imapHost; this.imapPuerto = imapPuerto; this.imapSeguro = true;
            this.smtpHost = smtpHost; this.smtpPuerto = smtpPuerto; this.smtpSeguro = smtpSeguro; this.nota = nota; this.enlaceClaveApp = enlace;
        }
    }

    public static Ajuste porDominio(String email) {
        int i = email.lastIndexOf('@'); if (i < 0) return null;
        String d = email.substring(i + 1).trim().toLowerCase(Locale.ROOT);
        switch (d) {
            case "gmail.com": case "googlemail.com":
                return new Ajuste("gmail", "imap.gmail.com", 993, "smtp.gmail.com", 465, true, "Gmail exige una contraseña de aplicación (necesita la verificación en 2 pasos).", "https://myaccount.google.com/apppasswords");
            case "yahoo.com": case "yahoo.es": case "yahoo.com.mx": case "yahoo.com.ar": case "ymail.com": case "rocketmail.com":
                return new Ajuste("yahoo", "imap.mail.yahoo.com", 993, "smtp.mail.yahoo.com", 465, true, "Yahoo exige una contraseña de aplicación.", "https://login.yahoo.com/account/security");
            case "icloud.com": case "me.com": case "mac.com":
                return new Ajuste("icloud", "imap.mail.me.com", 993, "smtp.mail.me.com", 587, false, "iCloud exige una contraseña específica de app.", "https://account.apple.com/account/manage");
            case "outlook.com": case "hotmail.com": case "live.com": case "msn.com": case "outlook.es": case "hotmail.es":
                return new Ajuste("outlook", "outlook.office365.com", 993, "smtp.office365.com", 587, false, "Outlook.com y Hotmail ya no admiten contraseña normal en programas de correo: el inicio de sesión de Microsoft llegará pronto. Si tu cuenta es de trabajo o escuela, puede funcionar con una contraseña de aplicación.", "https://account.microsoft.com/security");
            case "zoho.com": case "zohomail.com":
                return new Ajuste("zoho", "imap.zoho.com", 993, "smtp.zoho.com", 465, true, "En Zoho Mail activa IMAP en Configuración → Acceso POP/IMAP. Con verificación en 2 pasos, usa una contraseña de aplicación.", "https://accounts.zoho.com/home#security/app_password");
            case "aol.com":
                return new Ajuste("aol", "imap.aol.com", 993, "smtp.aol.com", 465, true, "AOL exige una contraseña de aplicación.", "https://login.aol.com/account/security");
            case "gmx.com": case "gmx.net": case "gmx.es":
                return new Ajuste("gmx", "imap.gmx.com", 993, "mail.gmx.com", 587, false, "En GMX activa el acceso por IMAP en los ajustes de tu cuenta.", null);
            case "fastmail.com": case "fastmail.fm":
                return new Ajuste("fastmail", "imap.fastmail.com", 993, "smtp.fastmail.com", 465, true, "Fastmail exige una contraseña de aplicación.", null);
            default:
                return null;
        }
    }

    /** Dominio propio (hosting, empresa…): se prueba lo habitual (imap./smtp. + dominio). El usuario puede corregirlo. */
    public static Ajuste suponer(String email) {
        int i = email.lastIndexOf('@'); if (i < 0) return null;
        String d = email.substring(i + 1).trim().toLowerCase(Locale.ROOT);
        return new Ajuste("otro", "imap." + d, 993, "smtp." + d, 465, true, "No reconozco este proveedor: he supuesto imap." + d + " y smtp." + d + ". Si falla, usa «Ajustes avanzados».", null);
    }
}
