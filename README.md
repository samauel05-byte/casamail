<p align="center"><img src="build/logo.png" alt="CasaMail" width="320"></p>

# CasaMail

Cliente de correo **local** (corre en tu equipo, sin servidores intermedios): IMAP/SMTP de cualquier proveedor, **Gmail y Outlook con OAuth**, interfaz propia, **Yerleny** (su IA integrada) y servidor **MCP** para Claude u otras IAs.

## Instalar (aplicación de escritorio)
Descarga el instalador de tu sistema desde **[Releases](https://github.com/samauel05-byte/casamail/releases)** — Windows (`.exe`), macOS (`.dmg`) o Linux (`.AppImage` / `.deb`) — e instálalo como cualquier programa. Guía completa, avisos del primer arranque y desinstalación: [docs/INSTALAR.md](docs/INSTALAR.md).

La app abre su propia ventana, queda en la bandeja del sistema (para enviar los mensajes programados) y no necesita nada más instalado.

## Desarrollo
```bash
npm install
npm run desktop         # la app de escritorio en modo desarrollo
npm start               # solo el servidor, en tu navegador (127.0.0.1)
npm run dist            # genera el instalador de tu sistema en ./release
```
Añade tu cuenta desde ⚙ Ajustes → Cuentas, o por CLI (`npm run cli -- add`).

## Cuentas
- **Gmail y Outlook con OAuth** (sin contraseña, PKCE): guía en [docs/OAUTH.md](docs/OAUTH.md). Los tokens se renuevan solos y, si se revocan, la app ofrece *Reconectar*.
- **Cualquier IMAP/SMTP**: Yahoo, iCloud, Fastmail, Zoho o tu dominio (con contraseña de aplicación).

## Yerleny, la IA de CasaMail
Yerleny resume, redacta, reescribe/traduce, sugiere respuestas, busca en lenguaje natural, prioriza la bandeja y chatea contigo: busca y lee tu correo y **prepara borradores que tú revisas; nunca envía sola**.
- **Piensa con el modelo que le conectes** (Ajustes → Yerleny): Claude, OpenAI, Gemini, Groq, OpenRouter, DeepSeek, Mistral o **Ollama / LM Studio en local (gratis y privado)**, con detección automática de Ollama. Es honesta sobre ello: si le preguntas qué modelo usa, lo dice.
- **Memoria y personalidad**: tu nombre, idioma, estilo y notas ("firmo como Sam"). Cuando le pides *"recuerda que…"* te muestra la nota y **solo la guarda si confirmas** (así un correo malicioso no puede enseñarle instrucciones permanentes).
- El contenido de los correos que uses con Yerleny se envía al proveedor del modelo; con Ollama no sale de tu equipo.

## Correo
Varias cuentas y bandeja unificada, carpetas, hilos, búsqueda, adjuntos, firma, borradores, archivar/spam/papelera, posponer, programar envío, paleta de comandos (`Ctrl/⌘ K`), atajos (`C` `/` `J` `K` `R` `E` `#` `S`), modo claro/oscuro y diseño adaptable a móvil.

**Retirar un mensaje (10 min):** un correo ya enviado por SMTP no se puede recuperar, así que CasaMail lo retiene en la *Bandeja de salida* hasta 10 minutos. Puedes **retirarlo** y el destinatario nunca lo recibe; pasado el plazo ya no es posible (lo impone el servidor). Configurable (0–10 min); "⚡ Enviar ya" lo envía al instante. La app debe estar abierta para que salga a su hora.

## Conectarlo a Claude u otra IA (MCP)
```bash
claude mcp add casamail -- npx tsx /RUTA/casamail/src/mcp.ts
```
Claude Desktop / Cursor / Cline:
```json
{ "mcpServers": { "casamail": { "command": "npx", "args": ["tsx", "/RUTA/casamail/src/mcp.ts"], "env": { "CASAMAIL_READONLY": "1" } } } }
```
`CASAMAIL_READONLY=1` deja solo lectura. `send_email` y `reply_email` del MCP envían **al instante** (sin bandeja de salida); prefiere `save_draft`.

## Seguridad y datos
- Todo vive en `~/.casamail/` (permisos 600). Las contraseñas, tokens OAuth y claves de IA están **en texto plano** en esos archivos.
- Solo escucha en 127.0.0.1, con token, protección anti-CSRF/DNS-rebinding; el retorno de OAuth se protege con `state` de un solo uso + PKCE.
- Imágenes remotas bloqueadas por defecto; el HTML de los correos va en un iframe aislado. Los correos son datos no confiables para la IA.

## Pruebas
```bash
npm test                              # 50 pruebas: IMAP/SMTP/XOAUTH2 reales de prueba, OAuth, retirada de mensajes, Yerleny
PW_PATH=<ruta a playwright> npx tsx tests/ui.ts   # 42 comprobaciones en un navegador real
npm run test:desktop                  # 15 comprobaciones de la app de escritorio (Electron, necesita xvfb en Linux sin pantalla)
```
Las pruebas de OAuth usan un proveedor falso local; **no se han probado contra Google o Microsoft reales** (necesitan tus credenciales). Los instaladores de Windows y macOS los genera GitHub Actions y **no se han probado aún en esos sistemas** (el empaquetado y la prueba se hicieron en Linux).
