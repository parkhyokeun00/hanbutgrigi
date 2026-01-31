//! Watercolor Simulation Engine - WebAssembly Implementation
//! 
//! High-performance watercolor physics simulation using shallow water equations
//! and Kubelka-Munk color model for realistic pigment rendering.

use wasm_bindgen::prelude::*;

// When the `console_error_panic_hook` feature is enabled, we can call the
// `set_panic_hook` function at least once during initialization, and then
// we will get better error messages if our code ever panics.
#[cfg(feature = "console_error_panic_hook")]
pub fn set_panic_hook() {
    console_error_panic_hook::set_once();
}

/// CMY Pigment properties for Kubelka-Munk model
struct Pigment {
    k: [f32; 3], // Absorption coefficients
    s: [f32; 3], // Scattering coefficients
}

/// High-performance Watercolor Engine
#[wasm_bindgen]
pub struct WatercolorEngine {
    grid_size: usize,
    
    // Simulation buffers
    h: Vec<f32>,      // Water height
    u: Vec<f32>,      // X velocity
    v: Vec<f32>,      // Y velocity
    p: Vec<f32>,      // Pressure
    
    // Pigment buffers (floating in water)
    g_cyan: Vec<f32>,
    g_magenta: Vec<f32>,
    g_yellow: Vec<f32>,
    
    // Deposited pigment buffers
    d_cyan: Vec<f32>,
    d_magenta: Vec<f32>,
    d_yellow: Vec<f32>,
    
    // Paper texture
    paper_h: Vec<f32>,
    mask: Vec<f32>,
    
    // Temporary buffers for fluid advection (pre-allocated)
    next_h: Vec<f32>,
    next_g_cyan: Vec<f32>,
    next_g_magenta: Vec<f32>,
    next_g_yellow: Vec<f32>,
    
    // Render buffer
    render_buffer: Vec<u8>,
    
    // Brush settings
    brush_size: f32,
    brush_water: f32,
    brush_pigment: f32,
    
    // Physics settings
    dt: f32,
    evaporation: f32,
    viscosity: f32,
    pressure: f32,
    iterations: u32,
    
    // Pigment properties
    adhesion: f32,
    granularity: f32,
    
    show_texture: bool,
    
    // Pigments
    cyan: Pigment,
    magenta: Pigment,
    yellow: Pigment,
}

#[wasm_bindgen]
impl WatercolorEngine {
    /// Create a new WatercolorEngine with the specified grid size
    #[wasm_bindgen(constructor)]
    pub fn new(grid_size: usize) -> WatercolorEngine {
        #[cfg(feature = "console_error_panic_hook")]
        set_panic_hook();
        
        let size = grid_size * grid_size;
        
        let mut engine = WatercolorEngine {
            grid_size,
            
            h: vec![0.0; size],
            u: vec![0.0; size],
            v: vec![0.0; size],
            p: vec![0.0; size],
            
            g_cyan: vec![0.0; size],
            g_magenta: vec![0.0; size],
            g_yellow: vec![0.0; size],
            
            d_cyan: vec![0.0; size],
            d_magenta: vec![0.0; size],
            d_yellow: vec![0.0; size],
            
            paper_h: vec![0.0; size],
            mask: vec![0.0; size],
            
            next_h: vec![0.0; size],
            next_g_cyan: vec![0.0; size],
            next_g_magenta: vec![0.0; size],
            next_g_yellow: vec![0.0; size],
            
            render_buffer: vec![0u8; size * 4],
            
            brush_size: 4.0,
            brush_water: 2.0,
            brush_pigment: 0.15,
            
            dt: 0.15,
            evaporation: 0.002,
            viscosity: 0.05,
            pressure: 5.0,
            iterations: 10,
            
            adhesion: 0.05,
            granularity: 0.8,
            
            show_texture: true,
            
            cyan: Pigment {
                k: [1.8, 0.05, 0.05],
                s: [0.15, 0.5, 0.5],
            },
            magenta: Pigment {
                k: [0.05, 1.8, 0.05],
                s: [0.5, 0.15, 0.5],
            },
            yellow: Pigment {
                k: [0.02, 0.02, 1.5],
                s: [0.5, 0.5, 0.1],
            },
        };
        
        engine.init_paper();
        engine
    }
    
