# Publicar CasaMail en Google Play

Lo que ya está listo en el repositorio y lo que tienes que hacer tú (hay pasos que solo puede hacer el titular de la cuenta).

## Lo que ya está hecho
- App Android (`android/`): `app.casamail.movil`, targetSdk 35, solo HTTPS, sin copias en la nube, sin permisos salvo Internet.
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
6. **Acceso para el revisor** (importante): la app necesita un servidor. En *Contenido de la app → Acceso a la aplicación* indica una dirección HTTPS y una clave **de demostración** de un CasaMail tuyo con datos de ejemplo, accesible mientras dure la revisión. Sin esto, Google la rechazará por "no se puede probar".

## Textos de la ficha (Español)

**Nombre** (30 máx.): `CasaMail`

**Descripción breve** (80 máx.):
`Tu correo propio, privado y con IA, conectado a tu CasaMail.`

**Descripción completa:**
```
CasaMail es un cliente de correo propio: tu correo vive en tu equipo, no en la nube de nadie. Esta app te conecta desde el móvil a TU CasaMail (en tu PC o en tu servidor) de forma segura (solo HTTPS).

• Todas tus cuentas en un solo lugar: IMAP/SMTP, Gmail y Outlook (OAuth).
• Yerleny, la IA de CasaMail: resume mensajes, sugiere respuestas, redacta borradores y te prepara un resumen del día. Nunca envía nada sin que tú lo confirmes.
• Avisos: cada correo nuevo con un resumen de lo que dice, reuniones detectadas para agendar y recordatorios antes de cada una.
• Retira un envío durante 10 minutos antes de que salga.
• Archivo local sin límite de capacidad: importa y exporta PST y MBOX.
• Privacidad: sin publicidad, sin rastreadores, sin cuentas propias. La app no guarda tu correo en el teléfono.

IMPORTANTE: necesitas tener CasaMail instalado y accesible por HTTPS (por ejemplo con Tailscale). Guía: https://github.com/samauel05-byte/casamail/blob/main/docs/ANDROID.md
```

**Categoría:** Productividad · **Correo de contacto:** el tuyo · **Política de privacidad:** `https://github.com/samauel05-byte/casamail/blob/main/docs/PRIVACIDAD.md`

## Permisos de la app (por si Google pregunta)
- `INTERNET`: conectar con el servidor del propio usuario.
- `POST_NOTIFICATIONS`: mostrar avisos de correo nuevo y recordatorios de reuniones.
- `RECEIVE_BOOT_COMPLETED`: que la consulta de avisos (tarea periódica) siga programada tras reiniciar el móvil.
No usa alarmas exactas, servicios en primer plano, ubicación, contactos ni almacenamiento.

## Formulario "Seguridad de los datos" (respuestas sugeridas)
- ¿Recopila o comparte datos del usuario? **No** (la app no envía datos al desarrollador ni a terceros; solo se comunica con el servidor que el propio usuario configura).
- Cifrado en tránsito: **Sí** (HTTPS obligatorio).
- ¿Puede el usuario pedir que se borren sus datos? **Sí** (los datos están en su servidor; borrar los datos de la app elimina la configuración).
- Anuncios: **No**. Compras: **No**.
- Clasificación de contenido: cuestionario IARC como "utilidad/comunicación"; sin contenido sensible → suele salir **PEGI 3 / Para todos**.
- Público objetivo: **18+** (evita las normas de apps infantiles).

## Cada actualización
Sube el número: el flujo usa `github.run_number` como `versionCode`, siempre creciente. Cambia `versionName` con `ANDROID_VERSION_NAME`.
