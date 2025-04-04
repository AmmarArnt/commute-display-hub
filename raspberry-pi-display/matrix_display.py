#!/usr/bin/env python3
import time
import argparse
import sys
import select  # For non-blocking stdin read

# Import luma libraries
from luma.led_matrix.device import max7219
from luma.core.interface.serial import spi, noop
from luma.core.render import canvas
from luma.core.virtual import viewport # We might not need viewport if drawing manually
# Import the specific functions/constants needed
import luma.core.legacy # Import parent module
from luma.core.legacy.font import CP437_FONT # Use basic font first

def get_message_width(message, font):
    """Calculate the pixel width of a message using the specified font."""
    # Use the legacy text module's width function for the whole string
    try:
        # Call through the parent module
        return luma.core.legacy.text.width(message, font=font)
    except Exception as e:
        print(f"Warning: Could not calculate text width: {e}. Estimating.", file=sys.stderr)
        return len(message) * 6 # Estimate

def main(cascaded, block_orientation, rotate, inreverse):
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

    # --- Main Loop --- 
    current_message = "Waiting for data..."
    last_update_time = time.monotonic()
    scroll_speed_pps = 30  # Pixels per second
    current_x_offset = 0
    # Use the basic font object directly
    selected_font = CP437_FONT

    print("Ready to receive messages from stdin...")
    
    try:
        while True:
            # --- Check for new message from stdin (non-blocking) ---
            # Use select to check if stdin has data without blocking the loop
            # Use a short timeout (0.01s) for responsiveness
            readable, _, _ = select.select([sys.stdin], [], [], 0.01)
            if readable:
                line = sys.stdin.readline()
                if not line: # EOF means the Node process likely exited
                    print("Stdin closed. Exiting.")
                    break 
                new_message = line.strip()
                if new_message: # Only update if line wasn't empty
                    current_message = new_message
                    print(f"Received: {current_message}")
                    # Reset scroll position when message changes
                    current_x_offset = 0 
                    last_update_time = time.monotonic()

            # --- Calculate Scroll Position ---
            message_width = get_message_width(current_message, selected_font)
            time_now = time.monotonic()
            time_delta = time_now - last_update_time
            last_update_time = time_now

            # Increment scroll offset
            current_x_offset += scroll_speed_pps * time_delta

            # Reset offset if scrolled past message width + screen width
            # Add device width to ensure it scrolls fully off screen
            reset_scroll_threshold = message_width if message_width > device.width else device.width
            if current_x_offset > reset_scroll_threshold:
                 current_x_offset = 0

            # Calculate the x position for drawing (start off-screen right)
            draw_x = device.width - int(current_x_offset)

            # --- Draw the Frame ---
            with canvas(device) as draw:
                 # Call through the parent module
                luma.core.legacy.text.draw(draw, (draw_x, 0), current_message, font=selected_font, fill="white")
            
            # Small sleep to control frame rate / CPU usage
            # time.sleep(0.02) # ~50 FPS target, adjust as needed
            # Note: The select timeout above already provides some delay

    except KeyboardInterrupt:
        print("\nExiting by user request.")
    except Exception as e:
        print(f"Error during main loop: {e}", file=sys.stderr)
    finally:
        print("Script finished.")
        # Optional: Clear display on exit
        try:
            device.clear()
        except:
            pass 

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Continuously scrolls text received from stdin on MAX7219 matrix',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )

    parser.add_argument('--cascaded', '-n', type=int, default=1, help='Number of cascaded MAX7219 LED matrices')
    parser.add_argument('--block-orientation', type=int, default=0, choices=[0, 90, -90], help='Corrects block orientation when wired vertically')
    parser.add_argument('--rotate', type=int, default=0, choices=[0, 1, 2, 3], help='Rotate display 0=0°, 1=90°, 2=180°, 3=270°')
    parser.add_argument('--reverse-order', type=bool, default=False, help='Set to true if blocks are in reverse order')

    args = parser.parse_args()

    try:
        main(args.cascaded, args.block_orientation, args.rotate, args.reverse_order)
    except KeyboardInterrupt:
        pass # Already handled in main 