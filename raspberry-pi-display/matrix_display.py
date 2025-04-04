#!/usr/bin/env python3
import time
import argparse
import sys

# Import luma libraries
from luma.led_matrix.device import max7219
from luma.core.interface.serial import spi, noop
from luma.core.render import canvas
from luma.core.virtual import viewport
from luma.core.legacy import text, show_message
from luma.core.legacy.font import proportional, CP437_FONT, TINY_FONT, SINCLAIR_FONT, LCD_FONT

def main(cascaded, block_orientation, rotate, inreverse, message):
    # Setup the matrix device
    try:
        serial = spi(port=0, device=0, gpio=noop())
        device = max7219(
            serial,
            cascaded=cascaded or 1,
            block_orientation=block_orientation or 0,
            rotate=rotate or 0,
            blocks_arranged_in_reverse_order=inreverse or False
        )
        print(f"Created device with config: cascaded={cascaded}, orientation={block_orientation}, rotate={rotate}, reverse={inreverse}")
    except Exception as e:
        print(f"Error initializing luma.led_matrix: {e}", file=sys.stderr)
        # Specific check for permission errors
        if "Errno 13" in str(e):
            print("Permission error: Try running with sudo.", file=sys.stderr)
        sys.exit(1)

    # Set brightness (contrast)
    try:
        device.contrast(16) # Set contrast/brightness (0-255 range, 16 is a decent starting point)
        print("Device contrast set to 16.")
    except Exception as e:
        print(f"Warning: Could not set contrast: {e}", file=sys.stderr)

    if not message:
        message = "Hello world!"
        print("No message provided, using default.")

    print(f"Displaying: {message}")

    # Display the message horizontally
    # Using a large scroll_delay initially to prevent instant exit if message is short
    # A better approach might be to loop or hold the last frame
    try:
        show_message(device, message, fill="white", font=proportional(CP437_FONT), scroll_delay=0.1)
        # Keep the script alive briefly to show the message
        print("Message display initiated. Sleeping for 10 seconds...")
        time.sleep(10) # Keep alive for 10 seconds 
    except KeyboardInterrupt:
        print("\nExiting by user request.")
    except Exception as e:
        print(f"Error during show_message: {e}", file=sys.stderr)
    finally:
        # Clean up? The library might handle this on exit.
        print("Script finished.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='matrix_display arguments',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )

    parser.add_argument('--cascaded', '-n', type=int, default=1, help='Number of cascaded MAX7219 LED matrices')
    parser.add_argument('--block-orientation', type=int, default=0, choices=[0, 90, -90], help='Corrects block orientation when wired vertically')
    parser.add_argument('--rotate', type=int, default=0, choices=[0, 1, 2, 3], help='Rotate display 0=0°, 1=90°, 2=180°, 3=270°')
    parser.add_argument('--reverse-order', type=bool, default=False, help='Set to true if blocks are in reverse order')
    parser.add_argument('message', type=str, nargs='?', help='The message string to display') # Optional message argument

    args = parser.parse_args()

    try:
        main(args.cascaded, args.block_orientation, args.rotate, args.reverse_order, args.message)
    except KeyboardInterrupt:
        pass # Already handled in main or caught here 