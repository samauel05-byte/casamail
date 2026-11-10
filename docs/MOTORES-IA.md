# Motores de IA de Yerleny: gratis, con respaldo

Yerleny (la IA de CasaMail) piensa con el **motor** que le conectes. Hay tres caminos gratuitos; puedes combinarlos y Yerleny **prueba el siguiente automáticamente** si uno falla (límite gratuito agotado, sin internet, clave inválida…).

Ajustes → **Yerleny** → *Motores*.

## 1. Integrado en la app (sin cuenta, sin clave, sin internet, privado)
Modelos abiertos con licencia **Apache-2.0** que corren en tu propio equipo. Se descargan una sola vez desde Hugging Face y se cargan solo al usarlos (se liberan de la RAM tras 10 min sin uso).

| Modelo | Tamaño | RAM | Para qué |
|---|---|---|---|
| **Rápido** · Qwen2.5 1.5B | 1,1 GB | ~3 GB | Resumir, traducir, reescribir, redactar cosas sencillas. |
| **Potente** · Qwen2.5 7B | 4,7 GB | ~8 GB | Mejor calidad y asistente con herramientas más fiable. |

**Cifras medidas** (equipo de 4 núcleos, sin tarjeta gráfica):
- 1,5B: carga en ~2 s, ~18 palabras/s. Resumen de un correo ≈ 4 s.
- 7B: asistente completo (buscar → leer) ≈ 90 s. Con tarjeta gráfica o Mac con chip M sería mucho más rápido.

**Límites honestos:** son modelos pequeños, más limitados que Claude, GPT o Gemini.
- El **1,5B** resume bien, pero al redactar puede **inventar detalles** (una hora o un día que no pediste) y el **asistente con herramientas** a menudo no las usa bien. Revisa siempre los borradores.
- El **7B** acierta mucho más (sugerencias, fechas, uso de herramientas), pero en CPU es lento.
- Para el asistente, un motor en la nube gratuito suele ser mejor opción.

## 2. En la nube con capa gratuita (más potente y rápido)
Necesitan una **clave gratuita** (sin tarjeta en la práctica; léelo en cada proveedor). Los límites de uso gratis los fija el proveedor y **pueden cambiar**.

| Proveedor | Dónde conseguir la clave |
|---|---|
| Google Gemini | <https://aistudio.google.com/apikey> |
| Groq | <https://console.groq.com/keys> |
| OpenRouter (modelos `:free`) | <https://openrouter.ai/keys> |
| Cerebras | <https://cloud.cerebras.ai/> |

*Detectar modelos disponibles* consulta al proveedor en el momento (los modelos gratuitos **cambian a menudo**, por eso no van fijos) y propone primero los gratuitos con soporte de herramientas.

**Privacidad:** el contenido de los correos que uses con Yerleny viaja a ese proveedor. Con el motor integrado, con Ollama o con LM Studio no sale de tu equipo.

## 3. Ollama / LM Studio (si ya los usas)
En *Avanzado*. CasaMail detecta Ollama y lista sus modelos.

## Respaldo automático
Ordena los motores (↑ ↓). Ejemplo recomendado: **Gemini o Groq (gratis, potente)** primero y el **integrado** de respaldo: si el límite gratuito se agota o no hay internet, Yerleny sigue funcionando en tu equipo. Si todos fallan, el error explica qué pasó con cada uno.

## Qué está verificado
- Descarga real del modelo (1,1 GB) desde la interfaz, con progreso; carga y respuesta dentro de la app de escritorio **instalada**.
- Respaldo: un motor con "límite alcanzado" (429) o clave inválida cede el paso al siguiente; si todos fallan, se explica cada fallo.
- Detección de modelos gratuitos en vivo (OpenRouter).
- **No verificado** con claves reales de Gemini, Groq ni Cerebras (requieren tu cuenta): se probó su lógica con servidores simulados, no con esos servicios.