    /// Initialize paper texture with procedural noise
    fn init_paper(&mut self) {
        let size = self.grid_size;
        for i in 0..size {
            let sin_i = (i as f32 * 0.15).sin() * 0.05;
            for j in 0..size {
                let idx = i * size + j;
                self.paper_h[idx] = fastrand_f32() * 0.4 + sin_i + (j as f32 * 0.15).cos() * 0.05;
            }
        }
    }
    
    /// Resize the simulation grid
    pub fn resize(&mut self, new_size: usize) {
        if self.grid_size == new_size {
            return;
        }
        
        self.grid_size = new_size;
        let size = new_size * new_size;
        
        // Reallocate all buffers
        self.h = vec![0.0; size];
        self.u = vec![0.0; size];
        self.v = vec![0.0; size];
        self.p = vec![0.0; size];
        
        self.g_cyan = vec![0.0; size];
        self.g_magenta = vec![0.0; size];
        self.g_yellow = vec![0.0; size];
        
        self.d_cyan = vec![0.0; size];
        self.d_magenta = vec![0.0; size];
        self.d_yellow = vec![0.0; size];
        
        self.paper_h = vec![0.0; size];
        self.mask = vec![0.0; size];
        
        self.next_h = vec![0.0; size];
        self.next_g_cyan = vec![0.0; size];
        self.next_g_magenta = vec![0.0; size];
        self.next_g_yellow = vec![0.0; size];
        
        self.render_buffer = vec![0u8; size * 4];
        
        self.init_paper();
    }
    
    /// Reset all simulation buffers
    pub fn reset(&mut self) {
        self.h.fill(0.0);
        self.u.fill(0.0);
        self.v.fill(0.0);
        self.p.fill(0.0);
        self.mask.fill(0.0);
        
        self.g_cyan.fill(0.0);
        self.g_magenta.fill(0.0);
        self.g_yellow.fill(0.0);
        
        self.d_cyan.fill(0.0);
        self.d_magenta.fill(0.0);
        self.d_yellow.fill(0.0);
    }
    
    // === Brush settings ===
    
    pub fn set_brush_size(&mut self, size: f32) {
        self.brush_size = size;
    }
    
    pub fn set_brush_water(&mut self, water: f32) {
        self.brush_water = water;
    }
    
    pub fn set_brush_pigment(&mut self, pigment: f32) {
        self.brush_pigment = pigment;
    }
    
    // === Physics settings ===
    
    pub fn set_evaporation(&mut self, evap: f32) {
        self.evaporation = evap;
    }
    
    pub fn set_viscosity(&mut self, visc: f32) {
        self.viscosity = visc;
    }
    
    pub fn set_pressure(&mut self, pressure: f32) {
        self.pressure = pressure;
    }
    
    pub fn set_iterations(&mut self, iter: u32) {
        self.iterations = iter;
    }
    
    pub fn set_adhesion(&mut self, adhesion: f32) {
        self.adhesion = adhesion;
    }
    
    pub fn set_granularity(&mut self, granularity: f32) {
        self.granularity = granularity;
    }
    
    pub fn set_show_texture(&mut self, show: bool) {
        self.show_texture = show;
    }
    
