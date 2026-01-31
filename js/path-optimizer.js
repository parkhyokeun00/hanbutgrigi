/* ========================================
 * Path Optimizer Module - Optimized
 * ======================================== */

/**
 * Optimize path using spatial hashing for large point sets
 * @param {Array} points - Array of {x, y} points
 * @param {string} mediaType - Current media type
 * @param {number} [cellSize=30] - Spatial hash cell size
 * @returns {Array} Sorted points array
 */
export function optimizePath(points, mediaType, cellSize = 30) {
    if (!points || points.length === 0) return [];

    const numP = points.length;

    // Use simple approach for small datasets or video
    if (numP < 3000 || mediaType === 'video') {
        return optimizePathSimple(points, mediaType);
    }

    // Spatial hashing for large datasets
    const grid = new Map();

    // Build spatial hash
    for (let i = 0; i < numP; i++) {
        const p = points[i];
        const cx = (p.x / cellSize) | 0;
        const cy = (p.y / cellSize) | 0;
        const key = `${cx},${cy}`;

        if (!grid.has(key)) {
            grid.set(key, []);
        }
        grid.get(key).push(p);
    }

    const path = [];
    const keys = Array.from(grid.keys());

    if (keys.length === 0) return [];

    // Start from first bucket
    let currentKey = keys[0];
    let currentBucket = grid.get(currentKey);
    let current = currentBucket.pop();

    if (currentBucket.length === 0) {
        grid.delete(currentKey);
    }

    path.push(current);
    let totalPoints = numP - 1;

    while (totalPoints > 0) {
        let bestP = null;
        let minDistSq = Infinity;
        let bestBucketKey = null;
        let bestIndex = -1;

        const cx = (current.x / cellSize) | 0;
        const cy = (current.y / cellSize) | 0;

        // Search neighboring cells
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const key = `${cx + dx},${cy + dy}`;
                const bucket = grid.get(key);

                if (bucket) {
                    for (let i = 0; i < bucket.length; i++) {
                        const p = bucket[i];
                        const distSq = (current.x - p.x) ** 2 + (current.y - p.y) ** 2;

                        if (distSq < minDistSq) {
                            minDistSq = distSq;
                            bestP = p;
                            bestBucketKey = key;
                            bestIndex = i;

                            // Early exit for very close points
                            if (distSq < 4) break;
                        }
                    }
                }
            }
            if (minDistSq < 4) break;
        }

        if (bestP) {
            current = bestP;
            const bucket = grid.get(bestBucketKey);
            const last = bucket.length - 1;

            if (bestIndex < last) {
                bucket[bestIndex] = bucket[last];
            }
            bucket.pop();

            if (bucket.length === 0) {
                grid.delete(bestBucketKey);
            }

            path.push(current);
            totalPoints--;
        } else {
            // Jump to nearest non-empty bucket
            const remainingKeys = Array.from(grid.keys());
            if (remainingKeys.length === 0) break;

            currentKey = remainingKeys[0];
            currentBucket = grid.get(currentKey);
            current = currentBucket.pop();

            if (currentBucket.length === 0) {
                grid.delete(currentKey);
            }

            path.push(current);
            totalPoints--;
        }
    }

    return path;
}

/**
 * Simple nearest neighbor path optimization for small datasets
 * @param {Array} points - Array of {x, y} points
 * @param {string} mediaType - Current media type
 * @returns {Array} Sorted points array
 */
export function optimizePathSimple(points, mediaType) {
    if (!points || points.length === 0) return [];

    const unvisited = [...points];
    const path = [];

    let current = unvisited.pop();
    path.push(current);

    const limitCheck = mediaType === 'video' ? 200 : unvisited.length;

    while (unvisited.length > 0) {
        let nearestIdx = -1;
        let minDistSq = Infinity;

        const loopLimit = mediaType === 'video'
            ? Math.min(unvisited.length, limitCheck)
            : unvisited.length;

        for (let i = 0; i < loopLimit; i++) {
            const p = unvisited[i];
            const dx = current.x - p.x;
            const dy = current.y - p.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearestIdx = i;

                // Early exit for very close points
                if (distSq < 4) break;
            }
        }

        if (nearestIdx !== -1) {
            current = unvisited[nearestIdx];

            // Swap with last and pop for O(1) removal
            const lastIdx = unvisited.length - 1;
            if (nearestIdx < lastIdx) {
                unvisited[nearestIdx] = unvisited[lastIdx];
            }
            unvisited.pop();

            path.push(current);
        } else {
            current = unvisited.pop();
            path.push(current);
        }
    }

    return path;
}

/* ========================================
 * Smoothing Algorithms
 * ======================================== */

