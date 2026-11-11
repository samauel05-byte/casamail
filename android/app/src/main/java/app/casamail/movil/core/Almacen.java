package app.casamail.movil.core;

import java.util.HashMap;
import java.util.Map;

/** Dónde se guardan los datos de la app (cuentas, ajustes). En el móvil va cifrado; en las pruebas, en memoria. */
public interface Almacen {
    String leer(String clave);
    void guardar(String clave, String valor);

    /** Implementación en memoria (pruebas). */
    final class Memoria implements Almacen {
        private final Map<String, String> m = new HashMap<>();
        @Override public synchronized String leer(String k) { return m.get(k); }
        @Override public synchronized void guardar(String k, String v) { if (v == null) m.remove(k); else m.put(k, v); }
    }
}
