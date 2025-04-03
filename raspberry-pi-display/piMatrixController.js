// Uses rpi-led-matrix library for hardware control
const { LedMatrix } = require('rpi-led-matrix');
const font = require('./font'); // Load the font data

// Helper to convert font character data to pixel operations
// This assumes font data is an array of rows, where each row is an array of 0s and 1s
function drawChar(matrix, charData, xOffset, yOffset, color) {
    if (!charData) return 0; // Return 0 width if charData is missing
    
    let charWidth = 0;
    charData.forEach((row, y) => {
        if (row) { // Check if row exists
           charWidth = Math.max(charWidth, row.length);
            row.forEach((pixel, x) => {
                if (pixel === 1) {
                    matrix.setPixel(xOffset + x, yOffset + y, color.r, color.g, color.b);
                }
            });
        } 
    });
    return charWidth;
}

class PiMatrixController {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.matrix = null; // Initialize lazily or handle potential errors
        
        try {
            console.log('[PiMatrixController] Initializing rpi-led-matrix...');
            // Basic configuration, adjust chainLength, parallel, hardwareMapping as needed
            // These defaults often work for single MAX7219 modules via SPI
            this.matrix = new LedMatrix(
                { width: width, height: height }, // Matrix options
                { // Runtime options
                    gpioSlowdown: 1, // Adjust if needed
                    scanMode: 1, // Check hardware docs, 1 often works for MAX7219
                    pwmBits: 11, // Default
                    brightness: 50, // 0-100
                    chainLength: 1, // Number of matrices daisy-chained
                    parallel: 1, // Number of parallel chains
                    hardwareMapping: 'regular', // Common mapping
                    // Add other options like pixelMapperScript if needed
                }
            );
            this.clear(); // Start with a clear matrix
            console.log('[PiMatrixController] rpi-led-matrix initialized successfully.');
        } catch (error) {
            console.error('[PiMatrixController] Failed to initialize rpi-led-matrix:', error);
            console.error('[PiMatrixController] Ensure SPI is enabled (sudo raspi-config) and the library is installed correctly.');
            // Fallback or rethrow depending on desired behavior
            // For now, we'll let it proceed but methods will fail if matrix is null
        }
    }

    clear() {
        if (!this.matrix) return;
        console.log('[PiMatrixController] Clearing matrix.');
        this.matrix.clear();
        this.sync(); // Apply the clear immediately
    }

    // Note: rpi-led-matrix handles colors (r, g, b)
    // We'll default to white for simplicity
    drawPixel(x, y, r = 255, g = 255, b = 255) {
        if (!this.matrix) return;
        // Basic bounds check (library might also do this)
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
             // console.log(`[PiMatrixController] Setting pixel (${x}, ${y})`); // Very verbose
            this.matrix.setPixel(x, y, r, g, b);
            // No sync here - typically sync after drawing a full frame
        }
    }

    drawText(text, xOffset = 0, yOffset = 0, color = { r: 255, g: 255, b: 255 }, charSpacing = 1) {
        if (!this.matrix) return 0;
        
        let currentX = xOffset;
        let totalWidth = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const charData = font[char] || font[' ']; // Use space for unknown chars
            
            if (charData) {
                const charWidth = drawChar(this.matrix, charData, currentX, yOffset, color);
                currentX += charWidth + charSpacing; 
                totalWidth += charWidth + charSpacing;
            } else {
                 // Handle truly missing characters (if font[' '] was also missing)
                 const spaceWidth = drawChar(this.matrix, font[' '], currentX, yOffset, color);
                 currentX += spaceWidth + charSpacing;
                 totalWidth += spaceWidth + charSpacing;
            }
        }
        // No sync here - sync after full frame/scroll step
        return totalWidth > 0 ? totalWidth - charSpacing : 0; // Return calculated width
    }
    
    // --- Scrolling Specific --- 
    // Renders text that might be wider than the matrix, starting at a specific x offset
    // Returns the calculated width of the text in pixels
    drawScrollingText(text, scrollXOffset, yOffset = 0, color = { r: 255, g: 255, b: 255 }, charSpacing = 1) {
         if (!this.matrix) return 0;
        
        let currentX = 0; // Start drawing relative to the beginning of the text
        let totalWidth = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const charData = font[char] || font[' '];
            let charWidth = 0;

            if (charData) {
                charData.forEach((row, y) => {
                    if (row) {
                        charWidth = Math.max(charWidth, row.length);
                        row.forEach((pixel, x) => {
                            if (pixel === 1) {
                                const matrixX = currentX + x - scrollXOffset;
                                // Only draw if the pixel is within the matrix bounds
                                if (matrixX >= 0 && matrixX < this.width) {
                                    this.matrix.setPixel(matrixX, yOffset + y, color.r, color.g, color.b);
                                }
                            }
                        });
                    }
                });
            } else {
                // Fallback for space if char is completely unknown
                 charWidth = font[' ']?.[0]?.length || 3; // Estimate space width
            }
            currentX += charWidth + charSpacing;
            totalWidth += charWidth + charSpacing;
        }
        // Caller should call sync()
        return totalWidth > 0 ? totalWidth - charSpacing : 0; // Return total calculated width
    }

    // Required by rpi-led-matrix to push buffer changes to the hardware
    sync() {
        if (!this.matrix) return;
        // console.log('[PiMatrixController] Syncing matrix'); // Can be verbose
        this.matrix.sync();
    }

    // Method to clean up resources
    shutdown() {
        if (!this.matrix) return;
        console.log('[PiMatrixController] Shutting down matrix (clearing)...');
        this.matrix.clear().sync(); // Clear and sync before exiting
        // Add any other library-specific cleanup if needed
        this.matrix = null; // Release reference
    }
    
    // Compatibility method - hardware doesn't really have a state buffer like console
    getMatrixState() {
        console.warn('[PiMatrixController] getMatrixState() is not meaningful for hardware controller.');
        return [];
    }
}

module.exports = { PiMatrixController }; 