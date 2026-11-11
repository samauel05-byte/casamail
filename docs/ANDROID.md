# CasaMail para Android

La app de Android es un **cliente ligero**: tu correo, el Archivo local y Yerleny siguen viviendo en **tu CasaMail** (en tu PC o en un servidor tuyo). El móvil solo lo muestra. Nada de tu correo se guarda en el teléfono, y la app solo acepta conexiones **HTTPS**.

```
Teléfono (app CasaMail)  ──HTTPS──►  túnel privado  ──►  CasaMail en tu PC (127.0.0.1:8025)
```

## 1. Activa el modo remoto en tu CasaMail

Por defecto CasaMail solo atiende a tu propio equipo. Para el móvil se activa el **modo remoto** (es opcional):

```bash
CASAMAIL_REMOTE=1 CASAMAIL_ALLOWED_HOSTS=mi-pc.tu-red.ts.net npm start
```

- `CASAMAIL_ALLOWED_HOSTS`: el nombre con el que el móvil llega a tu CasaMail (varios, separados por comas). Cualquier otro nombre recibe un 403.
- La clave de acceso es la del enlace que imprime al arrancar (`…/?t=CLAVE`). Sin ella no se entra. Tras 10 claves erróneas desde una misma IP se bloquea 10 minutos.
- En la app de escritorio, define las mismas variables de entorno antes de abrirla.

## 2. Dale una dirección HTTPS (recomendado: Tailscale)

**Tailscale Serve** (privado: solo tus dispositivos pueden verlo):

```bash
tailscale serve --bg 8025
```

Te da una dirección como `https://mi-pc.tu-red.ts.net`. Instala Tailscale también en el móvil e inicia sesión con la misma cuenta.

Alternativas: Cloudflare Tunnel o un proxy inverso con certificado propio. **No abras el puerto 8025 a internet sin HTTPS.**

## 3. Conecta la app

Abre CasaMail en el móvil → pega el **enlace completo** (`https://mi-pc.tu-red.ts.net/?t=CLAVE`) en la primera casilla → *Conectar*. La app guarda la dirección y la clave solo en el teléfono (sin copia de seguridad en la nube).

## Avisos en el móvil
La app muestra notificaciones de **correo nuevo** (con resumen), **invitaciones**, **agenda de la mañana** y **recordatorios de reuniones** (ver `docs/AVISOS.md`). Android 13+ te pedirá permiso.
- Se consulta a tu CasaMail cada ~15 minutos (mínimo de Android sin Firebase), así que un correo puede avisar con ese retraso, o más con el móvil en ahorro de batería.
- Los recordatorios de reuniones se programan en el móvil con alarmas y llegan a su hora.
- Si tu CasaMail está apagado o sin conexión, no hay avisos.

## Qué funciona y qué no

| | |
|---|---|
| Leer, buscar, responder, redactar, bandeja de salida con 10 min para retirar | ✅ |
| Yerleny (resumir, redactar, asistente) | ✅ (usa los motores de IA de tu servidor) |
| Archivo local (PST/MBOX) y exportar | ✅ (importar un PST grande: mejor desde el PC) |
| Añadir cuentas **Gmail/Outlook con OAuth** desde el móvil | ❌ — la redirección de OAuth es local al servidor. Añádelas una vez desde el PC; después funcionan en el móvil |
| Cuentas con contraseña de aplicación (IMAP) | ✅ |
| Si el PC está apagado | ❌ — el móvil no puede leer el correo (mira "servidor 24 h" abajo) |

**Servidor 24 h:** para no depender del PC encendido, puedes ejecutar CasaMail en un mini-PC, Raspberry Pi o VPS con el mismo modo remoto y HTTPS.

## Compilar la app tú mismo

Requisitos: JDK 17 y Android SDK 36.

```bash
cd android
./gradlew :app:assembleRelease     # APK
./gradlew :app:bundleRelease       # AAB para Google Play
```

También lo hace GitHub Actions ("Android" → *Run workflow*): descarga el artefacto `CasaMail-android`.

Prueba de la lógica de conexión (sin Android): `cd android && javac -d /tmp/cx app/src/main/java/app/casamail/movil/Conexion.java test/ConexionTest.java && java -cp /tmp/cx app.casamail.movil.ConexionTest`.
