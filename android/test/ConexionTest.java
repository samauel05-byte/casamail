package app.casamail.movil;

/** Prueba sin Android: javac -d out app/src/main/java/app/casamail/movil/Conexion.java test/ConexionTest.java && java -cp out app.casamail.movil.ConexionTest */
public class ConexionTest {
    static int fallos = 0;
    static void eq(String n, Object a, Object b) { if (!java.util.Objects.equals(a, b)) { fallos++; System.out.println("  ✘ " + n + ": esperaba " + b + " y obtuve " + a); } else System.out.println("  ✔ " + n); }
    public static void main(String[] x) {
        String T = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";
        Conexion c = Conexion.de("casa.tail.ts.net", T); eq("host sin esquema → https", c.servidor, "https://casa.tail.ts.net"); eq("token", c.token, T);
        c = Conexion.de("https://Casa.Tail.ts.net:8443/lo/que/sea?x=1", T); eq("quita ruta y consulta, conserva el puerto", c.servidor, "https://casa.tail.ts.net:8443");
        c = Conexion.de("https://casa.tail.ts.net/?t=" + T, ""); eq("enlace completo en el campo de dirección", c.servidor + "|" + c.token, "https://casa.tail.ts.net|" + T);
        c = Conexion.de("casa.tail.ts.net", "https://casa.tail.ts.net/?t=" + T + "&z=1"); eq("enlace completo pegado en el campo de clave", c.token, T);
        c = Conexion.de("http://192.168.1.5:8025", T); eq("http se rechaza (solo HTTPS)", c.error != null && c.error.contains("https"), true);
        c = Conexion.de("ftp://x.com", T); eq("otro esquema se rechaza", c.error != null, true);
        c = Conexion.de("", T); eq("dirección vacía", c.error != null, true);
        c = Conexion.de("casa.test", "corta"); eq("clave corta se rechaza", c.error != null, true);
        c = Conexion.de("casa.test", "con espacios y simbolos!!! 12345678"); eq("clave con símbolos se rechaza", c.error != null, true);
        c = Conexion.de("https://", T); eq("sin host", c.error != null, true);
        c = Conexion.de("  casa.test  ", "  " + T + "  "); eq("recorta espacios", c.servidor + "|" + c.token, "https://casa.test|" + T);
        System.out.println(fallos == 0 ? "\nConexion OK" : "\n" + fallos + " fallos"); System.exit(fallos == 0 ? 0 : 1);
    }
}