/**
 * Douglas-Peucker line simplification
 * @param {Array} points - Array of {x, y} points
 * @param {number} tolerance - Simplification tolerance
 * @returns {Array} Simplified points
 */
export function simplifyPoints(points, tolerance) {
    if (points.length <= 2) return points;
    const sqTolerance = tolerance * tolerance;
    return simplifyDPStep(points, 0, points.length - 1, sqTolerance);
}

function simplifyDPStep(points, first, last, sqTolerance) {
    let maxSqDist = sqTolerance;
    let index = 0;

    for (let i = first + 1; i < last; i++) {
        const sqDist = getSqSegDist(points[i], points[first], points[last]);
        if (sqDist > maxSqDist) {
            index = i;
            maxSqDist = sqDist;
        }
    }

    if (maxSqDist > sqTolerance) {
        const left = simplifyDPStep(points, first, index, sqTolerance);
        const right = simplifyDPStep(points, index, last, sqTolerance);
        return left.slice(0, left.length - 1).concat(right);
    } else {
        return [points[first], points[last]];
    }
}

function getSqSegDist(p, p1, p2) {
    let x = p1.x;
    let y = p1.y;
    let dx = p2.x - x;
    let dy = p2.y - y;

    if (dx !== 0 || dy !== 0) {
        const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
            x = p2.x;
            y = p2.y;
        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = p.x - x;
    dy = p.y - y;
    return dx * dx + dy * dy;
}

/**
 * Catmull-Rom spline interpolation
 * @param {Array} points - Array of {x, y} points
 * @param {number} segments - Segments per curve
 * @returns {Array} Interpolated points
 */
export function getCatmullRomPoints(points, segments = 5) {
    if (points.length < 2) return points;

    const result = [];
    const extendedPoints = [points[0], ...points, points[points.length - 1]];

    for (let i = 0; i < extendedPoints.length - 3; i++) {
        const p0 = extendedPoints[i];
        const p1 = extendedPoints[i + 1];
        const p2 = extendedPoints[i + 2];
        const p3 = extendedPoints[i + 3];

        const limit = (i === extendedPoints.length - 4) ? segments : segments - 1;

        for (let j = 0; j <= limit; j++) {
            const t = j / segments;
            const tt = t * t;
            const ttt = tt * t;

            const x = 0.5 * (
                (2 * p1.x) +
                (-p0.x + p2.x) * t +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt
            );

            const y = 0.5 * (
                (2 * p1.y) +
                (-p0.y + p2.y) * t +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt
            );

            result.push({ x, y });
        }
    }

    return result;
}

/**
 * Quadratic Bezier interpolation
 * @param {Array} points - Array of {x, y} points
 * @param {number} segmentsPerCurve - Segments per curve
 * @returns {Array} Interpolated points
 */
export function getQuadraticBezierPoints(points, segmentsPerCurve = 10) {
    if (points.length < 3) return points;

    const newPoints = [];
    let p0 = points[0];
    newPoints.push(p0);

    for (let i = 1; i < points.length - 2; i++) {
        const pc = points[i];
        const pNext = points[i + 1];
        const pe = {
            x: (pc.x + pNext.x) / 2,
            y: (pc.y + pNext.y) / 2
        };

        for (let j = 1; j <= segmentsPerCurve; j++) {
            const t = j / segmentsPerCurve;
            const invT = 1 - t;

            const x = invT * invT * p0.x + 2 * invT * t * pc.x + t * t * pe.x;
            const y = invT * invT * p0.y + 2 * invT * t * pc.y + t * t * pe.y;

            newPoints.push({ x, y });
        }

        p0 = pe;
    }

    // Handle last segment
    const pLastControl = points[points.length - 2];
    const pLastEnd = points[points.length - 1];

    for (let j = 1; j <= segmentsPerCurve; j++) {
        const t = j / segmentsPerCurve;
        const invT = 1 - t;

        const x = invT * invT * p0.x + 2 * invT * t * pLastControl.x + t * t * pLastEnd.x;
        const y = invT * invT * p0.y + 2 * invT * t * pLastControl.y + t * t * pLastEnd.y;

        newPoints.push({ x, y });
    }

    return newPoints;
}

/**
 * Get stroke segments split by threshold distance
 * @param {Array} points - Array of {x, y} points
 * @param {number} threshold - Distance threshold for splitting
 * @returns {Array} Array of stroke arrays
 */
export function getStrokes(points, threshold) {
    const strokes = [];
    let currentStroke = [points[0]];

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);

        if (dist > threshold) {
            strokes.push(currentStroke);
            currentStroke = [curr];
        } else {
            currentStroke.push(curr);
        }
    }

    strokes.push(currentStroke);
    return strokes;
}
