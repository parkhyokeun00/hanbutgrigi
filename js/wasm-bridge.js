/* ========================================
 * WASM Bridge - Hybrid Watercolor Engine
 * ======================================== 
 * 
 * This module provides a unified interface for both
 * JavaScript and WASM implementations of the watercolor engine.
 * 
 * If WASM is available, it uses the high-performance Rust implementation.
 * Otherwise, it falls back to the optimized JavaScript version.
 */

import { WatercolorEngine as JSWatercolorEngine } from './watercolor-engine.js';
import { applySobelFilter as jsSobelFilter } from './edge-detection.js';

let wasmModule = null;
let WasmWatercolorEngine = null;
let useWasm = false;

/**
 * Initialize WASM module
 * @returns {Promise<boolean>} True if WASM is available
 */
export async function initWasm() {
    try {
        // Try to load WASM module
        wasmModule = await import('../wasm/pkg/watercolor_wasm.js');
        await wasmModule.default();
        WasmWatercolorEngine = wasmModule.WatercolorEngine;
        useWasm = true;
        console.log('✅ WASM watercolor engine loaded successfully');
        return true;
    } catch (error) {
        console.warn('⚠️ WASM not available, using JavaScript fallback:', error.message);
        useWasm = false;
        return false;
    }
}

/**
 * Check if WASM is being used
 * @returns {boolean}
 */
export function isWasmEnabled() {
    return useWasm;
}

/**
 * Hybrid Watercolor Engine
 * Uses JS engine for all operations - WASM integration pending proper memory export
 */
export class HybridWatercolorEngine {
    constructor(gridSize = 200) {
        this.gridSize = gridSize;

        // Use JS engine for now (WASM memory export issue)
        this._engine = new JSWatercolorEngine(gridSize, 3);

        // Settings cache for synchronization
        this._brushSize = 4;
        this._brushWater = 2.0;
        this._brushPigment = 0.15;
        this._evaporation = 0.002;
        this._viscosity = 0.05;
        this._pressure = 5.0;
        this._iterations = 10;
        this._adhesion = 0.05;
        this._granularity = 0.8;
        this._showTexture = true;
    }

    /**
     * Is this instance using WASM?
     */
    get isWasm() {
        return false; // Disabled until memory export is fixed
    }

    /**
     * Get current grid size
     */
    get GRID_SIZE() {
        return this.gridSize;
    }

    // === Brush settings ===

    get brush() {
        return {
            size: this._brushSize,
            water: this._brushWater,
            pigment: this._brushPigment
        };
    }

    set brush(value) {
        if (value.size !== undefined) this.setBrushSize(value.size);
        if (value.water !== undefined) this.setBrushWater(value.water);
        if (value.pigment !== undefined) this.setBrushPigment(value.pigment);
    }

    setBrushSize(size) {
        this._brushSize = size;
        this._engine.brush.size = size;
    }

    setBrushWater(water) {
        this._brushWater = water;
        this._engine.brush.water = water;
    }

    setBrushPigment(pigment) {
        this._brushPigment = pigment;
        this._engine.brush.pigment = pigment;
    }

    // === Physics settings ===

    get physics() {
        return {
            dt: 0.15,
            evaporation: this._evaporation,
            viscosity: this._viscosity,
            pressure: this._pressure,
            iterations: this._iterations
        };
    }

    set physics(value) {
        if (value.evaporation !== undefined) this.setEvaporation(value.evaporation);
        if (value.viscosity !== undefined) this.setViscosity(value.viscosity);
        if (value.pressure !== undefined) this.setPressure(value.pressure);
        if (value.iterations !== undefined) this.setIterations(value.iterations);
    }

    setEvaporation(evap) {
        this._evaporation = evap;
        this._engine.physics.evaporation = evap;
    }

    setViscosity(visc) {
        this._viscosity = visc;
        this._engine.physics.viscosity = visc;
    }

    setPressure(pressure) {
        this._pressure = pressure;
        this._engine.physics.pressure = pressure;
    }

    setIterations(iter) {
        this._iterations = iter;
        this._engine.physics.iterations = iter;
    }

    // === Pigment properties ===

    get pigmentProps() {
        return {
            adhesion: this._adhesion,
            granularity: this._granularity,
            staining: 0.5
        };
    }

    set pigmentProps(value) {
        if (value.adhesion !== undefined) this.setAdhesion(value.adhesion);
        if (value.granularity !== undefined) this.setGranularity(value.granularity);
    }

    setAdhesion(adhesion) {
        this._adhesion = adhesion;
        this._engine.pigmentProps.adhesion = adhesion;
    }

    setGranularity(granularity) {
        this._granularity = granularity;
        this._engine.pigmentProps.granularity = granularity;
    }

    // === Texture ===

    get showTexture() {
        return this._showTexture;
    }

    set showTexture(show) {
        this._showTexture = show;
        this._engine.showTexture = show;
    }

    // === Core methods ===

    resize(newSize) {
        if (this.gridSize === newSize) return;
        this.gridSize = newSize;
        this._engine.resize(newSize);
    }

    reset() {
        this._engine.reset();
    }

    /**
     * Apply brush at position
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @param {string} colorStr - Color string (#RRGGBB or rgb())
     */
    applyBrush(x, y, colorStr = '#222222') {
        this._engine.applyBrush(x, y, colorStr);
    }

    /**
     * Run one simulation step
     */
    step() {
        this._engine.step();
    }

    /**
     * Run multiple simulation steps
     * @param {number} n - Number of steps
     */
    stepN(n) {
        for (let i = 0; i < n; i++) {
            this._engine.step();
        }
    }

    /**
     * Render simulation to ImageData
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @returns {ImageData}
     */
    render(ctx, width, height) {
        return this._engine.render(ctx, width, height);
    }
}

/**
 * Apply Sobel filter using JS implementation
 * @param {Uint8ClampedArray} data - Image data (RGBA)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Float32Array} Edge magnitudes
 */
export function applySobelFilter(data, width, height) {
    return jsSobelFilter(data, width, height);
}

export default {
    initWasm,
    isWasmEnabled,
    HybridWatercolorEngine,
    applySobelFilter
};
