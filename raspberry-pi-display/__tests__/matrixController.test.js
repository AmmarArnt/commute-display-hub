const { MatrixController } = require('../matrixController');

// Helper to create expected matrix string for comparison
// Adds borders and joins rows
const matrixToString = (matrix) => {
    const height = matrix.length;
    if (height === 0) return '[]';
    const width = matrix[0].length;
    let result = '\n'; // Start with newline for better jest diff
    result += '+' + '-'.repeat(width) + '+\n';
    for (let y = 0; y < height; y++) {
        result += '|' + matrix[y].join('') + '|\n';
    }
    result += '+' + '-'.repeat(width) + '+';
    return result;
};

describe('Matrix Controller', () => {
    let controller;
    const WIDTH = 10;
    const HEIGHT = 8;

    beforeEach(() => {
        controller = new MatrixController(WIDTH, HEIGHT);
    });

    it('should initialize with a clear matrix of correct dimensions', () => {
        const state = controller.getMatrixState();
        expect(state.length).toBe(HEIGHT);
        expect(state[0].length).toBe(WIDTH);
        // Check if all elements are 0
        expect(state.every(row => row.every(pixel => pixel === 0))).toBe(true);
    });

    it('should clear the matrix', () => {
        controller.setPixel(1, 1, 1);
        controller.clear();
        const state = controller.getMatrixState();
        expect(state.every(row => row.every(pixel => pixel === 0))).toBe(true);
    });

    it('should set a pixel correctly within bounds', () => {
        controller.setPixel(2, 3, 1);
        const state = controller.getMatrixState();
        expect(state[3][2]).toBe(1);
    });

    it('should not set a pixel outside bounds', () => {
        controller.setPixel(-1, 0, 1);
        controller.setPixel(WIDTH, 0, 1);
        controller.setPixel(0, -1, 1);
        controller.setPixel(0, HEIGHT, 1);
        const state = controller.getMatrixState();
        // Check that the matrix remains all zeros
        expect(state.every(row => row.every(pixel => pixel === 0))).toBe(true);
    });

    // Test drawing - this verifies the matrix state output
    it('should draw text correctly at (0,0)', () => {
        controller.drawText('1', 0, 0);
        const state = controller.getMatrixState();
        // Corrected expected state for '1' font: [[0x00],[0x42],[0xff],[0x40],[0x00]]
        const expectedState = [
            [0,0,1,0,0,0,0,0,0,0], // Row 0
            [0,1,1,0,0,0,0,0,0,0], // Row 1 
            [0,0,1,0,0,0,0,0,0,0], // Row 2
            [0,0,1,0,0,0,0,0,0,0], // Row 3
            [0,0,1,0,0,0,0,0,0,0], // Row 4
            [0,0,1,0,0,0,0,0,0,0], // Row 5
            [0,1,1,1,0,0,0,0,0,0], // Row 6
            [0,0,0,0,0,0,0,0,0,0]  // Row 7 (cleared)
        ];
        expect(matrixToString(state)).toEqual(matrixToString(expectedState));
    });

     it('should draw text correctly at an offset', () => {
        controller.drawText('1', 3, 0); 
        const state = controller.getMatrixState();
        // Corrected expected state for '1' at x=3
        const expectedState = [
            [0,0,0,0,0,1,0,0,0,0],
            [0,0,0,0,1,1,0,0,0,0],
            [0,0,0,0,0,1,0,0,0,0],
            [0,0,0,0,0,1,0,0,0,0],
            [0,0,0,0,0,1,0,0,0,0],
            [0,0,0,0,0,1,0,0,0,0],
            [0,0,0,0,1,1,1,0,0,0],
            [0,0,0,0,0,0,0,0,0,0] 
        ];
        expect(matrixToString(state)).toEqual(matrixToString(expectedState));
    });

    it('should handle unknown characters by drawing space (clearing)', () => {
        controller.setPixel(1,1,1); // Set a pixel
        controller.drawText('%', 0, 0); // Draw unknown char
        const state = controller.getMatrixState();
        // Expect the area where '%' would be to be cleared (all 0s)
        let cleared = true;
        for(let y=0; y<7; y++) {
            for(let x=0; x<5; x++) {
                if (state[y][x] !== 0) cleared = false;
            }
        }
        expect(cleared).toBe(true);
    });

     it('should clip text exceeding matrix width', () => {
        const wideController = new MatrixController(5, 8);
        wideController.drawText('11', 0, 0); 
        const state = wideController.getMatrixState();
         // Corrected expected state for clipped '1' 
        const expectedState = [
             [0,0,1,0,0],
             [0,1,1,0,0],
             [0,0,1,0,0],
             [0,0,1,0,0],
             [0,0,1,0,0],
             [0,0,1,0,0],
             [0,1,1,1,0],
             [0,0,0,0,0] 
        ]; // Only the first '1' should appear fully
        expect(matrixToString(state)).toEqual(matrixToString(expectedState));
    });

    it('should scroll the matrix up correctly', () => {
        controller.setPixel(1, 1, 1); // y=1, x=1
        controller.setPixel(2, 2, 1); // y=2, x=2
        controller.scrollUp(1); // Scroll up by 1 row
        const state = controller.getMatrixState();
        
        // Pixel originally at (1,1) should now be at (0,1)
        expect(state[0][1]).toBe(1); 
        // Pixel originally at (2,2) should now be at (1,2)
        expect(state[1][2]).toBe(1); 
        // Last row should be all zeros
        expect(state[HEIGHT - 1].every(p => p === 0)).toBe(true);
    });

     it('should clear matrix if scroll amount equals or exceeds height', () => {
        controller.setPixel(1, 1, 1);
        controller.scrollUp(HEIGHT);
        const state = controller.getMatrixState();
        // Corrected typo: pixel -> p
        expect(state.every(row => row.every(p => p === 0))).toBe(true);
    });
});
