import spidev
import time

spi = spidev.SpiDev()
bus = 0  # SPI bus 0
device = 0 # Device CS0

try:
    spi.open(bus, device)
    print(f"Opened SPI device {bus}.{device} successfully.")

    # Set SPI speed and mode (these are common for MAX7219)
    spi.max_speed_hz = 1000000 # 1 MHz
    spi.mode = 0

    print("Sending simple test data (0x01, 0x02, 0x03)...")
    resp = spi.xfer2([0x01, 0x02, 0x03]) # Send some bytes
    print(f"Received response (may not be meaningful): {resp}")
    print("SPI test sequence completed without errors.")

except Exception as e:
    print(f"Error during SPI test: {e}")

finally:
    spi.close()
    print("SPI device closed.") 