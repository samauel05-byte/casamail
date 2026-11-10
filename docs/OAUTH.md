# Conectar Gmail y Outlook con OAuth (sin contraseñas)

CasaMail usa OAuth 2.0 con PKCE y una redirección a tu propio equipo. Los tokens se guardan solo en `~/.casamail/`.
No incluimos credenciales de terceros: creas **tu propia** credencial gratuita (una sola vez).

## Google / Gmail
1. Entra a <https://console.cloud.google.com/> y crea un proyecto.
2. **Pantalla de consentimiento OAuth** → tipo *Externo*. Añade tu correo como usuario de prueba y añade el permiso `https://mail.google.com/`.
   - En modo *Pruebas* Google **caduca la conexión a los 7 días**. Para evitarlo, pulsa **Publicar aplicación** (seguirá "sin verificar", lo cual es normal para uso personal).
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación de escritorio**.
4. En CasaMail: Ajustes → Cuentas → *Gmail / Google* → pega el ID y el secreto → *Conectar con Google*.

## Microsoft / Outlook
1. <https://portal.azure.com/> → *Registros de aplicaciones* → *Nuevo registro*, con cuentas "en cualquier directorio y cuentas personales".
2. **Autenticación** → *Agregar plataforma* → *Aplicaciones móviles y de escritorio* → URI `http://localhost/oauth/callback`. Activa *Permitir flujos de cliente público*.
3. **Permisos de API** → *Office 365 Exchange Online* → permisos delegados `IMAP.AccessAsUser.All` y `SMTP.Send`.
4. Copia el *Id. de aplicación (cliente)* en CasaMail (Ajustes → Cuentas → *Outlook / Microsoft*).
   - Cuentas de trabajo: el administrador del inquilino debe permitir SMTP AUTH y dar consentimiento. Si tu app es de un solo directorio, indica el *inquilino* en CasaMail.

## Por línea de comandos
```bash
npm run cli -- add --oauth google --client-id TU_ID --client-secret TU_SECRETO
npm run cli -- add --oauth microsoft --client-id TU_ID
```

## Si deja de funcionar
Si el permiso caduca o lo revocas, CasaMail lo avisa y ofrece **Reconectar** (Ajustes → Cuentas).
