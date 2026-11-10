# Instalar CasaMail

CasaMail es una aplicación de escritorio: se instala como cualquier programa y todo corre en tu equipo.

## Descargar
Ve a **Releases** del repositorio (<https://github.com/samauel05-byte/casamail/releases>) y baja el archivo de tu sistema:

| Sistema | Archivo | Cómo instalar |
|---|---|---|
| Windows 10/11 | `CasaMail-…-win-x64.exe` | Doble clic y sigue el asistente. |
| macOS (Apple Silicon: M1/M2/M3…) | `CasaMail-…-mac-arm64.dmg` | Abre el `.dmg` y arrastra CasaMail a *Aplicaciones*. |
| macOS (Intel) | `CasaMail-…-mac-x64.dmg` | Igual que arriba. |
| Linux (cualquiera) | `CasaMail-…-linux-x86_64.AppImage` | `chmod +x` al archivo y ejecútalo. |
| Linux (Debian/Ubuntu) | `CasaMail-…-linux-amd64.deb` | `sudo apt install ./CasaMail-….deb` |

## Primer arranque: aviso de "desarrollador no identificado"
Los instaladores **no están firmados con un certificado de pago**, así que el sistema avisa la primera vez:
- **Windows (SmartScreen):** *Más información → Ejecutar de todas formas*.
- **macOS (Gatekeeper):** clic derecho sobre CasaMail → *Abrir* → *Abrir*. (O en *Ajustes del Sistema → Privacidad y seguridad → Abrir de todos modos*.)
- **Linux:** no avisa.

## Uso diario
- Al abrir la app, añade tu cuenta en ⚙ → Cuentas (Gmail/Outlook por OAuth, o cualquier IMAP).
- Cerrar la ventana la deja **en segundo plano** (icono en la bandeja del sistema) para que salgan los mensajes programados y los que tengan retención de 10 min. Para salir del todo: icono de la bandeja → *Salir*.
- *Iniciar con el sistema* se activa desde el icono de la bandeja (Windows y macOS).
- Linux: algunos escritorios no muestran bandeja; ahí cerrar la ventana cierra la app (se puede cambiar desde el menú de la bandeja si está disponible).

## Si algo falla
CasaMail guarda un **registro de errores local** (no se envía a ningún sitio). Antes de guardarlo se ocultan claves, tokens, contraseñas, enlaces de acceso, tu carpeta personal y la parte local de los emails; **nunca guarda el contenido de tus correos**.

Para pedir ayuda, en el menú **Ayuda**:
- **Copiar información de diagnóstico**: copia al portapapeles la versión, tu sistema y las últimas líneas del registro. Pégalo en el mensaje donde pidas ayuda.
- **Abrir carpeta de registros**: abre la carpeta con el archivo completo (`casamail.log`). Si la app no llega a abrir ninguna ventana, el icono de la bandeja del sistema tiene la misma opción.

El registro está en `~/.casamail/logs/` (en Windows: `C:\Users\TuUsuario\.casamail\logs`). Si la app se cierra de golpe por un fallo del sistema, el volcado queda en `logs/crashes/`. Se renueva solo al llegar a 2 MB.

## Dónde se guardan tus datos
`~/.casamail/` (en Windows: `C:\Users\TuUsuario\.casamail`). Es la misma carpeta que usan la línea de comandos y el servidor MCP, así que comparten cuentas.
Desinstalar la app **no borra** esa carpeta; bórrala a mano si quieres eliminar cuentas y configuración.

## Compilarlo tú mismo
```bash
npm install
npm run desktop     # abre la app en modo desarrollo
npm run dist        # genera el instalador de tu sistema en ./release
```
Los instaladores de los tres sistemas los genera automáticamente GitHub Actions (`.github/workflows/release.yml`): sube una etiqueta `v0.2.0` y aparecen en *Releases*.
