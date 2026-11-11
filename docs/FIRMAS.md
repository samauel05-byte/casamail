# Firmas con imagen (como en Outlook)

CasaMail ya no se limita a una firma de texto: puedes tener **varias firmas con tu logo** por cuenta.

## Cómo configurarlas (Ajustes → Firma)
1. **Importar de un correo enviado** (lo más rápido): CasaMail revisa tus últimos correos de *Enviados* y busca tu firma (la reconoce en Outlook, Roundcube, Thunderbird, Gmail o por el separador "-- ", o por el bloque final con tu logo). Eliges una, la retocas si hace falta y la guardas.
2. **Nueva firma**: escribe, o copia tu firma desde Outlook/webmail (Ctrl+C) y pégala en el editor (Ctrl+V). Si el logo no se pega, súbelo con el botón de imagen. Toca la imagen para cambiar su ancho.
3. Elige una firma **para mensajes nuevos** y otra **para respuestas** (por ejemplo, la completa con logo para nuevos y una corta para respuestas), igual que Outlook.

Al redactar, debajo del mensaje aparece **Firma: [Principal ▾]** con su vista previa; puedes cambiarla o elegir *Sin firma*.

## Cómo sale el correo
- Va en HTML con tu logo **incrustado** (se ve en Gmail, Outlook y el móvil sin pulsar "mostrar imágenes") y una versión de texto con "-- " y tu firma.
- En las respuestas, la firma va **entre tu respuesta y el mensaje citado**, como Outlook.
- Sin firma elegida, el correo sale en texto plano como antes.

## Por qué CasaMail no la "descarga" sola del servidor
Las firmas de tu webmail (cPanel/Roundcube, etc.) o de Outlook viven en esos programas, no en el buzón: el protocolo de correo (IMAP) no las expone. Por eso se importan desde un correo que ya enviaste con ellas, o se pegan. (Para Gmail/Workspace se podría leer por su API; no está incluido todavía.)

## Seguridad
El HTML de las firmas se limpia al guardarlo: se quitan scripts, formularios, manejadores de eventos y enlaces peligrosos; solo se permiten imágenes PNG/JPG/GIF/WebP (máx. ~450 KB cada una; el editor las reduce solo) o de https.

Las firmas de **texto** que ya tenías siguen funcionando: aparecen como una firma más ("Texto").
