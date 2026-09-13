#!/usr/bin/env python3
"""
Registrador de Hardware de Ratón a Nivel de Kernel (Linux /dev/input)
Lee los eventos directos del ratón para detectar micro-rebotes (chatter)
incluso mientras juegas o usas otras aplicaciones en Linux.

Sin dependencias externas (usa la biblioteca estándar de Python).
"""

import os
import sys
import glob
import time
import struct
import select
from datetime import datetime

# Estructura del evento de entrada en Linux (64-bit):
# struct timeval (8 bytes tv_sec, 8 bytes tv_usec)
# __u16 type (2 bytes)
# __u16 code (2 bytes)
# __s32 value (4 bytes)
# Total: 24 bytes
EVENT_FORMAT = "qqHHi"
EVENT_SIZE = struct.calcsize(EVENT_FORMAT)

# Tipos y códigos de eventos Linux
EV_KEY = 0x01
EV_SYN = 0x00

BUTTON_CODES = {
    0x110: "LMB (Izquierdo)",
    0x111: "RMB (Derecho)",
    0x112: "MMB (Central)",
    0x113: "Botón Lateral 1 (Atrás)",
    0x114: "Botón Lateral 2 (Adelante)",
    0x115: "Botón Extra",
}

# Colores ANSI para terminal
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

CHATTER_THRESHOLD_MS = 80.0

def find_mouse_devices():
    devices = []
    # Buscar en by-id primero para nombres descriptivos
    by_id_pattern = "/dev/input/by-id/*event-mouse*"
    for path in glob.glob(by_id_pattern):
        real_path = os.path.realpath(path)
        devices.append((path, real_path, os.path.basename(path)))

    if not devices:
        # Fallback a /dev/input/event*
        for path in sorted(glob.glob("/dev/input/event*")):
            devices.append((path, path, os.path.basename(path)))

    return devices

