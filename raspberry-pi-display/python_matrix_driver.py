#!/usr/bin/env python3
# This file is now python_matrix_driver.py
import sys
import time
import traceback # For detailed error logging
import select  # For non-blocking stdin read
import re

# Import PIL for TTF font support
from PIL import ImageFont

# Import luma libraries needed for basic display
from luma.led_matrix.device import max7219
from luma.core.interface.serial import spi, noop
from luma.core.render import canvas
# Import legacy textsize function (text function is no longer used)
from luma.core.legacy import textsize # Removed text, kept textsize

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
        # For TTF fonts, textsize might not be available or work the same way.
        # We'll use a more robust way if using PIL ImageFont directly.
        # This function might need further adjustment depending on how text rendering is done
        # with the new font object. Luma's legacy text() might handle PIL fonts.
        if hasattr(font, 'getbbox'): # Check if it's a PIL ImageFont
            left, top, right, bottom = font.getbbox(message)
            return right - left
        else: # Fallback for other font types or if legacy textsize is still used
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
    # selected_font = CP437_FONT # Use font object directly
    # print(f"Using font: CP437_FONT")
    try:
        font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
        # Using a common size for 8-pixel high matrices. Adjust if needed.
        selected_font = ImageFont.truetype(font_path, 8)
        print(f"Using font: {font_path} with size 8")
    except IOError:
        print(f"ERROR: Font file not found at {font_path}. Please install fonts-dejavu.", file=sys.stderr)
        print("Attempting to run: sudo apt-get install -y fonts-dejavu", file=sys.stderr)
        # Optionally, you could try to run the install command here, but it's better to do it separately.
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Loading font {font_path}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

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

            # RE-ADD REPLACEMENT
            # display_message = line.strip().replace('Ö', 'O').replace('ö', 'o') \
            #                               .replace('Ä', 'A').replace('ä', 'a') \
            #                               .replace('Å', 'A').replace('å', 'a')
            display_message = line.strip() # No more replacement needed
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
                    draw.text((draw_x, 0), display_message, font=selected_font, fill="white")

                # Check if scroll is complete (message moved off left edge)
                if draw_x < -message_pixel_width:
                    print(f"Scroll complete (draw_x={draw_x}).")
                    break # Exit the nested scroll loop
                
                # Small sleep to prevent high CPU usage
                # Adjust if scrolling seems jerky or too slow/fast overall
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
            # Attempt to recover or just exit?
            # Maybe signal an error state?
            # For now, just print and try to continue
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