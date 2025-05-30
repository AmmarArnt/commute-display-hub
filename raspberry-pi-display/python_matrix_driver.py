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
# RE-ADD legacy font and text imports
from luma.core.legacy.font import CP437_FONT
from luma.core.legacy import text, textsize

# --- Constants ---
SCROLL_SPEED_PPS = 15 # Pixels per second

def parse_time_string(message):
    """Extract time part (though pause logic is removed)."""
    if not message:
        return None
    match_min = re.search(r'(\b\d+\s+min)$|\b(Nu)$|(\b\d{1,2}:\d{2})$|(\b\d+)$|', message)
    if match_min:
        return next((g for g in match_min.groups() if g is not None), None)
    return None

def get_message_width(message, font):
    """Calculate width using legacy textsize function."""
    try:
        if not message:
            return 0
        # REVERT to simple textsize call for CP437_FONT
        width, _ = textsize(message, font=font)
        return width
    except Exception as e:
        print(f"Warning: Could not calculate legacy text width for '{message}': {e}. Estimating.", file=sys.stderr)
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

    # --- Font Selection ---
    # REMOVE Terminus font loading block
    # try:
    #     font_path = "/usr/share/fonts/truetype/terminus/TerminusTTF-4.46.0.ttf"
    #     selected_font = ImageFont.truetype(font_path, 8)
    #     print(f"Using font: {font_path} with size 8")
    # except IOError:
    #     print(f"ERROR: Font file not found at {font_path}. Please ensure fonts-terminus is installed.", file=sys.stderr)
    #     sys.exit(1)
    # except Exception as e:
    #     print(f"ERROR: Loading font {font_path}: {e}", file=sys.stderr)
    #     traceback.print_exc(file=sys.stderr)
    #     sys.exit(1)
    selected_font = CP437_FONT # <--- REVERT to CP437_FONT
    print(f"Using font: CP437_FONT")

    # Set brightness (contrast)
    try:
        device.contrast(16)
        print("Device contrast set to 16.")
    except Exception as e:
        print(f"WARNING: Could not set contrast: {e}", file=sys.stderr)

    print("Ready to receive messages from stdin and scroll once...")

    # Loop indefinitely, reading from stdin
    while True:
        try:
            # Read one line from stdin (BLOCKING)
            line = sys.stdin.readline()
            if not line:
                print("Stdin closed (EOF received). Exiting.")
                break # Exit loop on EOF

            # RE-ENABLE Swedish character replacement
            # display_message = line.strip()
            # display_message = line.strip().replace('Ö', 'O').replace('ö', 'o') \ 
            #                               .replace('Ä', 'A').replace('ä', 'a') \ 
            #                               .replace('Å', 'A').replace('å', 'a') # <--- OLD character replacement

            display_message = line.strip()
            # Map Swedish Unicode characters to their respective CP437 codepoint characters
            display_message = display_message.replace('Å', chr(143)) # Å -> CP437 code 143
            display_message = display_message.replace('Ä', chr(142)) # Ä -> CP437 code 142
            display_message = display_message.replace('Ö', chr(153)) # Ö -> CP437 code 153
            display_message = display_message.replace('å', chr(134)) # å -> CP437 code 134
            display_message = display_message.replace('ä', chr(132)) # ä -> CP437 code 132
            display_message = display_message.replace('ö', chr(148)) # ö -> CP437 code 148

            print(f"Received message: '{display_message}'")

            # If message is empty, clear display and signal DONE
            if not display_message:
                print("Received empty message. Clearing display.")
                with canvas(device) as draw:
                    pass # Clears the canvas
                print("DONE", flush=True) # Signal completion
                continue # Wait for next message

            # Calculate width for the received message
            message_pixel_width = get_message_width(display_message, selected_font)
            print(f"Message width: {message_pixel_width}")

            # Reset scroll parameters for this message
            current_x_offset = 0.0
            last_update_time = time.monotonic()

            # === Nested Scroll Loop for this message ===
            print("Starting scroll...")
            while True:
                time_now = time.monotonic()
                time_delta = time_now - last_update_time
                current_x_offset += SCROLL_SPEED_PPS * time_delta
                last_update_time = time_now

                # Calculate draw position
                draw_x = device.width - int(current_x_offset)

                # Draw the frame
                with canvas(device) as draw:
                    # REVERT to legacy text() and y=0
                    text(draw, (draw_x, 0), display_message, font=selected_font, fill="white")

                # Check if scroll is complete (message moved off left edge)
                if draw_x < -message_pixel_width:
                    print(f"Scroll complete (draw_x={draw_x}).")
                    break # Exit the nested scroll loop
                
                time.sleep(0.01) 
            # === End of Nested Scroll Loop ===

            # Signal that this message is DONE scrolling
            print("DONE", flush=True)

        except KeyboardInterrupt:
            print("\nKeyboardInterrupt received. Exiting.")
            break
        except Exception as e:
            print(f"ERROR during main loop: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            time.sleep(1)

    print("Script finished.")
    if device:
        try:
            device.clear()
        except Exception as e:
            print(f"WARNING: Failed to clear device on exit: {e}", file=sys.stderr)

if __name__ == "__main__":
    main() 