    /// Update fluid velocities based on height gradients
    fn update_velocities(&mut self) {
        let size = self.grid_size;
        let friction = 1.0 - self.viscosity;
        let dt_factor = -1.5 * self.dt;
        
        for i in 1..size - 1 {
            let row_offset = i * size;
            let prev_row_offset = (i - 1) * size;
            let next_row_offset = (i + 1) * size;
            
            for j in 1..size - 1 {
                let idx = row_offset + j;
                
                // Calculate height gradients
                let h_plus_x = self.h[idx + 1] + self.paper_h[idx + 1];
                let h_minus_x = self.h[idx - 1] + self.paper_h[idx - 1];
                let dhdx = h_plus_x - h_minus_x;
                
                let h_plus_y = self.h[next_row_offset + j] + self.paper_h[next_row_offset + j];
                let h_minus_y = self.h[prev_row_offset + j] + self.paper_h[prev_row_offset + j];
                let dhdy = h_plus_y - h_minus_y;
                
                // Update velocities with friction
                self.u[idx] = (self.u[idx] + dt_factor * dhdx) * friction;
                self.v[idx] = (self.v[idx] + dt_factor * dhdy) * friction;
            }
        }
    }
    
    /// Pressure projection to enforce incompressibility
    fn relax_divergence(&mut self) {
        let size = self.grid_size;
        let evap_factor = self.evaporation * 5.0;
        
        for _ in 0..self.iterations {
            for i in 1..size - 1 {
                let row_offset = i * size;
                let prev_row_offset = (i - 1) * size;
                let next_row_offset = (i + 1) * size;
                
                for j in 1..size - 1 {
                    let idx = row_offset + j;
                    
                    // Compute divergence
                    let div = (self.u[idx + 1] - self.u[idx - 1] 
                             + self.v[next_row_offset + j] - self.v[prev_row_offset + j]) * 0.5;
                    
                    // Update pressure
                    self.p[idx] -= div * self.pressure;
                    
                    // Apply evaporation where water exists
                    if self.h[idx] > 0.01 {
                        self.p[idx] -= evap_factor * (1.0 - self.mask[idx]);
                    }
                }
            }
        }
    }
    
    /// Semi-Lagrangian fluid advection
    fn move_fluid(&mut self) {
        let size = self.grid_size;
        let one_minus_evap = 1.0 - self.evaporation;
        
        // Clear temporary buffers
        self.next_h.fill(0.0);
        self.next_g_cyan.fill(0.0);
        self.next_g_magenta.fill(0.0);
        self.next_g_yellow.fill(0.0);
        
        for i in 1..size - 1 {
            let row_offset = i * size;
            
            for j in 1..size - 1 {
                let idx = row_offset + j;
                
                if self.h[idx] <= 0.0 {
                    continue;
                }
                
                // Trace back
                let prev_i = (i as f32 - self.u[idx] * self.dt)
                    .max(0.0)
                    .min((size - 1) as f32) as usize;
                let prev_j = (j as f32 - self.v[idx] * self.dt)
                    .max(0.0)
                    .min((size - 1) as f32) as usize;
                let prev_idx = prev_i * size + prev_j;
                
                self.next_h[idx] = self.h[prev_idx] * one_minus_evap;
                self.next_g_cyan[idx] = self.g_cyan[prev_idx];
                self.next_g_magenta[idx] = self.g_magenta[prev_idx];
                self.next_g_yellow[idx] = self.g_yellow[prev_idx];
            }
        }
        
        // Copy back
        self.h.copy_from_slice(&self.next_h);
        self.g_cyan.copy_from_slice(&self.next_g_cyan);
        self.g_magenta.copy_from_slice(&self.next_g_magenta);
        self.g_yellow.copy_from_slice(&self.next_g_yellow);
    }
    
