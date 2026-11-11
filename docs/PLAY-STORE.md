# Publicar CasaMail en Google Play

Lo que ya está listo en el repositorio y lo que tienes que hacer tú (hay pasos que solo puede hacer el titular de la cuenta).

## Lo que ya está hecho
- App Android (`android/`): `app.casamail.movil`, targetSdk 36, solo HTTPS, sin copias en la nube, sin permisos salvo Internet.
- Flujo de GitHub **Android** que genera APK + AAB (y lo firma si añades los secretos de abajo).
- Gráficos en `android/play/`: icono 512×512, gráfico de funciones 1024×500 y 4 capturas de teléfono 1080×1920.
- Política de privacidad: `docs/PRIVACIDAD.md`.

## Lo que tienes que hacer tú
1. **Cuenta de desarrollador de Google Play** (pago único de 25 USD, verificación de identidad): https://play.google.com/console
2. **Clave de subida** (guárdala fuera del repositorio; sin ella no podrás actualizar la app):
   ```bash
   keytool -genkeypair -v -keystore casamail-upload.jks -alias casamail -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 casamail-upload.jks   # para el secreto de GitHub
   ```
   En GitHub → Settings → Secrets → Actions crea: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`casamail`), `ANDROID_KEY_PASSWORD`. Activa **Play App Signing** al crear la app (Google guarda la clave final).
3. Ejecuta el flujo **Android** (Actions → Android → Run workflow) y descarga el **.aab** firmado.
4. En Play Console: *Crear app* → Español → App → Gratis. Sube el `.aab` a **Pruebas internas** primero.
5. Si tu cuenta es **personal y nueva**: Google exige una **prueba cerrada con al menos 12 testers durante 14 días seguidos** antes de poder publicar en producción.
6. **Acceso para el revisor**: la app incluye un **modo demostración** (botón *Probar con datos de ejemplo* en la primera pantalla): funciona sin cuenta ni servidor, con correos, calendario y avisos de ejemplo. En *Contenido de la app → Acceso a la aplicación* indica: «La app no exige inicio de sesión para probarse: en la pantalla inicial pulse «Probar con datos de ejemplo». Para usarla con correo real basta con iniciar sesión con cualquier cuenta IMAP/SMTP (Gmail, Outlook, etc.); no hace falta ningún servidor aparte.» Así el revisor puede probarla sin ninguna clave.

## Textos de la ficha (Español)

**Nombre** (30 máx.): `CasaMail`

**Descripción breve** (80 máx.):
`Correo privado en tu móvil: IMAP/SMTP, firmas y avisos. Sin anuncios ni rastreo.`

**Descripción completa:**
```
CasaMail es un cliente de correo privado que funciona solo en tu móvil: no necesitas ningún ordenador ni servidor. Inicia sesión con tu correo y empieza a usarlo.

• Funciona con tu correo de siempre (IMAP/SMTP): Gmail, Outlook, Yahoo, iCloud, Zoho o el de tu propio dominio. Gmail, Yahoo e iCloud se conectan con una contraseña de aplicación (la app te muestra dónde crearla).
• Todas tus cuentas en una sola bandeja unificada.
• Firmas con tu logo, respuestas con el mensaje citado y búsqueda en el correo.
• Avisos de correo nuevo aunque tengas la app cerrada.
• Retira un envío durante 10 minutos antes de que salga.
• Privacidad de verdad: sin publicidad, sin rastreadores y sin cuentas propias. Tus contraseñas se guardan cifradas solo en tu móvil y la app no envía nada a sus creadores.

¿Tienes tu propio servidor CasaMail en tu PC? También puedes conectarlo desde «Usar mi propio servidor CasaMail».

Desarrollado por CasaLabs — https://www.casalabs.com.do/
```

**Categoría:** Productividad · **Correo de contacto:** el tuyo · **Política de privacidad:** `https://github.com/samauel05-byte/casamail/blob/main/docs/PRIVACIDAD.md`

## Permisos de la app (por si Google pregunta)
- `INTERNET`: conectar con el servidor del propio usuario.
- `POST_NOTIFICATIONS`: mostrar avisos de correo nuevo y recordatorios de reuniones.
- `RECEIVE_BOOT_COMPLETED`: que la consulta de avisos (tarea periódica) siga programada tras reiniciar el móvil.
No usa alarmas exactas, servicios en primer plano, ubicación, contactos ni almacenamiento.

## Formulario "Seguridad de los datos" (respuestas sugeridas)
- ¿Recopila o comparte datos del usuario? **No** (la app no envía datos al desarrollador ni a terceros; solo se comunica con el servidor de correo del propio usuario —su proveedor IMAP/SMTP, p. ej. Gmail— o con su propio servidor CasaMail).
- Cifrado en tránsito: **Sí** (IMAP/SMTP sobre SSL/TLS; con servidor propio, solo HTTPS).
- ¿Dónde se guardan las contraseñas? En el **propio móvil, cifradas** con el Android Keystore; no salen del dispositivo salvo para iniciar sesión en el servidor de correo del usuario.
- ¿Puede el usuario pedir que se borren sus datos? **Sí** (borrar los datos de la app, o quitar la cuenta, elimina las credenciales y la configuración del móvil).
- Anuncios: **No**. Compras: **No**.
- Clasificación de contenido: cuestionario IARC como "utilidad/comunicación"; sin contenido sensible → suele salir **PEGI 3 / Para todos**.
- Público objetivo: **18+** (evita las normas de apps infantiles).

## Cada actualización
Sube el número: el flujo usa `github.run_number` como `versionCode`, siempre creciente. Cambia `versionName` con `ANDROID_VERSION_NAME`.

## IA generativa (Yerleny)
- Genera **solo texto** (resúmenes, respuestas sugeridas, borradores, chat) con el motor que conecta el usuario (local o en la nube con su propia clave). Nunca envía correos sin confirmación.
- **Informar de contenido**: cada respuesta de Yerleny lleva «Informar de un problema», que abre un correo preparado al soporte (versión 0.3.5 en adelante).

## Enlaces públicos de la ficha
- Política de privacidad: https://github.com/samauel05-byte/casamail/blob/main/docs/PRIVACIDAD.md
- Términos del servicio (opcional): https://github.com/samauel05-byte/casamail/blob/main/docs/TERMINOS.md — página web estándar, pública y con HTTPS. Es un modelo: revísalo con un abogado.
