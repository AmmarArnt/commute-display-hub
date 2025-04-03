function renderMatrixToConsole(matrix, onChar = '1', offChar = '0') {
    if (!matrix || matrix.length === 0 || matrix[0].length === 0) {
        console.log('[Empty Matrix]');
        return;
    }

    const height = matrix.length;
    const width = matrix[0].length;

    // Optional: Clear console before rendering for animation effect
    // console.clear();

    console.log('+' + '-'.repeat(width) + '+'); // Top border
    for (let y = 0; y < height; y++) {
        let rowStr = '|';
        for (let x = 0; x < width; x++) {
            // Check for undefined/null just in case row is shorter than expected
            rowStr += matrix[y]?.[x] ? onChar : offChar; 
        }
        rowStr += '|'; // Right border
        console.log(rowStr);
    }
    console.log('+' + '-'.repeat(width) + '+'); // Bottom border
}

module.exports = { renderMatrixToConsole };