def main():
    print(f"{BOLD}{CYAN}==================================================================={RESET}")
    print(f"{BOLD}{CYAN}  🖱️  REGISTRADOR DE HARDWARE DE RATÓN A NIVEL DE KERNEL (LINUX){RESET}")
    print(f"{BOLD}{CYAN}==================================================================={RESET}")

    devices = find_mouse_devices()
    if not devices:
        print(f"{RED}No se encontraron dispositivos de ratón en /dev/input.{RESET}")
        sys.exit(1)

    target_device = None
    # Priorizar Logitech G502 si existe
    for d_path, real_path, name in devices:
        if "Logitech" in name or "G502" in name:
            target_device = (d_path, real_path, name)
            break

    if not target_device:
        target_device = devices[0]

    dev_path, real_path, name = target_device
    print(f"Dispositivo seleccionado: {BOLD}{name}{RESET}")
    print(f"Ruta del dispositivo:     {real_path}\n")

    # Intentar abrir el dispositivo
    try:
        fd = os.open(real_path, os.O_RDONLY | os.O_NONBLOCK)
    except PermissionError:
        print(f"{RED}{BOLD}⚠️ Error de Permiso:{RESET} No tienes acceso de lectura a {real_path}.")
        print(f"Para ejecutar este registrador de hardware directo, usa:")
        print(f"  {BOLD}sudo python3 mouse_hardware_logger.py{RESET}")
        print(f"o añade tu usuario al grupo 'input' con:")
        print(f"  {BOLD}sudo usermod -aG input $USER{RESET} (requiere cerrar y abrir sesión)\n")
        print("💡 Recuerda que también puedes usar la herramienta web sin permisos con:")
        print(f"  {BOLD}python3 serve.py{RESET}")
        sys.exit(1)
    except Exception as e:
        print(f"{RED}Error abriendo {real_path}: {e}{RESET}")
        sys.exit(1)

    log_filename = "mouse_hardware_events.log"
    log_file = open(log_filename, "a", encoding="utf-8")
    log_file.write(f"\n--- Sesión de registro iniciada: {datetime.now().isoformat()} ({name}) ---\n")
    log_file.flush()

    print(f"Guardando registro completo en: {BOLD}{log_filename}{RESET}")
    print(f"Umbral de detección de rebote (Chatter): {BOLD}< {CHATTER_THRESHOLD_MS} ms{RESET}")
    print(f"Presiona {BOLD}Ctrl+C{RESET} para salir y ver resumen de estadísticas.\n")
    print(f"{'HORA':<14} | {'BOTÓN':<22} | {'ACCIÓN':<10} | {'DURACIÓN / GAP':<25} | {'ESTADO'}")
    print("-" * 85)

    last_release_time = {}
    last_press_time = {}
    total_clicks = 0
    chatter_count = 0

    try:
        while True:
            # Esperar datos de entrada
            r, _, _ = select.select([fd], [], [], 0.5)
            if not r:
                continue

            data = os.read(fd, EVENT_SIZE)
            if len(data) < EVENT_SIZE:
                continue

            sec, usec, ev_type, ev_code, ev_value = struct.unpack(EVENT_FORMAT, data)

            if ev_type == EV_KEY and ev_code in BUTTON_CODES:
                event_time = sec + usec / 1_000_000.0
                btn_name = BUTTON_CODES[ev_code]
                time_str = datetime.fromtimestamp(event_time).strftime("%H:%M:%S.%f")[:12]

                if ev_value == 1:  # Presionado
                    total_clicks += 1
                    gap_ms = None
                    is_chatter = False

                    if ev_code in last_release_time:
                        gap_ms = (event_time - last_release_time[ev_code]) * 1000.0
                        if gap_ms < CHATTER_THRESHOLD_MS:
                            is_chatter = True
                            chatter_count += 1

                    last_press_time[ev_code] = event_time

                    if is_chatter:
                        status_col = f"{RED}{BOLD}⚠️ REBOTE / CHATTER{RESET}"
                        gap_col = f"Gap: {gap_ms:.1f} ms"
                    else:
                        status_col = f"{GREEN}OK{RESET}"
                        gap_col = f"Gap: {gap_ms:.1f} ms" if gap_ms is not None else "Primer clic"

                    print(f"{time_str:<14} | {btn_name:<22} | {'PULSADO':<10} | {gap_col:<25} | {status_col}")
                    log_file.write(f"[{time_str}] {btn_name} PULSADO - Gap: {gap_ms if gap_ms else '-'}ms - Chatter: {is_chatter}\n")
                    log_file.flush()

                elif ev_value == 0:  # Soltado
                    hold_ms = None
                    if ev_code in last_press_time:
                        hold_ms = (event_time - last_press_time[ev_code]) * 1000.0

                    last_release_time[ev_code] = event_time

                    hold_col = f"Mantenido: {hold_ms:.1f} ms" if hold_ms is not None else "-"
                    print(f"{time_str:<14} | {btn_name:<22} | {'SOLTADO':<10} | {hold_col:<25} | -")
                    log_file.write(f"[{time_str}] {btn_name} SOLTADO - Hold: {hold_ms if hold_ms else '-'}ms\n")
                    log_file.flush()

    except KeyboardInterrupt:
        print("\n" + "=" * 65)
        print(f"  {BOLD}RESUMEN DE DIAGNÓSTICO DE HARDWARE{RESET}")
        print("=" * 65)
        print(f"  Total clics registrados:         {total_clicks}")
        print(f"  Rebotes / Chatter detectados:    {chatter_count}")
        if chatter_count > 0:
            print(f"\n  {RED}{BOLD}❌ RESULTADO: Se han detectado micro-rebotes involuntarios.{RESET}")
            print("     El microswitch físico está soltándose y reconectándose.")
            print("     Esto confirma el fallo mecánico de desgaste u óxido.")
        else:
            print(f"\n  {GREEN}✅ RESULTADO: No se registraron rebotes inferiores a {CHATTER_THRESHOLD_MS}ms.{RESET}")
        print("=" * 65)
    finally:
        os.close(fd)
        log_file.close()

if __name__ == "__main__":
    main()
