# 🖱️ Diagnóstico y Registro de Fallos de Ratón (Mouse Chatter & Hold Tester)

Herramienta diseñada para diagnosticar problemas de **clic involuntario, doble clic no deseado y micro-desconexiones al mantener pulsado** el botón del ratón (*switch chatter / contact bounce*).

Especialmente adaptado y optimizado para ratones mecánicos como el **Logitech G502 HERO**, donde los microswitches de lámina metálica tienden a desgastarse u oxidarse con el tiempo.

---

## 🚀 Método 1: Aplicación Web Interactiva (Recomendado)

Funciona directamente en cualquier navegador (Chrome, Firefox, Brave, etc.) sin necesidad de permisos de `root`.

### Cómo iniciar:
```bash
python3 serve.py
```
O simplemente abre [`index.html`](file:///home/tinaut1986/antigravity/sharp-hawking/index.html) directamente con tu navegador web.

### Características incluidas:
* 🎯 **Zona de Prueba de Pulsación Continua (Hold Test)**:
  * Cronómetro de alta precisión en tiempo real de milisegundos mantenidos.
  * Si el microswitch tiembla o se desconecta solo, emite una **alerta visual roja** y una **alarma acústica disonante**.
* 📦 **Prueba de Arrastre (Drag & Drop)**:
  * Zona para mover un objeto manteniendo presionado el botón. Si el botón se suelta por sí solo en pleno arrastre, lo verás inmediatamente.
* 🖱️ **Visualizador de Ratón SVG**:
  * Representación gráfica en tiempo real de los botones: Clic Izquierdo (0), Rueda/Central (1), Clic Derecho (2) y Botones Laterales 4 y 5.
* ⚙️ **Ajustes y Sensibilidad**:
  * Umbral de rebote configurable (por defecto 75 ms).
  * Opción de silenciar/activar alertas sonoras con Web Audio API.
  * Bloqueo de menú contextual para permitir probar el clic derecho sin que se abra el menú del navegador.
* 📜 **Registro y Exportación**:
  * Tabla con marca de tiempo, duración de pulsación, intervalo desde el último soltado (*gap*), estado y detalles.
  * Filtros por "Solo Chatter/Anomalías", Clic Izquierdo o Clic Derecho.
  * **Exportación en un clic a CSV y JSON**, o copia rápida al portapapeles.

---

## 🛠️ Método 2: Registrador de Hardware a Nivel de Kernel (Linux CLI)

Si prefieres registrar los eventos del ratón **en segundo plano mientras juegas o trabajas en otras aplicaciones**, puedes usar el script de consola a nivel de kernel (`/dev/input/event*`):

```bash
sudo python3 mouse_hardware_logger.py
```

### Características:
* Detecta automáticamente tu ratón **Logitech G502 HERO** (`/dev/input/event10`).
* Mide con precisión de microsegundos la diferencia entre eventos `BTN_LEFT 0` (soltado) y `BTN_LEFT 1` (pulsado).
* Si detecta una repulsación en menos de 80ms, muestra `⚠️ REBOTE / CHATTER` en la terminal.
* Guarda un archivo de registro detallado en `mouse_hardware_events.log`.
* Al presionar `Ctrl+C`, genera un resumen de diagnóstico.

---

## 💡 ¿Qué significa si detectas Chatter / Desconexiones?

1. **¿Qué está ocurriendo físicamente?**
   Los microswitches mecánicos (típicamente Omron) tienen una pequeña lámina flexible de cobre que hace contacto físico. Con el tiempo y los clics:
   * La lámina pierde tensión mecánica.
   * Se acumula oxidación microscópica en los contactos.
   * Al hacer presión continua, el contacto eléctrico no es estable y oscila rápidamente entre conectado y desconectado en milisegundos.

2. **Posibles soluciones:**
   * **Limpiador de contactos electrónicos:** Aplicar una pequeña gota de spray limpiador de contactos (residuo cero, tipo *WD-40 Specialist Limpiador de Contactos* o similar) dentro de la rendija del microswitch suele eliminar el óxido temporalmente.
   * **Garantía con Logitech:** Si el ratón tiene menos de 2 años, el soporte de Logitech suele reemplazarlo rápidamente ya que conocen bien este fallo de sus switches Omron.
   * **Reemplazo de switches:** Sustituir los switches desoldándolos por modelos más duraderos como **Kailh GM 8.0**, **TTC Gold Dustproof** o switches ópticos.
   * **Solución por software:** En Linux, herramientas como `evdev-debounce` o scripts de desparasitado (*software debouncing*) pueden filtrar los clics que ocurran en menos de 50-80ms.
