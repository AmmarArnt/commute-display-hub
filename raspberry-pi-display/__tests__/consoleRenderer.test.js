const { renderMatrixToConsole } = require('../consoleRenderer');

describe('Console Renderer', () => {
    let consoleSpy;

    beforeEach(() => {
        // Spy on console.log without preventing its output
        consoleSpy = jest.spyOn(console, 'log'); 
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    it('should render a simple matrix correctly', () => {
        const matrix = [
            [0, 1, 0],
            [1, 0, 1],
        ];
        renderMatrixToConsole(matrix, 'X', '.');

        // Basic check: check number of calls (height + 2 borders)
        expect(consoleSpy).toHaveBeenCalledTimes(matrix.length + 2);
        // Check content of lines
        expect(consoleSpy).toHaveBeenNthCalledWith(1, '+---+');
        expect(consoleSpy).toHaveBeenNthCalledWith(2, '|.X.|');
        expect(consoleSpy).toHaveBeenNthCalledWith(3, '|X.X|');
        expect(consoleSpy).toHaveBeenNthCalledWith(4, '+---+');
    });

    it('should handle empty matrix', () => {
        renderMatrixToConsole([]);
        expect(consoleSpy).toHaveBeenCalledWith('[Empty Matrix]');
    });
     it('should handle matrix with empty rows', () => {
        renderMatrixToConsole([[]]);
        expect(consoleSpy).toHaveBeenCalledWith('[Empty Matrix]');
    });
}); 