const font = require('./font'); // Use the separate font file

// Helper to calculate text width using the imported font
function calculateTextWidth(text, charSpacing = 1) {
    let width = 0;
    if (!text) return 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        // Use the imported 'font', not the old 'tinyFont'
        const charData = font[char] || font[' ']; 
        if (charData && charData[0]) { // Check row 0 exists for width
            width += charData[0].length + charSpacing;
        }
    }
    return width > 0 ? width - charSpacing : 0;
}

class MatrixController {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.matrixState = []; // Renamed from matrix
        this.clear();
        console.log(`[ConsoleMatrixController] Initialized ${width}x${height}`);
    }

    clear() {
        this.matrixState = Array(this.height).fill(0).map(() => Array(this.width).fill(0));
    }

    drawPixel(x, y, color = 1) {
        // Basic bounds check
        if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
            this.matrixState[y][x] = color ? 1 : 0;
        }
    }

    // Draws text at a fixed position (no scrolling)
    // Uses the correct imported font
    drawText(text, xOffset = 0, yOffset = 0, charSpacing = 1) {
        let currentX = xOffset;
        let totalWidth = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            // Use the imported 'font'
            const charData = font[char] || font[' ']; 

            if (charData) {
                let charWidth = 0;
                charData.forEach((row, y) => {
                     if (row) {
                        charWidth = Math.max(charWidth, row.length);
                        row.forEach((pixel, x) => {
                            if (pixel === 1) {
                                this.drawPixel(currentX + x, yOffset + y);
                            }
                        });
                    }
                });
                 currentX += charWidth + charSpacing;
                 totalWidth += charWidth + charSpacing;
            }
        }
         return totalWidth > 0 ? totalWidth - charSpacing : 0;
    }

    // --- Scrolling Specific for Console ---
    // Uses the correct imported font
    drawScrollingText(text, scrollXOffset, yOffset = 0, charSpacing = 1) {
        let currentX = 0; // Relative to the start of the full text string
        let totalWidth = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            // Use the imported 'font'
            const charData = font[char] || font[' '];
            let charWidth = 0;

            if (charData) {
                charData.forEach((row, y) => {
                    if (row) {
                        charWidth = Math.max(charWidth, row.length);
                        row.forEach((pixel, x) => {
                            if (pixel === 1) {
                                const matrixX = currentX + x - scrollXOffset;
                                this.drawPixel(matrixX, yOffset + y, 1);
                            }
                        });
                    }
                });
            } else {
                 // Use the imported 'font' for fallback space
                 charWidth = font[' ']?.[0]?.length || 3; 
            }
            currentX += charWidth + charSpacing;
            totalWidth += charWidth + charSpacing;
        }
        return totalWidth > 0 ? totalWidth - charSpacing : 0; 
    }

    getMatrixState() {
        return this.matrixState;
    }
    
    sync() { }
    shutdown() { }
}

// Export the class and potentially the helper if needed elsewhere
module.exports = { MatrixController, calculateTextWidth };
