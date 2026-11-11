package app.casamail.movil;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import app.casamail.movil.core.Almacen;

/** Guarda cuentas y ajustes cifrados (AES-GCM) con una clave del Android Keystore: la clave no sale del chip de seguridad del móvil. */
final class AlmacenSeguro implements Almacen {
    private static final String ALIAS = "casamail_datos";
    private final SharedPreferences prefs;

    AlmacenSeguro(Context c) { prefs = c.getSharedPreferences("casamail_datos", Context.MODE_PRIVATE); }

    private static SecretKey clave() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (ks.containsAlias(ALIAS)) return (SecretKey) ks.getKey(ALIAS, null);
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return g.generateKey();
    }

    @Override public synchronized String leer(String k) {
        String v = prefs.getString(k, null); if (v == null) return null;
        try {
            ByteBuffer b = ByteBuffer.wrap(Base64.decode(v, Base64.NO_WRAP)); byte[] iv = new byte[12]; b.get(iv); byte[] ct = new byte[b.remaining()]; b.get(ct);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, clave(), new GCMParameterSpec(128, iv));
            return new String(c.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) { return null; }
    }

    @Override public synchronized void guardar(String k, String valor) {
        if (valor == null) { prefs.edit().remove(k).apply(); return; }
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, clave());
            byte[] iv = c.getIV(), ct = c.doFinal(valor.getBytes(StandardCharsets.UTF_8));
            prefs.edit().putString(k, Base64.encodeToString(ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array(), Base64.NO_WRAP)).commit();
        } catch (Exception e) { throw new IllegalStateException("No se pudo guardar de forma segura: " + e.getMessage()); }
    }
}
