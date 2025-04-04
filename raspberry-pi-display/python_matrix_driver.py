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
# Import legacy text function AND textsize function
from luma.core.legacy import text, textsize

# --- Constants ---
SCROLL_SPEED_PPS = 13 # Need this for manual scrolling
SCROLL_DELAY = 0.05 # Might not be used now, legacy text uses speed
END_PAUSE_S = 10
SELECT_TIMEOUT = 0.05 # Timeout for checking stdin during pause (slightly longer)

def parse_time_string(message):
    """Extract time part for pausing logic."""
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
        # Use legacy textsize function - it returns (width, height)
        width, _ = textsize(message, font=font)
        return width
    except Exception as e:
        print(f"Warning: Could not calculate legacy text width for '{message}': {e}. Estimating.", file=sys.stderr)
        # CP437 is mostly 6px wide, use that as fallback
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
    selected_font = CP437_FONT # Use font object directly
    print(f"Using font: CP437_FONT")

    # Set brightness (contrast)
    try:
        device.contrast(16)
        print("Device contrast set to 16.")
    except Exception as e:
        print(f"WARNING: Could not set contrast: {e}", file=sys.stderr)

    # --- State Variable Initialization ---
    current_message = "Starting..." # Start with a default message
    display_message = current_message # Initially display it as is
    next_message = None # Buffer for incoming messages
    message_pixel_width = get_message_width(display_message, selected_font)
    time_string = parse_time_string(display_message)

    current_x_offset = 0.0
    last_update_time = time.monotonic()
    state = "idle_after_pause" # Start in idle, wait for first message
    pause_start_time = 0
    pause_draw_x = 0

    print("Ready to receive messages from stdin...")

    # Loop indefinitely, reading from stdin
    while True:
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
                    # Store in buffer, state machine will pick it up
                    next_message = new_msg_from_stdin
                else:
                    # Handle empty line received - clear the buffer
                    print("Received empty line buffer.")
                    next_message = "" # Signal to clear display on next cycle

            # --- State Machine Logic ---
            # Log state BEFORE checking transitions
            # print(f"DEBUG: Loop start. State={state}, NextMsg='{next_message}'")

            # If we are idle and have a message, start scrolling it
            # Also handle the initial state here
            print(f"DEBUG: Checking idle transition. State={state}, NextMsg='{next_message}'")
            if state == "idle_after_pause" and next_message is not None:
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

            if state == "scrolling":
                # *** Check buffer for next message EVEN DURING SCROLLING *** ADDED BLOCK
                if next_message is not None:
                    print(f"SCROLL INTERRUPTED by buffered message: {next_message}")
                    current_message = next_message
                    display_message = current_message.replace('Ö', 'O').replace('ö', 'o')
                    next_message = None # Clear buffer
                    # Recalculate width
                    message_pixel_width = get_message_width(display_message, selected_font)
                    time_string = parse_time_string(display_message)
                    # Reset state to start scrolling the new message
                    current_x_offset = 0.0
                    last_update_time = time_now
                    state = "scrolling" # Remain scrolling, but reset parameters
                    pause_start_time = 0
                    pause_draw_x = 0
                    # Skip the rest of the scrolling logic for this loop iteration
                    # as we just reset the offset and message
                    continue # Use continue to restart loop with new scroll params
                # *** END ADDED BLOCK ***

                time_delta = time_now - last_update_time
                current_x_offset += SCROLL_SPEED_PPS * time_delta
                last_update_time = time_now

                # Calculate the point where the *end* of the message reaches the *left* edge
                # message_width is how long the text is
                # device.width is how wide the screen is
                # We want to pause when the last pixel of text is at x=0
                # This happens when the starting draw_x = 0 - message_width + device.width
                # Or in terms of offset: offset = message_width - device.width
                end_pause_trigger_offset = float(message_pixel_width - device.width)

                # Calculate draw_x for scrolling state (moves from right to left)
                draw_x = device.width - int(current_x_offset)

                # Check if we should pause (only if message is wider than screen)
                if time_string and message_pixel_width > device.width and current_x_offset >= end_pause_trigger_offset:
                    print(f"Reached end position (Offset: {current_x_offset:.1f}, Trigger: {end_pause_trigger_offset:.1f}). Pausing...")
                    # Calculate the x position to draw the text so the time_string aligns right
                    time_string_width = get_message_width(time_string, selected_font)
                    # pause_draw_x = device.width - time_string_width # Align time string right
                    # Let's try drawing the *whole message* but stopped at the end
                    pause_draw_x = device.width - message_pixel_width
                    state = "paused"
                    pause_start_time = time_now

                # Check if message has scrolled completely off screen
                elif draw_x < -message_pixel_width:
                    print(f"Message fully scrolled off (draw_x={draw_x}, width={message_pixel_width}). Entering idle.")
                    state = "idle_after_pause"
                    display_message = "" # Clear display for idle state

            elif state == "paused":
                print(f"DEBUG: In paused state. Time remaining: {END_PAUSE_S - (time_now - pause_start_time):.1f}s")
                draw_x = pause_draw_x # Keep the position fixed

                # Check if pause duration is over
                if (time_now - pause_start_time) >= END_PAUSE_S:
                    print("Pause finished. Entering idle state and clearing display.")
                    state = "idle_after_pause"
                    display_message = "" # <--- ADDED: Clear the message for idle state
                    # pause_draw_x = 0 # Resetting draw_x for idle isn't strictly needed if message is empty

                # *** Check buffer for next message EVEN DURING PAUSE ***
                if next_message is not None:
                    print(f"PAUSE INTERRUPTED by buffered message: {next_message}")
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

            elif state == "idle_after_pause":
                 print(f"DEBUG: In idle_after_pause state. DisplayMsg='{display_message}'")
                 # If we are here, we are displaying the last frame of the previous message
                 # or the initial "Starting..." message, or blank.
                 # Use the previously calculated pause_draw_x only if message not blank
                 draw_x = pause_draw_x if display_message else 0 # Adjust draw_x for blank
                 # The check for next_message at the top of the state logic handles transitions out

            # --- Draw Frame ---
            with canvas(device) as draw:
                if display_message:
                    # Use legacy text function with legacy font
                    text(draw, (draw_x, 0), display_message, font=selected_font, fill="white")
                # else: If display_message is empty (e.g., from empty buffer), canvas clears itself

        except KeyboardInterrupt:
            print("KeyboardInterrupt received. Exiting.")
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