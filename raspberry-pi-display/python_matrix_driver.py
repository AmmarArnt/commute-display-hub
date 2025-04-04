#!/usr/bin/env python3
# This file is now python_matrix_driver.py
import sys
import time
import traceback # For detailed error logging

# Import luma libraries needed for basic display
from luma.led_matrix.device import max7219
from luma.core.interface.serial import spi, noop
from luma.core.legacy import show_message
from luma.core.legacy.font import proportional, CP437_FONT

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
        try:
            # Read a line from standard input (blocking)
            line = sys.stdin.readline()

            # If readline returns an empty string, it means EOF (stdin closed)
            if not line:
                print("Stdin closed (EOF received). Exiting.")
                break 

            message = line.strip()
            if not message:
                print("Received empty line, skipping display.")
                continue

            print(f"Attempting to display: '{message}'")
            
            # Display the received message using show_message
            # This will block until scrolling is complete
            show_message(device, message, fill="white", font=proportional(CP437_FONT), scroll_delay=0.1)
            print(f"Finished displaying: '{message}'")

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