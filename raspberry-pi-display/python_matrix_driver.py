#!/usr/bin/env python3
# This file is now python_matrix_driver.py
import sys
import time
import traceback # For detailed error logging
import select  # For non-blocking stdin read
import re

# Import luma libraries needed for basic display
from luma.led_matrix.device import max7219
from luma.core.interface.serial import spi, noop
from luma.core.render import canvas
# Import only the font data structure
from luma.core.legacy.font import CP437_FONT
# Import legacy text function and proportional font wrapper from example
from luma.core.legacy import text, show_message
# Import Pillow font for static pause frame drawing
from PIL import ImageFont

# --- Constants ---
SCROLL_SPEED_PPS = 12 # Not needed for show_message
SCROLL_DELAY = 0.05 # Controls speed for show_message (lower is faster)
END_PAUSE_S = 10
SELECT_TIMEOUT = 0.05 # Timeout for checking stdin during pause (slightly longer)
DEFAULT_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_SIZE = 8 # Use 8 for Pillow font, draw at y=0

def load_pillow_font(font_path=DEFAULT_FONT_PATH, size=FONT_SIZE):
    """Load a TTF font using Pillow."""
    try:
        return ImageFont.truetype(font_path, size)
    except Exception as e:
        print(f"ERROR: Failed to load Pillow font {font_path}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        # Fallback or exit if font is critical
        return None

def get_pillow_message_width(draw, message, font):
    """Calculate width using Pillow (needed for static frame)."""
    try:
        if not message or not font:
            return 0
        # Use textbbox if available (Pillow >= 7.2.0)
        bbox = draw.textbbox((0, 0), message, font=font)
        return bbox[2] - bbox[0] # width = x1 - x0
    except AttributeError:
        # Fallback to textsize for older Pillow
        try:
            size = draw.textsize(message, font=font)
            print(f"Warning: Using older Pillow draw.textsize for width calc.", file=sys.stderr)
            return size[0]
        except Exception as e_size:
            print(f"Warning: Pillow width calc failed (textsize): {e_size}. Estimating.", file=sys.stderr)
            return len(message or "") * 6 # Rough estimate
    except Exception as e:
        print(f"Warning: Could not calculate Pillow text width for '{message}': {e}. Estimating.", file=sys.stderr)
        return len(message or "") * 6

def parse_time_string(message):
    """Extract time part for pausing logic."""
    if not message:
        return None
    match_min = re.search(r'(\b\d+\s+min)$|\b(Nu)$|(\b\d{1,2}:\d{2})$|(\b\d+)$|', message)
    if match_min:
        return next((g for g in match_min.groups() if g is not None), None)
    return None

def get_message_width(message, font):
    """Calculate width using legacy text.width function."""
    try:
        if not message:
            return 0
        return text.width(message, font=font)
    except Exception as e:
        print(f"Warning: Could not calculate text width for '{message}': {e}. Estimating.", file=sys.stderr)
        return len(message or "") * 6

def main():
    # Remove hardcoded message
    # message = "134 Östberghöjden 3 min"

    # Setup the matrix device
    device = None # Initialize to None
    try:
        print("Initializing device...")
        serial = spi(port=0, device=0, gpio=noop())
        device = max7219(
            serial, 
            cascaded=4, 
            block_orientation=-90 
        )
        print("Device initialized.")
    except Exception as e:
        print(f"ERROR: Initializing luma.led_matrix: {e}", file=sys.stderr)
        if "Errno 13" in str(e):
            print("ERROR: Permission error. Try running with sudo.", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

    # Set brightness (contrast)
    try:
        device.contrast(16)
        print("Device contrast set to 16.")
    except Exception as e:
        print(f"WARNING: Could not set contrast: {e}", file=sys.stderr)

    print("Ready to receive messages from stdin...")
    
    # Loop indefinitely, reading from stdin
    while True:
        draw_x = 0
        try:
            time_now = time.monotonic()

            # --- Check for Stdin ---
            readable, _, _ = select.select([sys.stdin], [], [], SELECT_TIMEOUT)
            if readable:
                line = sys.stdin.readline()
                if not line:
                    print("Stdin closed (EOF received). Exiting.")
                    break
                new_msg_from_stdin = line.strip()
                if new_msg_from_stdin:
                    print(f"Received buffer: {new_msg_from_stdin}")
                    # *** Store in buffer, don't update display yet ***
                    next_message = new_msg_from_stdin
                else:
                    # Handle empty line received - clear the buffer too?
                    # Or maybe clear the display immediately?
                    # Let's clear the buffer and eventually the display will clear
                    print("Received empty line buffer.")
                    next_message = "" # Signal to clear display on next cycle

            # --- State Machine Logic ---
            if state == "scrolling":
                time_delta = time_now - last_update_time
                current_x_offset += SCROLL_SPEED_PPS * time_delta
                last_update_time = time_now

                end_pause_trigger_offset = float(message_pixel_width - device.width)

                # Check if we should pause
                if time_string and message_pixel_width > device.width and current_x_offset >= end_pause_trigger_offset:
                    print(f"Reached end position (Offset: {current_x_offset:.1f}). Pausing...")
                    pause_draw_x = device.width - message_pixel_width
                    state = "paused"
                    pause_start_time = time_now

                # Calculate draw_x for scrolling state
                draw_x = device.width - int(current_x_offset)

            elif state == "paused":
                draw_x = pause_draw_x

                if (time_now - pause_start_time) >= END_PAUSE_S:
                    print("Pause finished. Entering idle state.")
                    state = "idle_after_pause"

            elif state == "idle_after_pause":
                draw_x = pause_draw_x

                # *** Check buffer for next message ***
                if next_message is not None:
                    print(f"Processing buffered message: {next_message}")
                    current_message = next_message
                    display_message = current_message.replace('Ö', 'O').replace('ö', 'o')
                    next_message = None # Clear buffer
                    # Recalculate width
                    message_pixel_width = get_message_width(display_message, selected_font)
                    time_string = parse_time_string(display_message)
                    # Reset state to start scrolling the new message
                    current_x_offset = 0.0
                    last_update_time = time_now
                    state = "scrolling"
                    pause_start_time = 0
                    pause_draw_x = 0
                # else: No new message, just stay idle displaying the last frame

            # --- Draw Frame ---
            with canvas(device) as draw:
                if display_message:
                    text(draw, (draw_x, 0), display_message, font=selected_font, fill="white")

        except KeyboardInterrupt:
            print("\nKeyboardInterrupt received. Exiting.")
            break # Exit the while loop
        except Exception as e:
            # Catch other errors during the loop to prevent crashing
            print(f"ERROR during display loop: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            # Optional: pause briefly before trying to read again
            time.sleep(1)

    print("Script finished.")
    # Clean up display on exit
    if device:
        try:
            device.clear()
        except Exception as e:
            print(f"WARNING: Failed to clear device on exit: {e}", file=sys.stderr)

if __name__ == "__main__":
    main() # No KeyboardInterrupt handling needed here, it's in main's loop 