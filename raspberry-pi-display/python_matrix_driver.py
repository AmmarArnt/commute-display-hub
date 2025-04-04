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
# Pillow imports for drawing and fonts
from PIL import ImageFont

# --- Constants ---
SCROLL_SPEED_PPS = 12 # SLOWED DOWN SCROLL SPEED FURTHER
END_PAUSE_S = 10
SELECT_TIMEOUT = 0.02
# Common path for DejaVu Sans font on Raspberry Pi OS/Debian
DEFAULT_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_SIZE = 8 # REDUCED FONT SIZE TO FIT DESCENDERS

def load_font(font_path=DEFAULT_FONT_PATH, size=FONT_SIZE):
    """Load a TTF font using Pillow."""
    try:
        return ImageFont.truetype(font_path, size)
    except IOError:
        print(f"ERROR: Font file not found at {font_path}. Using fallback.", file=sys.stderr)
        # Luma provides a fallback mechanism if Pillow isn't fully used,
        # but draw.text requires a valid Pillow font object.
        # We might need a bundled basic font as a true fallback.
        # For now, exit if default font fails.
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Failed to load font {font_path}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

def get_message_width(draw, message, font):
    """Calculate the pixel width using Pillow's textlength."""
    try:
        if not message:
            return 0
        # Use Pillow's draw.textlength (available from Pillow 8.0.0)
        # For older versions, draw.textsize might be needed, but textlength is preferred
        bbox = draw.textbbox((0, 0), message, font=font)
        return bbox[2] - bbox[0] # width = x1 - x0
        # Alternative for older Pillow: return draw.textsize(message, font=font)[0]
    except AttributeError:
        # Fallback for very old Pillow versions lacking textbbox/textlength?
        print(f"Warning: Pillow version might be too old for textbbox. Estimating width.", file=sys.stderr)
        return len(message or "") * 6 # Rough estimate
    except Exception as e:
        print(f"Warning: Could not calculate text width for '{message}': {e}. Estimating.", file=sys.stderr)
        return len(message or "") * 6

def parse_time_string(message):
    """Extract time part for pausing logic."""
    if not message:
        return None
    match_min = re.search(r'(\b\d+\s+min)$|\b(Nu)$|(\b\d{1,2}:\d{2})$|(\b\d+)$|', message)
    if match_min:
        return next((g for g in match_min.groups() if g is not None), None)
    return None

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
                new_message = line.strip()
                if new_message:
                    print(f"Received original: {new_message}")
                    current_message = new_message
                    display_message = current_message.replace('Ö', 'O').replace('ö', 'o')
                    print(f"Using display: {display_message}")
                    # Recalculate widths
                    with canvas(device) as _temp_draw: 
                        message_pixel_width = get_message_width(_temp_draw, display_message, selected_font)
                        time_string = parse_time_string(display_message)
                        time_string_pixel_width = get_message_width(_temp_draw, time_string, selected_font) if time_string else 0
                    # Reset state
                    current_x_offset = 0.0
                    last_update_time = time_now
                    state = "scrolling"
                    pause_start_time = 0
                    pause_draw_x = 0
                else:
                    # Handle empty line: clear display
                    print("Received empty line, clearing display.")
                    current_message = ""
                    display_message = ""
                    message_pixel_width = 0
                    time_string = None
                    time_string_pixel_width = 0
                    current_x_offset = 0.0
                    state = "scrolling" # Will just show blank

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

            # --- Draw Frame ---
            with canvas(device) as draw:
                if display_message:
                    # Use Pillow's draw.text with the loaded TTF font
                    draw.text((draw_x, 0), display_message, font=selected_font, fill="white")

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
    # --- Font Loading ---
    selected_font = load_font()
    print(f"Font loaded: {DEFAULT_FONT_PATH}")

    main() # No KeyboardInterrupt handling needed here, it's in main's loop 