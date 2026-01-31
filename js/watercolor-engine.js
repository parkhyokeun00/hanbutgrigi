/* ========================================
 * Watercolor Engine - Optimized Version
 * ======================================== */

/**
 * High-performance watercolor simulation engine
 * Uses object pooling and TypedArrays for optimal performance
 */
export class WatercolorEngine {
    constructor(gridSize = 200, scale = 3) {
        this.GRID_SIZE = gridSize;
        this.SCALE = scale;

        // CMY Pigments for Subtractive Mixing
        this.PIGMENTS = {
            Cyan: { k: [1.8, 0.05, 0.05], s: [0.15, 0.5, 0.5] },
            Magenta: { k: [0.05, 1.8, 0.05], s: [0.5, 0.15, 0.5] },
            Yellow: { k: [0.02, 0.02, 1.5], s: [0.5, 0.5, 0.1] }
        };

        // Pre-computed pigment keys for faster iteration
        this._pigmentKeys = Object.keys(this.PIGMENTS);

        this.initMemory();
    }

    initMemory() {
        const size = this.GRID_SIZE * this.GRID_SIZE;

        this.brush = { size: 4, water: 2.0, pigment: 0.15 };
        this.physics = {
            dt: 0.15,
            evaporation: 0.002,
            viscosity: 0.05,
            pressure: 5.0,
            iterations: 10,
        };
        this.pigmentProps = {
            adhesion: 0.05,
            granularity: 0.8,
            staining: 0.5,
        };
        this.showTexture = true;

        // Main simulation buffers
        this.h = new Float32Array(size);
        this.u = new Float32Array(size);
        this.v = new Float32Array(size);
        this.p = new Float32Array(size);

        // Pigment buffers (floating in water)
        this.g = {
            Cyan: new Float32Array(size),
            Magenta: new Float32Array(size),
            Yellow: new Float32Array(size),
        };

        // Deposited pigment buffers
        this.d = {
            Cyan: new Float32Array(size),
            Magenta: new Float32Array(size),
            Yellow: new Float32Array(size),
        };

        // Paper texture and mask
        this.paperH = new Float32Array(size);
        this.mask = new Float32Array(size);

        // === OPTIMIZATION: Pre-allocated temporary buffers (object pooling) ===
        this._nextH = new Float32Array(size);
        this._nextG = {
            Cyan: new Float32Array(size),
            Magenta: new Float32Array(size),
            Yellow: new Float32Array(size),
        };

        // Pre-allocated render buffer
        this._renderBuffer = new Uint8ClampedArray(size * 4);

        this.initPaper();
    }

    resize(newSize) {
        if (this.GRID_SIZE === newSize) return;
        this.GRID_SIZE = newSize;
        this.initMemory();
    }

    initPaper() {
        const size = this.GRID_SIZE;
        for (let i = 0; i < size; i++) {
            const sinI = Math.sin(i * 0.15) * 0.05;
            for (let j = 0; j < size; j++) {
                const idx = i * size + j;
                this.paperH[idx] = Math.random() * 0.4 + sinI + Math.cos(j * 0.15) * 0.05;
            }
        }
    }

    reset() {
        this.h.fill(0);
        this.u.fill(0);
        this.v.fill(0);
        this.p.fill(0);
        this.mask.fill(0);

        for (const name of this._pigmentKeys) {
            this.g[name].fill(0);
            this.d[name].fill(0);
        }
    }

    // === OPTIMIZED: Inlined calculations, reduced function calls ===
    updateVelocities() {
        const size = this.GRID_SIZE;
        const friction = 1.0 - this.physics.viscosity;
        const dtFactor = -1.5 * this.physics.dt;
        const h = this.h;
        const paperH = this.paperH;
        const u = this.u;
        const v = this.v;

        for (let i = 1; i < size - 1; i++) {
            const rowOffset = i * size;
            const prevRowOffset = (i - 1) * size;
            const nextRowOffset = (i + 1) * size;

            for (let j = 1; j < size - 1; j++) {
                const idx = rowOffset + j;

                // Calculate height gradients
                const hPlusX = h[idx + 1] + paperH[idx + 1];
                const hMinusX = h[idx - 1] + paperH[idx - 1];
                const dhdx = hPlusX - hMinusX;

                const hPlusY = h[nextRowOffset + j] + paperH[nextRowOffset + j];
                const hMinusY = h[prevRowOffset + j] + paperH[prevRowOffset + j];
                const dhdy = hPlusY - hMinusY;

                // Update velocities with friction
                u[idx] = (u[idx] + dtFactor * dhdx) * friction;
                v[idx] = (v[idx] + dtFactor * dhdy) * friction;
            }
        }
    }

