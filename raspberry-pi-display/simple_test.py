#!/usr/bin/env python3
import sys
import time

# Import luma libraries needed for basic display
from luma.led_matrix.device import max7219
from luma.core.interface.serial import spi, noop
from luma.core.legacy import show_message
from luma.core.legacy.font import proportional, CP437_FONT

def main():
    # Hardcoded message
    message = "134 Östberghöjden 3 min"

    # Setup the matrix device
    try:
        print("Initializing device...")
        serial = spi(port=0, device=0, gpio=noop())
        # Using basic defaults: cascaded=1, rotate=0, etc.
        device = max7219(serial, cascaded=1)
        print("Device initialized.")
    except Exception as e:
        print(f"Error initializing luma.led_matrix: {e}", file=sys.stderr)
        if "Errno 13" in str(e):
            print("Permission error: Try running with sudo.", file=sys.stderr)
        sys.exit(1)

    # Set brightness (contrast)
    try:
        device.contrast(16) # Set contrast/brightness (0-255 range, 16 is a decent starting point)
        print("Device contrast set to 16.")
    except Exception as e:
        print(f"Warning: Could not set contrast: {e}", file=sys.stderr)

    print(f"Attempting to display: '{message}'")

    # Display the message using the simple show_message function
    try:
        # scroll_delay determines speed. Lower is faster.
        show_message(device, message, fill="white", font=proportional(CP437_FONT), scroll_delay=0.1)
    except KeyboardInterrupt:
        print("\nExiting by user request.")
    except Exception as e:
        print(f"Error during show_message: {e}", file=sys.stderr)
    finally:
        print("Script finished.")
        # Optional: Clear display on exit
        try:
            device.clear()
        except:
            pass

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass 