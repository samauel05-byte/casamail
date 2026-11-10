# Archivo local: PST, MBOX y correo sin límite de espacio

El **Archivo local** guarda correo en **tu propio disco**. No tiene cuota de ningún proveedor: lo único que lo limita es el espacio libre de la unidad donde vive (y puedes elegir otra, p. ej. un disco externo).
No sustituye la cuota de tu cuenta de Gmail/Outlook (eso lo decide el proveedor), pero te permite **llevar ahí el correo viejo y liberar espacio** para seguir usando la cuenta.

## Importar un PST / OST / MBOX / EML
Ajustes → **Archivo local** → *Importar*.
- **PST y OST** (Outlook): se importa el correo con sus carpetas, destinatarios, adjuntos e imágenes incrustadas. Calendario, contactos, tareas y notas **se omiten**. Las invitaciones a reuniones sí se importan (son mensajes).
- **MBOX** (Thunderbird, Apple Mail, Google Takeout…) y **EML** sueltos.
- Todo se guarda **sin duplicados** y comprimido. Importar dos veces el mismo archivo no repite nada.

### PST muy grandes (decenas de GB)
Un PST puede pesar 50 GB. CasaMail está pensado para eso:
1. **Elige la ubicación primero** (Ajustes → Archivo local → *Ubicación*, solo con el archivo vacío). Necesitas espacio libre aproximado al tamaño del PST. La app avisa si no cabe.
2. **App de escritorio:** *Elegir archivo…* abre el selector del sistema y el PST se lee **directamente de donde está, sin copiarlo** (copiar 50 GB duplicaría espacio y tiempo). En el navegador, escribe la ruta completa. *Subir el archivo* hace una copia temporal: úsalo solo para archivos pequeños.
3. La importación va en **segundo plano**; puedes cerrar la ventana de Ajustes y seguir usando CasaMail. Se ve el avance y el tiempo estimado (también en la barra lateral). Mientras dura, **el equipo no se duerme** y, si intentas salir, la app te avisa.
4. Si se interrumpe (apagón, cierre…), **vuelve a importar el mismo archivo**: lo ya guardado se reconoce sin reconstruirlo y continúa por donde iba.
5. Mantén el equipo **enchufado** y evita desconectar el disco durante la importación.

## Descargar (exportar)
Ajustes → Archivo local → *Descargar*: carpeta o todo el archivo, o una carpeta de cualquier cuenta, como **.mbox**. También puedes bajar un mensaje suelto como **.eml** (botón de descarga al leerlo).
- Thunderbird y Apple Mail abren .mbox directamente; Outlook necesita una herramienta de importación.
- **No se puede exportar a .PST.** Es un formato propietario de Microsoft y no existe una forma fiable de escribirlo fuera de Outlook. Prometerlo sería engañarte.

## Liberar espacio de una cuenta
*Liberar espacio de una cuenta* mueve el correo viejo de una carpeta al Archivo local (todo, o más antiguo de 3 meses / 6 meses / 1 año / 2 años).
- Por defecto **solo copia**.
- Si marcas *borrar del servidor*, cada mensaje se borra **solo después de comprobar** que quedó guardado y que, al releerlo del disco, es **idéntico** al original. Si algo falla, ese mensaje se queda en el servidor.
- **Gmail:** borrar de una carpeta no libera espacio hasta vaciar también *Todos* y *Papelera*.

## ⚠ Copia de seguridad
Cuando borras del servidor, **el Archivo local pasa a ser la única copia**. Haz copia de la carpeta del archivo (Ajustes → Archivo local muestra su ruta; por defecto `~/.casamail/archive`) como harías con cualquier documento importante. Contiene `index.sqlite` y la carpeta `msgs/`; hay que copiar ambas.

## Qué se ha comprobado (y qué no)
Medido en pruebas automáticas, en un equipo de 4 núcleos:
- Índice con **400.000 mensajes**: listar carpetas 23 ms, una página de mensajes 9 ms, búsqueda de texto 2 ms.
- MBOX de **48 MB** (2.000 mensajes): importado en ~2,5 s con +20 MB de memoria (se lee por streaming).
- PST/OST reales de **13–16 MB** (carpetas, adjuntos, HTML): importados correctamente, y reimportar no duplica ni reconstruye.
- Traslado desde un servidor IMAP: la copia fallida o no idéntica **nunca** provoca un borrado.

**No se ha podido probar con un PST de 50 GB** (aquí no hay archivos de ese tamaño ni forma de fabricarlos). El diseño evita cargarlo en memoria, lo lee por bloques, escribe por lotes y se retoma sin repetir trabajo, pero el tiempo real de una importación así (probablemente horas) depende de tu disco y de cuántos adjuntos tenga. Si lo pruebas, dime cómo va.
