# Firmar los instaladores (Windows y macOS)

Sin firma, Windows muestra «editor desconocido» (SmartScreen) y macOS dice «dañado». Firmarlos lo quita. **Requiere un certificado de pago a tu nombre** (no se puede generar gratis); el flujo de GitHub ya está preparado: en cuanto añadas los secretos, los instaladores salen firmados solos.

## Windows
- Certificado de firma de código (OV o EV; las autoridades más usadas cobran del orden de cientos de USD al año; Microsoft también ofrece *Trusted Signing* por una cuota mensual: consulta precios y requisitos actuales).
- Exporta el certificado a `.pfx`, conviértelo a base64 (`base64 -w0 certificado.pfx`) y crea estos secretos en GitHub → Settings → Secrets → Actions:
  - `WIN_CSC_LINK` = el base64 del .pfx
  - `WIN_CSC_KEY_PASSWORD` = su contraseña

## macOS
- Cuenta de **Apple Developer** (99 USD/año) y un certificado «Developer ID Application» exportado a `.p12`.
- Secretos: `MAC_CSC_LINK` (base64 del .p12), `MAC_CSC_KEY_PASSWORD`, y para la notarización de Apple: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (contraseña de aplicación de tu Apple ID) y `APPLE_TEAM_ID`.

## Publicar
Actions → **Instaladores** → *Run workflow* → marca **publicar**: crea la Release `v<versión>` con los instaladores (firmados si hay secretos). Esa Release es la que consulta el aviso de versión nueva de la app.

> Con la app firmada, la actualización puede pasar a ser automática (electron-updater). Hoy la app **avisa** de la versión nueva y te lleva a la descarga.
