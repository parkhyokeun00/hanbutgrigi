/* ========================================
 * Edge Detection Module - Optimized
 * ======================================== */

/**
 * Optimized Sobel edge detection using pre-allocated buffers
 * @param {Uint8ClampedArray} data - Image data (RGBA)
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {Float32Array} [grayBuffer] - Pre-allocated grayscale buffer
 * @param {Float32Array} [edgesBuffer] - Pre-allocated edges buffer
 * @returns {Float32Array} Edge magnitudes
 */
export function applySobelFilter(data, w, h, grayBuffer = null, edgesBuffer = null) {
    const size = w * h;

    // Use provided buffers or create new ones
    const gray = grayBuffer && grayBuffer.length >= size
        ? grayBuffer
        : new Float32Array(size);
    const edges = edgesBuffer && edgesBuffer.length >= size
        ? edgesBuffer
        : new Float32Array(size);

    // Clear edges buffer
    edges.fill(0);

    // Convert to grayscale - using faster integer math
    for (let i = 0; i < size; i++) {
        const idx = i << 2; // i * 4
        // Approximate: (R * 77 + G * 150 + B * 29) >> 8
        gray[i] = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
    }

    // Sobel convolution - optimized with loop unrolling
    for (let y = 1; y < h - 1; y++) {
        const rowOffset = y * w;
        const prevRowOffset = (y - 1) * w;
        const nextRowOffset = (y + 1) * w;

        for (let x = 1; x < w - 1; x++) {
            // Get 3x3 neighborhood values
            const p00 = gray[prevRowOffset + x - 1];
            const p01 = gray[prevRowOffset + x];
            const p02 = gray[prevRowOffset + x + 1];
            const p10 = gray[rowOffset + x - 1];
            // p11 is center, not needed
            const p12 = gray[rowOffset + x + 1];
            const p20 = gray[nextRowOffset + x - 1];
            const p21 = gray[nextRowOffset + x];
            const p22 = gray[nextRowOffset + x + 1];

            // Sobel X: [-1, 0, 1; -2, 0, 2; -1, 0, 1]
            const gx = -p00 + p02 - 2 * p10 + 2 * p12 - p20 + p22;

            // Sobel Y: [-1, -2, -1; 0, 0, 0; 1, 2, 1]
            const gy = -p00 - 2 * p01 - p02 + p20 + 2 * p21 + p22;

            edges[rowOffset + x] = Math.sqrt(gx * gx + gy * gy);
        }
    }

    return edges;
}

/**
 * Detect edges with focus zone support
 * @param {CanvasRenderingContext2D} hiddenCtx - Hidden canvas context
 * @param {Object} config - Configuration object
 * @param {Array} focusZones - Array of focus zone objects
 * @param {string} currentMediaType - Current media type
 * @returns {Array} Array of edge points {x, y}
 */
export function detectEdges(hiddenCtx, config, focusZones, currentMediaType) {
    const canvas = hiddenCtx.canvas;
    const w = canvas.width;
    const h = canvas.height;
    const imgData = hiddenCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const edgeCandidates = [];
    const isHighDetail = config.numPoints > 4000;
    const baseStep = isHighDetail ? 1 : 2;

    // Compute Sobel edges if needed
    let sobelEdges = null;
    if (config.edgeMode === 'sobel' || config.edgeMode === 'sobel_fine') {
        sobelEdges = applySobelFilter(data, w, h);
    }

    // Threshold settings based on mode
    let baseThreshold = 20;
    let focusThreshold = 10;
    if (config.edgeMode === 'sobel') {
        baseThreshold = 30;
        focusThreshold = 15;
    } else if (config.edgeMode === 'sobel_fine') {
        baseThreshold = 15;
        focusThreshold = 8;
    }

    // Pre-compute focus zone squared radii
    const focusZonesProcessed = focusZones.map(z => ({
        x: z.x,
        y: z.y,
        radiusSq: z.radius * z.radius
    }));

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Check if in focus zone
            let inFocus = false;
            for (const zone of focusZonesProcessed) {
                const dx = x - zone.x;
                const dy = y - zone.y;
                if (dx * dx + dy * dy < zone.radiusSq) {
                    inFocus = true;
                    break;
                }
            }

            // Step logic
            if (config.edgeMode !== 'sobel_fine') {
                if (!inFocus && (x % baseStep !== 0 || y % baseStep !== 0)) continue;
            }

            // Edge detection
            let edgeStrength = 0;
            const threshold = inFocus ? focusThreshold : baseThreshold;

            if (sobelEdges) {
                edgeStrength = sobelEdges[y * w + x];
            } else {
                // Basic mode - brightness difference
                const idx = (y * w + x) << 2;
                const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

                if (x < w - 1) {
                    const rightIdx = idx + 4;
                    const rightBrightness = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3;
                    edgeStrength = Math.abs(brightness - rightBrightness);
                }

                if (y < h - 1) {
                    const bottomIdx = ((y + 1) * w + x) << 2;
                    const bottomBrightness = (data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3;
                    const i = (y * w + x) << 2;
                    const br = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    edgeStrength = Math.max(edgeStrength, Math.abs(br - bottomBrightness));
                }
            }

            if (edgeStrength > threshold) {
                let probability = currentMediaType === 'video'
                    ? (edgeStrength / 255) * 3
                    : (edgeStrength / 255) * 5;

                if (sobelEdges) {
                    probability = (edgeStrength / 400) * 5;
                }

                if (inFocus) probability *= 3.0;

                if (Math.random() < probability) {
                    edgeCandidates.push({ x, y });
                }
            }
        }
    }

    // Shuffle array in-place
    shuffleArray(edgeCandidates);

    return edgeCandidates.slice(0, config.numPoints);
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

export { shuffleArray };