    relaxDivergence() {
        const size = this.GRID_SIZE;
        const iterations = this.physics.iterations;
        const pressure = this.physics.pressure;
        const evapFactor = this.physics.evaporation * 5.0;
        const h = this.h;
        const u = this.u;
        const v = this.v;
        const p = this.p;
        const mask = this.mask;

        for (let iter = 0; iter < iterations; iter++) {
            for (let i = 1; i < size - 1; i++) {
                const rowOffset = i * size;
                const prevRowOffset = (i - 1) * size;
                const nextRowOffset = (i + 1) * size;

                for (let j = 1; j < size - 1; j++) {
                    const idx = rowOffset + j;

                    // Compute divergence
                    const div = (u[idx + 1] - u[idx - 1] + v[nextRowOffset + j] - v[prevRowOffset + j]) * 0.5;

                    // Update pressure
                    p[idx] -= div * pressure;

                    // Apply evaporation where water exists
                    if (h[idx] > 0.01) {
                        p[idx] -= evapFactor * (1.0 - mask[idx]);
                    }
                }
            }
        }
    }

    // === OPTIMIZED: Uses pre-allocated buffers instead of creating new arrays ===
    moveFluid() {
        const size = this.GRID_SIZE;
        const dt = this.physics.dt;
        const evaporation = this.physics.evaporation;
        const oneMinusEvap = 1 - evaporation;
        const h = this.h;
        const u = this.u;
        const v = this.v;
        const nextH = this._nextH;
        const nextG = this._nextG;
        const gBuffers = this.g;

        // Clear temporary buffers
        nextH.fill(0);
        for (const name of this._pigmentKeys) {
            nextG[name].fill(0);
        }

        for (let i = 1; i < size - 1; i++) {
            const rowOffset = i * size;

            for (let j = 1; j < size - 1; j++) {
                const idx = rowOffset + j;

                if (h[idx] <= 0) continue;

                // Semi-Lagrangian advection
                const prevI = Math.max(0, Math.min(size - 1, i - u[idx] * dt));
                const prevJ = Math.max(0, Math.min(size - 1, j - v[idx] * dt));
                const prevIdx = (prevI | 0) * size + (prevJ | 0); // Bitwise OR for faster floor

                nextH[idx] = h[prevIdx] * oneMinusEvap;

                for (const name of this._pigmentKeys) {
                    nextG[name][idx] = gBuffers[name][prevIdx];
                }
            }
        }

        // Copy back to main buffers
        this.h.set(nextH);
        for (const name of this._pigmentKeys) {
            gBuffers[name].set(nextG[name]);
        }
    }

    deposition() {
        const h = this.h;
        const u = this.u;
        const v = this.v;
        const paperH = this.paperH;
        const adhesion = this.pigmentProps.adhesion;
        const granularity = this.pigmentProps.granularity;
        const dt = this.physics.dt;
        const length = h.length;

        for (const name of this._pigmentKeys) {
            const g = this.g[name];
            const d = this.d[name];

            for (let i = 0; i < length; i++) {
                if (h[i] < 0.01) continue;

                const speed = Math.sqrt(u[i] * u[i] + v[i] * v[i]);
                const depRate = adhesion * (1.0 / (speed + 1.0)) * (1.0 + granularity * (1.0 - paperH[i]));
                const amount = g[i] * depRate * dt;

                d[i] += amount;
                g[i] -= amount;
            }
        }
    }

    applyBrush(x, y, colorStr = '#222222') {
        if (x < 0 || x >= this.GRID_SIZE || y < 0 || y >= this.GRID_SIZE) return;

        // Parse color to CMY
        let r = 0, g = 0, b = 0;

        if (colorStr.charCodeAt(0) === 35) { // '#'
            const hex = colorStr;
            if (hex.length === 7) {
                r = parseInt(hex.substring(1, 3), 16) / 255;
                g = parseInt(hex.substring(3, 5), 16) / 255;
                b = parseInt(hex.substring(5, 7), 16) / 255;
            }
        } else if (colorStr.startsWith('rgb')) {
            const match = colorStr.match(/\d+/g);
            if (match && match.length >= 3) {
                r = parseInt(match[0]) / 255;
                g = parseInt(match[1]) / 255;
                b = parseInt(match[2]) / 255;
            }
        }

        // RGB to CMY
        const c = Math.max(0, 1 - r);
        const m = Math.max(0, 1 - g);
        const yVal = Math.max(0, 1 - b);

        const brushSize = this.brush.size;
        const brushWater = this.brush.water;
        const brushPigment = this.brush.pigment;
        const size = this.GRID_SIZE;
        const hBuf = this.h;
        const maskBuf = this.mask;
        const gCyan = this.g.Cyan;
        const gMagenta = this.g.Magenta;
        const gYellow = this.g.Yellow;

        for (let i = -brushSize; i <= brushSize; i++) {
            const targetY = y + i;
            if (targetY < 0 || targetY >= size) continue;

            const rowOffset = targetY * size;
            const iSq = i * i;

            for (let j = -brushSize; j <= brushSize; j++) {
                const targetX = x + j;
                if (targetX < 0 || targetX >= size) continue;

                const distSq = iSq + j * j;
                const brushSizeSq = brushSize * brushSize;

                if (distSq <= brushSizeSq) {
                    const idx = rowOffset + targetX;
                    const dist = Math.sqrt(distSq);
                    const factor = 1 - dist / brushSize;

                    hBuf[idx] += brushWater * factor;
                    maskBuf[idx] = 1.0;

                    gCyan[idx] += c * brushPigment * factor;
                    gMagenta[idx] += m * brushPigment * factor;
                    gYellow[idx] += yVal * brushPigment * factor;
                }
            }
        }
    }

