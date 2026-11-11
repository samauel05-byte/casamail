# Avisos, reuniones y calendario

CasaMail te avisa de lo importante **sin que tengas que abrirlo**. Todo se calcula en tu propio CasaMail (tu PC o tu servidor); no hay servidores intermedios.

## Qué te avisa
| Aviso | Cuándo | Qué dice |
|---|---|---|
| **Correo nuevo** | Cada vez que llega un correo a la bandeja de entrada (se consulta cada minuto) | Quién escribe, el asunto y un **resumen** de lo que dice y pide (Yerleny; sin IA, el comienzo del texto). No marca el correo como leído. |
| **Reunión detectada** | Cuando un correo trae una invitación (.ics) o Yerleny encuentra una reunión con día y hora en el texto | Título, día, hora y lugar, con el botón **Agendar**. Las de Yerleny te piden revisar la hora. |
| **Reunión cancelada** | Cuando llega una cancelación de una invitación que ya agendaste | Se quita del calendario y te avisa. |
| **Recordatorio** | Antes de cada reunión (por defecto 1 día, 1 hora y 10 minutos antes) | "Reunión en 10 min (15:30) · Sala 2 · enlace". Si CasaMail estuvo apagado, da solo el aviso más cercano. |
| **Agenda de la mañana** | Cada día a la hora que elijas (8:00 por defecto), solo si hay reuniones | "Hoy tienes 2 reuniones: 11:00 … 16:30 …" y las de mañana. |

## Tiempo real
CasaMail mantiene una conexión en espera con tu servidor (**IMAP IDLE**): cuando llega, se borra o se lee un correo (también desde otro dispositivo), el servidor avisa y la lista se actualiza sola y sale el aviso en **~1 segundo**, sin esperar. Si el servidor no admite IDLE o se corta la conexión, se reconecta sola y el sondeo de cada minuto sigue de respaldo.

## Dónde te llegan
- **Escritorio (Windows/macOS/Linux)**: notificaciones del sistema, **inmediatas**, también con la ventana cerrada si la app sigue en segundo plano (activa "Iniciar con el sistema" en el icono de la bandeja para que arranque sola).
- **Navegador**: avisos en pantalla y, si lo permites en Ajustes → Avisos, notificaciones del navegador mientras la pestaña esté abierta.
- **Android**: notificaciones de Android. Los avisos de **correo nuevo llegan con un retraso de hasta ~15 minutos o más** (el sistema no permite consultar más seguido sin Google Firebase). Los **recordatorios de reuniones** se programan en el móvil con alarmas locales y llegan a su hora (con unos minutos de margen si el móvil está en ahorro de batería).

## Calendario
Menú lateral → **Calendario**: próximas reuniones, añadir/editar/quitar a mano y **exportar .ics** (o añadir una reunión a Google Calendar/Outlook con el icono de descarga). No se sincroniza solo con Google/Outlook Calendar. Las reuniones repetitivas muestran solo la próxima. Desde un mensaje abierto, el botón **Agendar reunión** también busca la reunión en ese correo.

## Ajustes → Avisos
Activar/desactivar cada tipo, **agendar solas las invitaciones .ics** (por defecto desactivado: te pregunta), minutos de recordatorio y hora de la agenda.

## Privacidad
- Con un motor de IA **en la nube**, el texto de cada correo nuevo se envía a ese proveedor para resumirlo y buscar reuniones. Con el **modelo local** no sale de tu equipo. Puedes desactivar "Resumen con Yerleny" y "Detectar reuniones" en cualquier momento.
- Yerleny **nunca agenda una reunión por su cuenta**: siempre te la muestra para que la confirmes (solo las invitaciones .ics pueden agendarse solas, si tú lo activas).
- El historial de avisos (últimos 200) y el calendario se guardan solo en tu equipo.

## Límites conocidos
- Detecta correos de la **bandeja de entrada**. Si llegan más de 20 entre dos consultas, los más antiguos no se avisan.
- Zonas horarias de Windows en invitaciones (p. ej. "W. Europe Standard Time") se interpretan en tu zona horaria.
- La detección con IA depende de la calidad del modelo; los modelos pequeños pueden fallar o no ver una reunión. Por eso siempre se confirma.