    /// Pigment deposition onto paper
    fn deposition(&mut self) {
        let len = self.h.len();
        
        for i in 0..len {
            if self.h[i] < 0.01 {
                continue;
            }
            
            let speed = (self.u[i] * self.u[i] + self.v[i] * self.v[i]).sqrt();
            let dep_rate = self.adhesion 
                * (1.0 / (speed + 1.0)) 
                * (1.0 + self.granularity * (1.0 - self.paper_h[i]));
            let factor = dep_rate * self.dt;
            
            // Cyan
            let amount_c = self.g_cyan[i] * factor;
            self.d_cyan[i] += amount_c;
            self.g_cyan[i] -= amount_c;
            
            // Magenta
            let amount_m = self.g_magenta[i] * factor;
            self.d_magenta[i] += amount_m;
            self.g_magenta[i] -= amount_m;
            
            // Yellow
            let amount_y = self.g_yellow[i] * factor;
            self.d_yellow[i] += amount_y;
            self.g_yellow[i] -= amount_y;
        }
    }
    
    /// Apply brush stroke at position (x, y) with given RGB color
    pub fn apply_brush(&mut self, x: i32, y: i32, r: f32, g: f32, b: f32) {
        let size = self.grid_size as i32;
        
        if x < 0 || x >= size || y < 0 || y >= size {
            return;
        }
        
        // RGB to CMY
        let c = (1.0 - r).max(0.0);
        let m = (1.0 - g).max(0.0);
        let y_val = (1.0 - b).max(0.0);
        
        let brush_size = self.brush_size as i32;
        let brush_size_sq = self.brush_size * self.brush_size;
        
        for di in -brush_size..=brush_size {
            let target_y = y + di;
            if target_y < 0 || target_y >= size {
                continue;
            }
            
            let row_offset = (target_y as usize) * self.grid_size;
            let di_sq = (di * di) as f32;
            
            for dj in -brush_size..=brush_size {
                let target_x = x + dj;
                if target_x < 0 || target_x >= size {
                    continue;
                }
                
                let dist_sq = di_sq + (dj * dj) as f32;
                
                if dist_sq <= brush_size_sq {
                    let idx = row_offset + target_x as usize;
                    let dist = dist_sq.sqrt();
                    let factor = 1.0 - dist / self.brush_size;
                    
                    self.h[idx] += self.brush_water * factor;
                    self.mask[idx] = 1.0;
                    
                    self.g_cyan[idx] += c * self.brush_pigment * factor;
                    self.g_magenta[idx] += m * self.brush_pigment * factor;
                    self.g_yellow[idx] += y_val * self.brush_pigment * factor;
                }
            }
        }
    }
    
    /// Run one simulation step
    pub fn step(&mut self) {
        self.update_velocities();
        self.relax_divergence();
        self.move_fluid();
        self.deposition();
    }
    
    /// Run multiple simulation steps
    pub fn step_n(&mut self, n: u32) {
        for _ in 0..n {
            self.step();
        }
    }
    
    /// Render simulation to RGBA buffer
    /// Returns a pointer to the internal buffer
    pub fn render(&mut self) -> *const u8 {
        let len = self.h.len();
        
        for i in 0..len {
            let idx = i * 4;
            
            // Start with paper white
            let mut r: f32 = 1.0;
            let mut g: f32 = 1.0;
            let mut b: f32 = 1.0;
            
            // Apply Cyan pigment
            let thick_c = self.d_cyan[i] * 4.0;
            if thick_c >= 0.0005 {
                r = apply_km_channel(r, thick_c, self.cyan.k[0], self.cyan.s[0]);
                g = apply_km_channel(g, thick_c, self.cyan.k[1], self.cyan.s[1]);
                b = apply_km_channel(b, thick_c, self.cyan.k[2], self.cyan.s[2]);
            }
            
            // Apply Magenta pigment
            let thick_m = self.d_magenta[i] * 4.0;
            if thick_m >= 0.0005 {
                r = apply_km_channel(r, thick_m, self.magenta.k[0], self.magenta.s[0]);
                g = apply_km_channel(g, thick_m, self.magenta.k[1], self.magenta.s[1]);
                b = apply_km_channel(b, thick_m, self.magenta.k[2], self.magenta.s[2]);
            }
            
            // Apply Yellow pigment
            let thick_y = self.d_yellow[i] * 4.0;
            if thick_y >= 0.0005 {
                r = apply_km_channel(r, thick_y, self.yellow.k[0], self.yellow.s[0]);
                g = apply_km_channel(g, thick_y, self.yellow.k[1], self.yellow.s[1]);
                b = apply_km_channel(b, thick_y, self.yellow.k[2], self.yellow.s[2]);
            }
            
            // Apply paper texture
            let tex = if self.show_texture {
                0.92 + self.paper_h[i] * 0.08
            } else {
                1.0
            };
            
            // Write to buffer
            self.render_buffer[idx] = ((r * 255.0 * tex).clamp(0.0, 255.0)) as u8;
            self.render_buffer[idx + 1] = ((g * 255.0 * tex).clamp(0.0, 255.0)) as u8;
            self.render_buffer[idx + 2] = ((b * 255.0 * tex).clamp(0.0, 255.0)) as u8;
            self.render_buffer[idx + 3] = 255;
        }
        
        self.render_buffer.as_ptr()
    }
    
