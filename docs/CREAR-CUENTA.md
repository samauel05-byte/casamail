# Crear un correo nuevo desde CasaMail

Si no tienes correo, CasaMail te guía para crear uno: **Crear correo nuevo** (pantalla de bienvenida y Ajustes → Cuentas).

| Proveedor | Gratis | Cómo se conecta después |
|---|---|---|
| **Gmail** (Google) | 15 GB | OAuth (sin contraseña) |
| **Outlook / Hotmail** (Microsoft) | 15 GB | OAuth (sin contraseña) |
| **Yahoo Mail** | 1 TB | IMAP con contraseña de aplicación |
| **iCloud Mail** (Apple) | 5 GB | IMAP con contraseña específica de app |
| **Zoho Mail** | 5 GB, sin publicidad | IMAP (activar IMAP en Zoho; contraseña de aplicación si usas 2 pasos) |

## Cómo funciona
1. Eliges el proveedor. CasaMail abre **su página oficial de registro** en tu navegador.
2. Creas la cuenta allí (te piden verificar un móvil o correo).
3. Vuelves a CasaMail y pulsas **"Ya la creé: conectarla"**: te lleva directo a conectarla (con el proveedor ya elegido y, si hace falta, el enlace para crear la contraseña de aplicación).

## Por qué no se crea "dentro" de CasaMail
Google, Microsoft, Yahoo y Apple exigen verificar tu móvil y resolver un captcha **en su propia página**; ninguna aplicación puede crear una cuenta por ti (y automatizarlo infringe sus condiciones). Por eso CasaMail te lleva al registro oficial y te conecta al volver. Tu cuenta y tus claves se guardan solo en tu equipo.

## ¿Correo con tu propio dominio?
Si tu empresa o hosting (cPanel, Hostinger, GoDaddy…) te dio un correo, no hace falta crearlo: usa **Otra cuenta (IMAP)**.

## Nota sobre Gmail y Outlook (OAuth)
Conectar Gmail/Outlook con OAuth requiere una credencial gratuita de la aplicación (se crea una vez; ver `docs/OAUTH.md`). Si prefieres no hacerlo, Gmail se puede conectar con **contraseña de aplicación** (IMAP) y Outlook.com personal solo admite OAuth.