    step() {
        this.updateVelocities();
        this.relaxDivergence();
        this.moveFluid();
        this.deposition();
    }

    // === OPTIMIZED: Uses pre-allocated buffer, inlined K-M calculations ===
    render(ctx, width, height) {
        const size = this.GRID_SIZE;
        const totalPixels = size * size;
        const buffer = this._renderBuffer;
        const PIGMENTS = this.PIGMENTS;
        const showTexture = this.showTexture;
        const paperH = this.paperH;
        const dCyan = this.d.Cyan;
        const dMagenta = this.d.Magenta;
        const dYellow = this.d.Yellow;

        for (let i = 0; i < totalPixels; i++) {
            const idx = i * 4;

            // Start with paper white
            let r = 1.0, g = 1.0, b = 1.0;

            // Apply Cyan pigment
            const thickCyan = dCyan[i] * 4.0;
            if (thickCyan >= 0.0005) {
                const pig = PIGMENTS.Cyan;
                const absCyan0 = Math.exp(-pig.k[0] * thickCyan);
                const absCyan1 = Math.exp(-pig.k[1] * thickCyan);
                const absCyan2 = Math.exp(-pig.k[2] * thickCyan);
                const scatter0 = pig.s[0] * thickCyan * 0.5;
                const scatter1 = pig.s[1] * thickCyan * 0.5;
                const scatter2 = pig.s[2] * thickCyan * 0.5;

                r = r * absCyan0 * (1 - scatter0) + scatter0 * 0.1;
                g = g * absCyan1 * (1 - scatter1) + scatter1 * 0.1;
                b = b * absCyan2 * (1 - scatter2) + scatter2 * 0.1;
            }

            // Apply Magenta pigment
            const thickMagenta = dMagenta[i] * 4.0;
            if (thickMagenta >= 0.0005) {
                const pig = PIGMENTS.Magenta;
                const absMag0 = Math.exp(-pig.k[0] * thickMagenta);
                const absMag1 = Math.exp(-pig.k[1] * thickMagenta);
                const absMag2 = Math.exp(-pig.k[2] * thickMagenta);
                const scatter0 = pig.s[0] * thickMagenta * 0.5;
                const scatter1 = pig.s[1] * thickMagenta * 0.5;
                const scatter2 = pig.s[2] * thickMagenta * 0.5;

                r = r * absMag0 * (1 - scatter0) + scatter0 * 0.1;
                g = g * absMag1 * (1 - scatter1) + scatter1 * 0.1;
                b = b * absMag2 * (1 - scatter2) + scatter2 * 0.1;
            }

            // Apply Yellow pigment
            const thickYellow = dYellow[i] * 4.0;
            if (thickYellow >= 0.0005) {
                const pig = PIGMENTS.Yellow;
                const absYel0 = Math.exp(-pig.k[0] * thickYellow);
                const absYel1 = Math.exp(-pig.k[1] * thickYellow);
                const absYel2 = Math.exp(-pig.k[2] * thickYellow);
                const scatter0 = pig.s[0] * thickYellow * 0.5;
                const scatter1 = pig.s[1] * thickYellow * 0.5;
                const scatter2 = pig.s[2] * thickYellow * 0.5;

                r = r * absYel0 * (1 - scatter0) + scatter0 * 0.1;
                g = g * absYel1 * (1 - scatter1) + scatter1 * 0.1;
                b = b * absYel2 * (1 - scatter2) + scatter2 * 0.1;
            }

            // Apply paper texture
            const tex = showTexture ? (0.92 + paperH[i] * 0.08) : 1.0;

            // Clamp and write to buffer
            buffer[idx] = Math.max(0, Math.min(255, r * 255 * tex)) | 0;
            buffer[idx + 1] = Math.max(0, Math.min(255, g * 255 * tex)) | 0;
            buffer[idx + 2] = Math.max(0, Math.min(255, b * 255 * tex)) | 0;
            buffer[idx + 3] = 255;
        }

        // Create ImageData from cloned buffer to avoid reuse issues
        return new ImageData(new Uint8ClampedArray(buffer), size, size);
    }
}

export default WatercolorEngine;