    /// Get the size of the render buffer
    pub fn render_buffer_size(&self) -> usize {
        self.render_buffer.len()
    }
    
    /// Get the current grid size
    pub fn grid_size(&self) -> usize {
        self.grid_size
    }
}

/// Apply Kubelka-Munk model for a single channel
#[inline(always)]
fn apply_km_channel(reflectance: f32, thickness: f32, k: f32, s: f32) -> f32 {
    let absorption = (-k * thickness).exp();
    let scatter = s * thickness * 0.5;
    reflectance * absorption * (1.0 - scatter) + scatter * 0.1
}

/// Simple pseudo-random number generator (0.0 to 1.0)
fn fastrand_f32() -> f32 {
    // Using a simple approach since we don't need cryptographic randomness
    static mut SEED: u32 = 12345;
    unsafe {
        SEED = SEED.wrapping_mul(1103515245).wrapping_add(12345);
        (SEED as f32 / u32::MAX as f32)
    }
}

// === Sobel Edge Detection ===

/// Apply Sobel filter to image data and return edge magnitudes
#[wasm_bindgen]
pub fn apply_sobel_filter(data: &[u8], width: usize, height: usize) -> Vec<f32> {
    let size = width * height;
    let mut gray = vec![0.0f32; size];
    let mut edges = vec![0.0f32; size];
    
    // Convert to grayscale
    for i in 0..size {
        let idx = i * 4;
        gray[i] = data[idx] as f32 * 0.299 
                + data[idx + 1] as f32 * 0.587 
                + data[idx + 2] as f32 * 0.114;
    }
    
    // Sobel convolution
    for y in 1..height - 1 {
        let row_offset = y * width;
        let prev_row_offset = (y - 1) * width;
        let next_row_offset = (y + 1) * width;
        
        for x in 1..width - 1 {
            let p00 = gray[prev_row_offset + x - 1];
            let p01 = gray[prev_row_offset + x];
            let p02 = gray[prev_row_offset + x + 1];
            let p10 = gray[row_offset + x - 1];
            let p12 = gray[row_offset + x + 1];
            let p20 = gray[next_row_offset + x - 1];
            let p21 = gray[next_row_offset + x];
            let p22 = gray[next_row_offset + x + 1];
            
            // Sobel X: [-1, 0, 1; -2, 0, 2; -1, 0, 1]
            let gx = -p00 + p02 - 2.0 * p10 + 2.0 * p12 - p20 + p22;
            
            // Sobel Y: [-1, -2, -1; 0, 0, 0; 1, 2, 1]
            let gy = -p00 - 2.0 * p01 - p02 + p20 + 2.0 * p21 + p22;
            
            edges[row_offset + x] = (gx * gx + gy * gy).sqrt();
        }
    }
    
    edges
}
