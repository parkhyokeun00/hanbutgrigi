/* ========================================
 * Watercolor Croquis - Main Application
 * ======================================== */

import { HybridWatercolorEngine, initWasm, isWasmEnabled } from './wasm-bridge.js';
import { detectEdges, applySobelFilter, shuffleArray } from './edge-detection.js';
import {
    optimizePath,
    simplifyPoints,
    getCatmullRomPoints,
    getQuadraticBezierPoints,
    getStrokes
} from './path-optimizer.js';

// ========================================
// State & Configuration
// ========================================

let wcEngine = null;
const watercolorCanvas = document.createElement('canvas');
watercolorCanvas.width = 200;
watercolorCanvas.height = 200;
const watercolorCtx = watercolorCanvas.getContext('2d');

const state = {
    originalImage: null,
    currentMediaType: 'none',
    audioBufferData: null,
    points: [],
    sortedPoints: [],
    smoothedPoints: [],
    animationId: null,
    videoLoopId: null,
    focusZones: [],
    isFocusEditMode: false,
    draggedZone: null
};

const config = {
    numPoints: 2500,
    smoothness: 3,
    mode: 'gaussian',
    ghostOpacity: 0.1,
    splitThreshold: 150,
    speed: 5,
    instant: false,
    bgColor: '#ffffff',
    colorMode: 'single',
    triColors: ['#2d3748', '#4299e1', '#fbd38d'],
    palette: [],
    drawStyle: 'standard',
    edgeMode: 'basic',
    wcResolution: 400
};

// ========================================
// DOM Elements
// ========================================

const elements = {
    // Core elements
    mediaInput: document.getElementById('mediaInput'),
    mainCanvas: document.getElementById('mainCanvas'),
    overlayCanvas: document.getElementById('overlayCanvas'),
    hiddenCanvas: document.getElementById('hiddenCanvas'),
    paletteCanvas: document.getElementById('paletteCanvas'),
    canvasContainer: document.getElementById('canvasContainer'),
    sourceVideo: document.getElementById('sourceVideo'),

    // Contexts
    ctx: null,
    overlayCtx: null,
    hiddenCtx: null,
    paletteCtx: null,

    // Controls
    detailSlider: document.getElementById('detailSlider'),
    smoothSlider: document.getElementById('smoothSlider'),
    ghostSlider: document.getElementById('ghostSlider'),
    splitSlider: document.getElementById('splitSlider'),
    speedSlider: document.getElementById('speedSlider'),
    instantCheck: document.getElementById('instantCheck'),
    speedControlArea: document.getElementById('speedControlArea'),
    algoSelect: document.getElementById('algoSelect'),
    colorModeSelect: document.getElementById('colorModeSelect'),
    edgeModeSelect: document.getElementById('edgeModeSelect'),
    drawStyleSelect: document.getElementById('drawStyleSelect'),

    // Focus controls
    toggleFocusBtn: document.getElementById('toggleFocusBtn'),
    clearZonesBtn: document.getElementById('clearZonesBtn'),
    showGuidesCheck: document.getElementById('showGuidesCheck'),

    // Text displays
    fileNameEl: document.getElementById('fileName'),
    detailVal: document.getElementById('detailVal'),
    smoothVal: document.getElementById('smoothVal'),
    ghostVal: document.getElementById('ghostVal'),
    splitVal: document.getElementById('splitVal'),
    speedVal: document.getElementById('speedVal'),
    smoothLabel: document.getElementById('smoothLabel'),
    smoothDesc: document.getElementById('smoothDesc'),
    loadingText: document.getElementById('loadingText'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    statsEl: document.getElementById('stats'),

    // Video controls
    playbackSpeedControl: document.getElementById('playbackSpeedControl'),
    playbackRateSlider: document.getElementById('playbackRateSlider'),
    playbackRateVal: document.getElementById('playbackRateVal'),
    togglePlayBtn: document.getElementById('togglePlayBtn'),

    // Color controls
    bgColorInput: document.getElementById('bgColorInput'),
    bgColorHex: document.getElementById('bgColorHex'),
    singleColorOptions: document.getElementById('singleColorOptions'),
    tritoneOptions: document.getElementById('tritoneOptions'),
    paletteOptions: document.getElementById('paletteOptions'),
    triShadow: document.getElementById('triShadow'),
    triMid: document.getElementById('triMid'),
    triHigh: document.getElementById('triHigh'),
    paletteImgInput: document.getElementById('paletteImgInput'),
    paletteContainer: document.getElementById('paletteContainer'),

    // Watercolor controls
    watercolorOptions: document.getElementById('watercolorOptions'),
    wcBrushSize: document.getElementById('wcBrushSize'),
    wcWater: document.getElementById('wcWater'),
    wcPigment: document.getElementById('wcPigment'),
    wcEvap: document.getElementById('wcEvap'),
    wcIter: document.getElementById('wcIter'),
    wcViscosity: document.getElementById('wcViscosity'),
    wcPressure: document.getElementById('wcPressure'),
    wcAdhesion: document.getElementById('wcAdhesion'),
    wcGranularity: document.getElementById('wcGranularity'),
    wcShowTexture: document.getElementById('wcShowTexture'),
    wcResolution: document.getElementById('wcResolution'),

    // Buttons
    redrawBtn: document.getElementById('redrawBtn'),
    downloadBtn: document.getElementById('downloadBtn')
};

// ========================================
// Initialization
// ========================================

async function init() {
    // Initialize contexts
    elements.ctx = elements.mainCanvas.getContext('2d');
    elements.overlayCtx = elements.overlayCanvas.getContext('2d');
    elements.hiddenCtx = elements.hiddenCanvas.getContext('2d', { willReadFrequently: true });
    elements.paletteCtx = elements.paletteCanvas.getContext('2d', { willReadFrequently: true });

    // Try to load WASM
    const wasmLoaded = await initWasm();

    // Create watercolor engine (will use WASM if available)
    wcEngine = new HybridWatercolorEngine(200);

    // Show WASM status
    showWasmStatus(wasmLoaded);

    // Setup event listeners
    setupEventListeners();

    // Initial UI update
    updateUIForMode();
    updateColorUI();

    if (elements.statsEl) {
        elements.statsEl.innerHTML = "파일을 업로드해주세요.";
    }

    console.log(`Watercolor Engine initialized (WASM: ${isWasmEnabled()})`);
}

function showWasmStatus(enabled) {
    const statusEl = document.createElement('div');
    statusEl.className = `wasm-status ${enabled ? 'wasm-enabled' : 'wasm-disabled'}`;
    statusEl.textContent = enabled ? '🚀 WASM 활성화' : '⚠️ JS 모드';
    document.body.appendChild(statusEl);

    // Auto-hide after 3 seconds
    setTimeout(() => {
        statusEl.style.opacity = '0';
        statusEl.style.transition = 'opacity 0.5s';
        setTimeout(() => statusEl.remove(), 500);
    }, 3000);
}

// ========================================
// Event Listeners Setup
// ========================================

function setupEventListeners() {
    // Media input
    elements.mediaInput?.addEventListener('change', handleMediaUpload);

    // Drawing style
    elements.drawStyleSelect?.addEventListener('change', (e) => {
        config.drawStyle = e.target.value;
        updateWatercolorOptionsVisibility();
        if (state.currentMediaType !== 'video') animatePath();
    });

    // Edge mode
    elements.edgeModeSelect?.addEventListener('change', (e) => {
        config.edgeMode = e.target.value;
        if (state.currentMediaType !== 'video') restartProcess();
    });

    // Watercolor sliders
    setupWatercolorControls();

    // Detail slider
    elements.detailSlider?.addEventListener('input', (e) => {
        config.numPoints = parseInt(e.target.value);
        elements.detailVal.textContent = config.numPoints;
    });
    elements.detailSlider?.addEventListener('change', () => {
        if (state.currentMediaType !== 'video') restartProcess();
        else restartVideoProcess();
    });

    // Smoothing
    elements.smoothSlider?.addEventListener('input', (e) => {
        config.smoothness = parseInt(e.target.value);
        updateSmoothValText();
    });
    elements.smoothSlider?.addEventListener('change', () => {
        if (state.currentMediaType !== 'video') {
            applySmoothing();
            animatePath();
        }
    });

    // Algorithm select
    elements.algoSelect?.addEventListener('change', (e) => {
        config.mode = e.target.value;
        updateUIForMode();
        if (state.currentMediaType !== 'video') {
            applySmoothing();
            animatePath();
        }
    });

    // Speed controls
    elements.speedSlider?.addEventListener('input', (e) => {
        config.speed = parseInt(e.target.value);
        updateSpeedText();
    });

    elements.instantCheck?.addEventListener('change', (e) => {
        config.instant = e.target.checked;
        if (config.instant) {
            elements.speedControlArea?.classList.add('disabled-slider');
        } else {
            elements.speedControlArea?.classList.remove('disabled-slider');
        }
        if (state.currentMediaType !== 'video') animatePath();
    });

    // Playback rate
    elements.playbackRateSlider?.addEventListener('input', (e) => {
        const rate = parseFloat(e.target.value);
        elements.sourceVideo.playbackRate = rate;
        elements.playbackRateVal.textContent = rate.toFixed(1) + 'x';
    });

    // Ghost opacity
    elements.ghostSlider?.addEventListener('input', (e) => {
        config.ghostOpacity = parseInt(e.target.value) / 100;
        elements.ghostVal.textContent = e.target.value + '%';
    });
    elements.ghostSlider?.addEventListener('change', () => {
        if (state.currentMediaType !== 'video') animatePath();
    });

    // Split threshold
    elements.splitSlider?.addEventListener('input', (e) => {
        config.splitThreshold = parseInt(e.target.value);
        elements.splitVal.textContent = config.splitThreshold + 'px';
    });
    elements.splitSlider?.addEventListener('change', () => {
        if (state.currentMediaType !== 'video') {
            applySmoothing();
            animatePath();
        }
    });

    // Background color
    elements.bgColorInput?.addEventListener('input', (e) => {
        config.bgColor = e.target.value;
        elements.bgColorHex.textContent = config.bgColor;
        if (state.currentMediaType !== 'video') animatePath();
    });

    // Color mode
    elements.colorModeSelect?.addEventListener('change', (e) => {
        config.colorMode = e.target.value;
        updateColorUI();
        if (state.currentMediaType !== 'video') animatePath();
    });

    // Tritone colors
    [elements.triShadow, elements.triMid, elements.triHigh].forEach((input, idx) => {
        input?.addEventListener('input', (e) => {
            config.triColors[idx] = e.target.value;
            if (state.currentMediaType !== 'video') animatePath();
        });
    });

    // Palette image
    elements.paletteImgInput?.addEventListener('change', handlePaletteImageUpload);

    // Focus controls
    setupFocusControls();

    // Buttons
    elements.redrawBtn?.addEventListener('click', () => {
        if (state.currentMediaType === 'video') restartVideoProcess();
        else restartProcess();
    });

    elements.togglePlayBtn?.addEventListener('click', () => {
        if (elements.sourceVideo.paused) elements.sourceVideo.play();
        else elements.sourceVideo.pause();
    });

    elements.downloadBtn?.addEventListener('click', handleDownload);
}

function setupWatercolorControls() {
    // Brush controls
    elements.wcBrushSize?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('wcBrushSizeVal').textContent = val;
        wcEngine.setBrushSize(val);
    });

    elements.wcWater?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('wcWaterVal').textContent = val.toFixed(1);
        wcEngine.setBrushWater(val);
    });

    elements.wcPigment?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('wcPigmentVal').textContent = val.toFixed(2);
        wcEngine.setBrushPigment(val);
    });

    // Physics controls
    elements.wcEvap?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('wcEvapVal').textContent = val.toFixed(4);
        wcEngine.setEvaporation(val);
    });

    elements.wcIter?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('wcIterVal').textContent = val;
        wcEngine.setIterations(val);
    });

    elements.wcViscosity?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('wcViscosityVal').textContent = val.toFixed(2);
        wcEngine.setViscosity(val);
    });

    elements.wcPressure?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('wcPressureVal').textContent = val.toFixed(1);
        wcEngine.setPressure(val);
    });

    // Pigment properties
    elements.wcAdhesion?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('wcAdhesionVal').textContent = val.toFixed(3);
        wcEngine.setAdhesion(val);
    });

    elements.wcGranularity?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('wcGranularityVal').textContent = val.toFixed(1);
        wcEngine.setGranularity(val);
    });

    // Texture toggle
    elements.wcShowTexture?.addEventListener('change', (e) => {
        wcEngine.showTexture = e.target.checked;
    });

    // Resolution
    elements.wcResolution?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('wcResolutionVal').textContent = val;
        config.wcResolution = val;
    });
}

function setupFocusControls() {
    elements.toggleFocusBtn?.addEventListener('click', () => {
        state.isFocusEditMode = !state.isFocusEditMode;
        if (state.isFocusEditMode) {
            elements.toggleFocusBtn.textContent = "편집 끄기";
            elements.toggleFocusBtn.classList.add('btn-primary');
            elements.canvasContainer.classList.add('edit-mode');
        } else {
            elements.toggleFocusBtn.textContent = "편집 켜기";
            elements.toggleFocusBtn.classList.remove('btn-primary');
            elements.canvasContainer.classList.remove('edit-mode');
        }
    });

    elements.showGuidesCheck?.addEventListener('change', drawOverlay);

    elements.clearZonesBtn?.addEventListener('click', () => {
        if (confirm("모든 강조 영역을 삭제하시겠습니까?")) {
            state.focusZones = [];
            drawOverlay();
            if (state.currentMediaType !== 'video') restartProcess();
        }
    });

    // Overlay canvas interactions
    elements.overlayCanvas?.addEventListener('mousedown', handleOverlayMouseDown);
    elements.overlayCanvas?.addEventListener('mousemove', handleOverlayMouseMove);
    elements.overlayCanvas?.addEventListener('mouseup', handleOverlayMouseUp);
    elements.overlayCanvas?.addEventListener('wheel', handleOverlayWheel);
    elements.overlayCanvas?.addEventListener('contextmenu', handleOverlayContextMenu);
}

// ========================================
// Focus Zone Handlers
// ========================================

function handleOverlayMouseDown(e) {
    if (!state.isFocusEditMode) return;

    const rect = elements.overlayCanvas.getBoundingClientRect();
    const scaleX = elements.overlayCanvas.width / rect.width;
    const scaleY = elements.overlayCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check existing zones
    for (let i = state.focusZones.length - 1; i >= 0; i--) {
        const z = state.focusZones[i];
        const dist = Math.sqrt((x - z.x) ** 2 + (y - z.y) ** 2);
        if (dist < z.radius) {
            state.draggedZone = z;
            return;
        }
    }

    // Add new zone
    if (state.focusZones.length < 10) {
        state.focusZones.push({ x, y, radius: 50 });
        drawOverlay();
        if (state.currentMediaType !== 'video') restartProcess();
    } else {
        alert("최대 10개까지만 추가할 수 있습니다.");
    }
}

function handleOverlayMouseMove(e) {
    if (!state.isFocusEditMode || !state.draggedZone) return;

    const rect = elements.overlayCanvas.getBoundingClientRect();
    const scaleX = elements.overlayCanvas.width / rect.width;
    const scaleY = elements.overlayCanvas.height / rect.height;
    state.draggedZone.x = (e.clientX - rect.left) * scaleX;
    state.draggedZone.y = (e.clientY - rect.top) * scaleY;
    drawOverlay();
}

function handleOverlayMouseUp() {
    if (state.draggedZone) {
        state.draggedZone = null;
        if (state.currentMediaType !== 'video') restartProcess();
    }
}

function handleOverlayWheel(e) {
    if (!state.isFocusEditMode) return;
    e.preventDefault();

    const rect = elements.overlayCanvas.getBoundingClientRect();
    const scaleX = elements.overlayCanvas.width / rect.width;
    const scaleY = elements.overlayCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    for (const z of state.focusZones) {
        const dist = Math.sqrt((x - z.x) ** 2 + (y - z.y) ** 2);
        if (dist < z.radius) {
            z.radius = Math.max(10, Math.min(300, z.radius - e.deltaY * 0.1));
            drawOverlay();
            if (state.currentMediaType !== 'video') restartProcess();
            return;
        }
    }
}

function handleOverlayContextMenu(e) {
    if (!state.isFocusEditMode) return;
    e.preventDefault();

    const rect = elements.overlayCanvas.getBoundingClientRect();
    const scaleX = elements.overlayCanvas.width / rect.width;
    const scaleY = elements.overlayCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    for (let i = state.focusZones.length - 1; i >= 0; i--) {
        const z = state.focusZones[i];
        const dist = Math.sqrt((x - z.x) ** 2 + (y - z.y) ** 2);
        if (dist < z.radius) {
            state.focusZones.splice(i, 1);
            drawOverlay();
            if (state.currentMediaType !== 'video') restartProcess();
            return;
        }
    }
}

// ========================================
// UI Update Functions
// ========================================

function updateSmoothValText() {
    if (config.mode === 'gaussian') {
        elements.smoothVal.textContent = config.smoothness + "단계";
    } else {
        elements.smoothVal.textContent = config.smoothness;
    }
}

function updateSpeedText() {
    if (!elements.speedVal) return;
    if (config.speed <= 3) elements.speedVal.textContent = "느림";
    else if (config.speed <= 15) elements.speedVal.textContent = "보통";
    else if (config.speed <= 30) elements.speedVal.textContent = "빠름";
    else elements.speedVal.textContent = "매우 빠름";
}

function updateUIForMode() {
    if (config.mode === 'gaussian') {
        elements.smoothLabel.textContent = "가우시안 강도";
        elements.smoothDesc.textContent = "* 반복할수록 선이 뭉개지며 부드러워집니다.";
        elements.smoothSlider.max = 10;
    } else if (config.mode === 'spline') {
        elements.smoothLabel.textContent = "단순화 (RDP)";
        elements.smoothDesc.textContent = "* RDP 오차 허용치 (벡터화 강도)";
        elements.smoothSlider.max = 20;
    } else if (config.mode === 'quadratic') {
        elements.smoothLabel.textContent = "단순화 (RDP)";
        elements.smoothDesc.textContent = "* 곡선 적용 전 단순화 강도";
        elements.smoothSlider.max = 20;
    } else if (config.mode === 'rectilinear') {
        elements.smoothLabel.textContent = "직각 단순화";
        elements.smoothDesc.textContent = "* 높을수록 직각 구간이 커집니다 (단순화)";
        elements.smoothSlider.max = 20;
    }
    updateSmoothValText();
}

function updateColorUI() {
    elements.singleColorOptions?.classList.add('hidden');
    elements.tritoneOptions?.classList.add('hidden');
    elements.paletteOptions?.classList.add('hidden');

    if (config.colorMode === 'single') {
        elements.singleColorOptions?.classList.remove('hidden');
    } else if (config.colorMode === 'tritone') {
        elements.tritoneOptions?.classList.remove('hidden');
    } else if (config.colorMode === 'palette') {
        elements.paletteOptions?.classList.remove('hidden');
    }
}

function updateWatercolorOptionsVisibility() {
    if (config.drawStyle === 'watercolor' || config.drawStyle === 'realistic') {
        elements.watercolorOptions?.classList.remove('hidden');
    } else {
        elements.watercolorOptions?.classList.add('hidden');
    }
}

function drawOverlay() {
    elements.overlayCtx.clearRect(0, 0, elements.overlayCanvas.width, elements.overlayCanvas.height);
    if (!elements.showGuidesCheck?.checked) return;

    state.focusZones.forEach((z, idx) => {
        elements.overlayCtx.beginPath();
        elements.overlayCtx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        elements.overlayCtx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
        elements.overlayCtx.lineWidth = 2;
        elements.overlayCtx.setLineDash([5, 5]);
        elements.overlayCtx.stroke();
        elements.overlayCtx.setLineDash([]);

        elements.overlayCtx.fillStyle = 'rgba(255, 50, 50, 0.1)';
        elements.overlayCtx.fill();

        elements.overlayCtx.fillStyle = 'white';
        elements.overlayCtx.font = '12px Arial';
        elements.overlayCtx.fillText(idx + 1, z.x - 4, z.y + 4);
    });
}

// ========================================
// Media Handling
// ========================================

async function handleMediaUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    elements.fileNameEl.textContent = file.name;
    const fileType = file.type;

    stopAllLoops();
    elements.togglePlayBtn?.classList.add('hidden');
    elements.playbackSpeedControl?.classList.add('hidden');
    showLoading(true, "파일 분석 중...");

    if (fileType.startsWith('image/')) {
        state.currentMediaType = 'image';
        const reader = new FileReader();
        reader.onload = (event) => {
            state.originalImage = new Image();
            state.originalImage.onload = () => restartProcess();
            state.originalImage.src = event.target.result;
        };
        reader.readAsDataURL(file);
    } else if (fileType.startsWith('audio/')) {
        state.currentMediaType = 'audio';
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            state.audioBufferData = await audioCtx.decodeAudioData(arrayBuffer);
            restartProcess();
        } catch (err) {
            alert("오디오 분석 실패");
            showLoading(false);
        }
    } else if (fileType.startsWith('video/')) {
        state.currentMediaType = 'video';
        elements.playbackSpeedControl?.classList.remove('hidden');
        const url = URL.createObjectURL(file);
        elements.sourceVideo.src = url;
        elements.sourceVideo.playbackRate = parseFloat(elements.playbackRateSlider?.value || 1);
        elements.sourceVideo.onloadedmetadata = () => {
            elements.togglePlayBtn?.classList.remove('hidden');
            elements.sourceVideo.play();
            restartVideoProcess();
        };
        elements.sourceVideo.onerror = () => {
            alert("비디오 로드 실패");
            showLoading(false);
        };
    } else {
        alert("지원하지 않는 형식");
        showLoading(false);
    }
}

function handlePaletteImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => extractPaletteFromImage(img);
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function extractPaletteFromImage(img) {
    elements.paletteCanvas.width = 100;
    elements.paletteCanvas.height = 100;
    elements.paletteCtx.drawImage(img, 0, 0, 100, 100);

    const data = elements.paletteCtx.getImageData(0, 0, 100, 100).data;
    const colors = [];
    const threshold = 40;

    for (let i = 0; i < data.length; i += 4 * 10) {
        if (colors.length >= 10) break;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        let isDistinct = true;
        for (const c of colors) {
            const dr = c.r - r;
            const dg = c.g - g;
            const db = c.b - b;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);
            if (dist < threshold) {
                isDistinct = false;
                break;
            }
        }

        if (isDistinct) {
            colors.push({ r, g, b });
        }
    }

    config.palette = colors.map(c => rgbToHex(c.r, c.g, c.b));
    renderPaletteUI();

    if (config.colorMode === 'palette' && state.currentMediaType !== 'video') {
        animatePath();
    }
}

function renderPaletteUI() {
    elements.paletteContainer.innerHTML = '';
    if (config.palette.length === 0) {
        elements.paletteContainer.innerHTML = '<span class="text-xs text-gray-400">이미지를 올리면 색상이 추출됩니다.</span>';
        return;
    }

    config.palette.forEach((color, index) => {
        const chip = document.createElement('div');
        chip.className = 'color-chip';
        chip.style.backgroundColor = color;
        chip.title = '클릭하여 삭제';
        chip.addEventListener('click', () => {
            config.palette.splice(index, 1);
            renderPaletteUI();
            if (config.colorMode === 'palette' && state.currentMediaType !== 'video') {
                animatePath();
            }
        });
        elements.paletteContainer.appendChild(chip);
    });
}

function handleDownload() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = elements.mainCanvas.width;
    tempCanvas.height = elements.mainCanvas.height;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.fillStyle = config.bgColor;
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tCtx.drawImage(elements.mainCanvas, 0, 0);

    const link = document.createElement('a');
    link.download = 'watercolor-croquis.png';
    link.href = tempCanvas.toDataURL();
    link.click();
}

// ========================================
// Processing Pipeline
// ========================================

function stopAllLoops() {
    if (state.animationId) cancelAnimationFrame(state.animationId);
    if (state.videoLoopId) cancelAnimationFrame(state.videoLoopId);
    elements.sourceVideo?.pause();
}

function showLoading(show, text) {
    if (text) elements.loadingText.textContent = text;
    if (show) elements.loadingOverlay?.classList.remove('hidden');
    else elements.loadingOverlay?.classList.add('hidden');
}

function restartProcess() {
    stopAllLoops();
    showLoading(true, "엣지 검출 및 최적화 중...");

    setTimeout(() => {
        try {
            prepareHiddenCanvas();
            runEdgeDetection();
            runPathOptimization();
            applySmoothing();
            animatePath();
        } catch (error) {
            console.error('Processing error:', error);
            alert('처리 중 오류 발생: ' + error.message);
        } finally {
            showLoading(false);
        }
    }, 50);
}

function restartVideoProcess() {
    stopAllLoops();
    showLoading(true, "비디오 엔진 가동...");

    const container = elements.canvasContainer;
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 40;

    let w = elements.sourceVideo.videoWidth;
    let h = elements.sourceVideo.videoHeight;
    const scale = Math.min(maxWidth / w, maxHeight / h);
    w = Math.floor(w * scale);
    h = Math.floor(h * scale);

    elements.mainCanvas.width = w;
    elements.mainCanvas.height = h;
    elements.hiddenCanvas.width = w;
    elements.hiddenCanvas.height = h;
    elements.overlayCanvas.width = w;
    elements.overlayCanvas.height = h;

    showLoading(false);
    videoLoop();
}

function videoLoop() {
    if (elements.sourceVideo.paused || elements.sourceVideo.ended) {
        state.videoLoopId = requestAnimationFrame(videoLoop);
        return;
    }

    elements.hiddenCtx.drawImage(elements.sourceVideo, 0, 0, elements.hiddenCanvas.width, elements.hiddenCanvas.height);
    runEdgeDetection();
    runPathOptimization();
    applySmoothing();
    drawInstantFrame();
    drawOverlay();

    state.videoLoopId = requestAnimationFrame(videoLoop);
}

function prepareHiddenCanvas() {
    const container = elements.canvasContainer;
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 40;
    let w, h;

    if (state.currentMediaType === 'image' && state.originalImage) {
        w = state.originalImage.width;
        h = state.originalImage.height;
        const scale = Math.min(maxWidth / w, maxHeight / h);
        w = Math.floor(w * scale);
        h = Math.floor(h * scale);

        elements.mainCanvas.width = w;
        elements.mainCanvas.height = h;
        elements.hiddenCanvas.width = w;
        elements.hiddenCanvas.height = h;
        elements.overlayCanvas.width = w;
        elements.overlayCanvas.height = h;

        elements.hiddenCtx.drawImage(state.originalImage, 0, 0, w, h);
    } else if (state.currentMediaType === 'audio' && state.audioBufferData) {
        w = 800;
        h = 600;
        const scale = Math.min(maxWidth / w, maxHeight / h);
        w = Math.floor(w * scale);
        h = Math.floor(h * scale);

        elements.mainCanvas.width = w;
        elements.mainCanvas.height = h;
        elements.hiddenCanvas.width = w;
        elements.hiddenCanvas.height = h;
        elements.overlayCanvas.width = w;
        elements.overlayCanvas.height = h;

        drawWaveformToHiddenCanvas(w, h);
    }

    drawOverlay();
}

function drawWaveformToHiddenCanvas(w, h) {
    elements.hiddenCtx.fillStyle = '#ffffff';
    elements.hiddenCtx.fillRect(0, 0, w, h);

    const rawData = state.audioBufferData.getChannelData(0);
    const step = Math.ceil(rawData.length / w);
    const amp = h / 2;

    elements.hiddenCtx.fillStyle = '#000000';
    elements.hiddenCtx.beginPath();

    for (let i = 0; i < w; i++) {
        let min = 1.0, max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = rawData[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        const yLow = (1 + min) * amp;
        const yHigh = (1 + max) * amp;
        elements.hiddenCtx.fillRect(i, yLow, 1, Math.max(1, yHigh - yLow));
    }
}

function runEdgeDetection() {
    state.points = detectEdges(elements.hiddenCtx, config, state.focusZones, state.currentMediaType);
}

function runPathOptimization() {
    state.sortedPoints = optimizePath(state.points, state.currentMediaType);
}

function applySmoothing() {
    if (!state.sortedPoints || state.sortedPoints.length < 3) {
        state.smoothedPoints = state.sortedPoints;
        return;
    }

    if (config.mode === 'gaussian') applyGaussianSmoothing();
    else if (config.mode === 'spline') applySplineSmoothing();
    else if (config.mode === 'quadratic') applyQuadraticSmoothing();
    else if (config.mode === 'rectilinear') applyRectilinearSmoothing();
}

function applyGaussianSmoothing() {
    let tempPoints = JSON.parse(JSON.stringify(state.sortedPoints));
    const iterations = config.smoothness;

    for (let iter = 0; iter < iterations; iter++) {
        const nextPass = [tempPoints[0]];

        for (let i = 1; i < tempPoints.length - 1; i++) {
            const prev = tempPoints[i - 1];
            const curr = tempPoints[i];
            const next = tempPoints[i + 1];
            const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
            const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);

            if (d1 < config.splitThreshold && d2 < config.splitThreshold) {
                const newX = prev.x * 0.25 + curr.x * 0.5 + next.x * 0.25;
                const newY = prev.y * 0.25 + curr.y * 0.5 + next.y * 0.25;
                nextPass.push({ x: newX, y: newY });
            } else {
                nextPass.push(curr);
            }
        }

        nextPass.push(tempPoints[tempPoints.length - 1]);
        tempPoints = nextPass;
    }

    state.smoothedPoints = tempPoints;
}

function applySplineSmoothing() {
    state.smoothedPoints = [];
    const strokes = getStrokes(state.sortedPoints, config.splitThreshold);
    const tolerance = Math.max(0.5, config.smoothness * 0.8);

    strokes.forEach(stroke => {
        if (stroke.length < 3) {
            for (let i = 0; i < stroke.length; i++) {
                state.smoothedPoints.push(stroke[i]);
            }
            return;
        }
        const simpleStroke = simplifyPoints(stroke, tolerance);
        const splineStroke = getCatmullRomPoints(simpleStroke, 5);
        for (let i = 0; i < splineStroke.length; i++) {
            state.smoothedPoints.push(splineStroke[i]);
        }
    });
}

function applyQuadraticSmoothing() {
    state.smoothedPoints = [];
    const strokes = getStrokes(state.sortedPoints, config.splitThreshold);
    const tolerance = Math.max(0.5, config.smoothness * 0.8);

    strokes.forEach(stroke => {
        if (stroke.length < 3) {
            for (let i = 0; i < stroke.length; i++) {
                state.smoothedPoints.push(stroke[i]);
            }
            return;
        }
        const simpleStroke = simplifyPoints(stroke, tolerance);
        const quadStroke = getQuadraticBezierPoints(simpleStroke, 10);
        for (let i = 0; i < quadStroke.length; i++) {
            state.smoothedPoints.push(quadStroke[i]);
        }
    });
}

function applyRectilinearSmoothing() {
    state.smoothedPoints = [];
    const tolerance = Math.max(0.5, config.smoothness * 1.5);
    const simpleStroke = simplifyPoints(state.sortedPoints, tolerance);

    state.smoothedPoints.push(simpleStroke[0]);

    for (let i = 0; i < simpleStroke.length - 1; i++) {
        const curr = simpleStroke[i];
        const next = simpleStroke[i + 1];
        const dist = Math.hypot(next.x - curr.x, next.y - curr.y);

        if (dist > config.splitThreshold) {
            state.smoothedPoints.push(next);
        } else {
            if (Math.random() > 0.5) {
                state.smoothedPoints.push({ x: next.x, y: curr.y });
            } else {
                state.smoothedPoints.push({ x: curr.x, y: next.y });
            }
            state.smoothedPoints.push(next);
        }
    }
}

// ========================================
// Color Helpers
// ========================================

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function getStrokeColor(p, pixelData, w) {
    let r = 34, g = 34, b = 34;

    if (config.colorMode === 'single') {
        return '#222222';
    }

    if (pixelData) {
        const ix = Math.min(w - 1, Math.max(0, Math.floor(p.x)));
        const iy = Math.min(elements.mainCanvas.height - 1, Math.max(0, Math.floor(p.y)));
        const idx = (iy * w + ix) * 4;
        r = pixelData[idx];
        g = pixelData[idx + 1];
        b = pixelData[idx + 2];
    }

    if (config.colorMode === 'original') {
        return `rgb(${r},${g},${b})`;
    }

    if (config.colorMode === 'tritone') {
        const brightness = (r + g + b) / 3;
        if (brightness < 85) return config.triColors[0];
        if (brightness < 170) return config.triColors[1];
        return config.triColors[2];
    }

    if (config.colorMode === 'palette') {
        if (config.palette.length === 0) return '#222222';

        let minD = Infinity;
        let bestColor = config.palette[0];

        for (const hex of config.palette) {
            const c = hexToRgb(hex);
            const dr = c.r - r;
            const dg = c.g - g;
            const db = c.b - b;
            const dist = dr * dr + dg * dg + db * db;
            if (dist < minD) {
                minD = dist;
                bestColor = hex;
            }
        }
        return bestColor;
    }

    return '#222222';
}

// ========================================
// Drawing Functions
// ========================================

function drawInstantFrame() {
    const w = elements.mainCanvas.width;
    const h = elements.mainCanvas.height;

    elements.ctx.fillStyle = config.bgColor;
    elements.ctx.fillRect(0, 0, w, h);

    if (!state.smoothedPoints || state.smoothedPoints.length < 2) return;

    let pixelData = null;
    if (config.colorMode === 'original' || config.colorMode === 'tritone' || config.colorMode === 'palette') {
        pixelData = elements.hiddenCtx.getImageData(0, 0, w, h).data;
    }

    let strokeCount = 1;
    elements.ctx.lineCap = 'round';
    elements.ctx.lineJoin = config.mode === 'rectilinear' ? 'miter' : 'round';

    for (let i = 0; i < state.smoothedPoints.length - 1; i++) {
        const p1 = state.smoothedPoints[i];
        const p2 = state.smoothedPoints[i + 1];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > config.splitThreshold) {
            strokeCount++;
        } else {
            elements.ctx.beginPath();
            elements.ctx.moveTo(p1.x, p1.y);

            if (dist > 10) {
                elements.ctx.lineTo(p2.x, p2.y);
                elements.ctx.strokeStyle = `rgba(180, 180, 200, ${config.ghostOpacity})`;
                elements.ctx.lineWidth = 0.5;
            } else {
                elements.ctx.lineTo(p2.x, p2.y);
                elements.ctx.strokeStyle = getStrokeColor(p1, pixelData, w);
                let baseWidth = 1.5;
                if (config.mode === 'gaussian') baseWidth = 2.0;
                if (config.mode === 'quadratic') baseWidth = 1.8;
                elements.ctx.lineWidth = Math.max(0.5, baseWidth - (dist / 10));
            }
            elements.ctx.stroke();
        }
    }

    updateStats(strokeCount);
}

function animatePath() {
    if (state.animationId) cancelAnimationFrame(state.animationId);
    if (config.instant) {
        drawInstantFrame();
        return;
    }

    const w = elements.mainCanvas.width;
    const h = elements.mainCanvas.height;

    elements.ctx.fillStyle = config.bgColor;
    elements.ctx.fillRect(0, 0, w, h);

    if (!state.smoothedPoints || state.smoothedPoints.length < 2) return;

    // Watercolor setup
    if (config.drawStyle === 'watercolor' || config.drawStyle === 'realistic') {
        wcEngine.reset();

        const targetRes = config.drawStyle === 'realistic' ? 1000 : config.wcResolution;
        if (wcEngine.GRID_SIZE !== targetRes) {
            wcEngine.resize(targetRes);
            watercolorCanvas.width = targetRes;
            watercolorCanvas.height = targetRes;
        }
    }

    let pixelData = null;
    if (config.colorMode === 'original' || config.colorMode === 'tritone' || config.colorMode === 'palette') {
        pixelData = elements.hiddenCtx.getImageData(0, 0, w, h).data;
    }

    let strokeCount = 1;
    elements.ctx.lineCap = 'round';
    elements.ctx.lineJoin = config.mode === 'rectilinear' ? 'miter' : 'round';

    let currentIndex = 0;
    const totalPoints = state.smoothedPoints.length;

    function drawFrame() {
        if (currentIndex >= totalPoints - 1) {
            updateStats(strokeCount);
            return;
        }

        const drawSpeed = config.speed;

        if (config.drawStyle === 'watercolor' || config.drawStyle === 'realistic') {
            drawWatercolorFrame(w, h, pixelData, drawSpeed, () => {
                currentIndex++;
            });
        } else if (config.drawStyle === 'drawing') {
            drawSketchFrame(w, h, pixelData, drawSpeed, () => {
                currentIndex++;
            });
        } else {
            drawStandardFrame(w, h, pixelData, drawSpeed, strokeCount, (newCount, idx) => {
                strokeCount = newCount;
                currentIndex = idx;
            });
        }

        state.animationId = requestAnimationFrame(drawFrame);
    }

    // Simplified frame drawing for performance
    function drawWatercolorFrame(w, h, pixelData, speed, onAdvance) {
        for (let k = 0; k < speed; k++) {
            if (currentIndex >= totalPoints - 1) break;

            const p1 = state.smoothedPoints[currentIndex];
            const p2 = state.smoothedPoints[currentIndex + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > config.splitThreshold) {
                // Ghost line
                elements.ctx.beginPath();
                elements.ctx.moveTo(p1.x, p1.y);
                elements.ctx.lineTo(p2.x, p2.y);
                elements.ctx.strokeStyle = `rgba(180, 180, 200, ${config.ghostOpacity})`;
                elements.ctx.lineWidth = 0.5;
                elements.ctx.stroke();
                currentIndex++;
                continue;
            }

            // Interpolate
            const stepSize = Math.max(1, wcEngine.brush?.size / 2 || 2);
            const steps = Math.max(1, Math.ceil(dist / stepSize));

            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                const ix = p1.x + dx * t;
                const iy = p1.y + dy * t;

                const gx = Math.floor((ix / w) * wcEngine.GRID_SIZE);
                const gy = Math.floor((iy / h) * wcEngine.GRID_SIZE);

                const color = getStrokeColor({ x: ix, y: iy }, pixelData, w);
                wcEngine.applyBrush(gx, gy, color);
            }
            currentIndex++;
        }

        // Simulate & render
        wcEngine.step();
        const imgData = wcEngine.render(watercolorCtx, wcEngine.GRID_SIZE, wcEngine.GRID_SIZE);
        watercolorCtx.putImageData(imgData, 0, 0);
        elements.ctx.drawImage(watercolorCanvas, 0, 0, w, h);
    }

    function drawSketchFrame(w, h, pixelData, speed, onAdvance) {
        elements.ctx.lineCap = 'butt';
        elements.ctx.lineJoin = 'miter';

        for (let k = 0; k < speed; k++) {
            if (currentIndex >= totalPoints - 1) break;

            const p1 = state.smoothedPoints[currentIndex];
            const p2 = state.smoothedPoints[currentIndex + 1];
            const color = getStrokeColor(p1, pixelData, w);

            const jitter = () => (Math.random() - 0.5) * 1.5;

            elements.ctx.beginPath();
            elements.ctx.moveTo(p1.x + jitter(), p1.y + jitter());
            elements.ctx.lineTo(p2.x + jitter(), p2.y + jitter());
            elements.ctx.strokeStyle = color;
            elements.ctx.globalCompositeOperation = 'multiply';
            elements.ctx.globalAlpha = 0.7;
            elements.ctx.lineWidth = Math.random() * 1.0 + 0.5;
            elements.ctx.stroke();

            if (Math.random() > 0.7) {
                elements.ctx.beginPath();
                elements.ctx.moveTo(p1.x + jitter() * 2, p1.y + jitter() * 2);
                elements.ctx.lineTo(p2.x + jitter() * 2, p2.y + jitter() * 2);
                elements.ctx.globalAlpha = 0.4;
                elements.ctx.stroke();
            }

            elements.ctx.globalCompositeOperation = 'source-over';
            elements.ctx.globalAlpha = 1.0;
            currentIndex++;
        }
    }

    function drawStandardFrame(w, h, pixelData, speed, strokeCount, onUpdate) {
        for (let k = 0; k < speed; k++) {
            if (currentIndex >= totalPoints - 1) break;

            const p1 = state.smoothedPoints[currentIndex];
            const p2 = state.smoothedPoints[currentIndex + 1];
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            elements.ctx.beginPath();
            elements.ctx.moveTo(p1.x, p1.y);

            if (dist > config.splitThreshold) {
                strokeCount++;
            } else if (dist > 10) {
                elements.ctx.lineTo(p2.x, p2.y);
                elements.ctx.strokeStyle = `rgba(180, 180, 200, ${config.ghostOpacity})`;
                elements.ctx.lineWidth = 0.5;
                elements.ctx.stroke();
            } else {
                elements.ctx.lineTo(p2.x, p2.y);
                elements.ctx.strokeStyle = getStrokeColor(p1, pixelData, w);
                let baseWidth = 1.5;
                if (config.mode === 'gaussian') baseWidth = 2.0;
                if (config.mode === 'quadratic') baseWidth = 1.8;
                elements.ctx.lineWidth = Math.max(0.5, baseWidth - (dist / 10));
                elements.ctx.stroke();
            }
            currentIndex++;
        }
        onUpdate(strokeCount, currentIndex);
    }

    drawFrame();
}

function updateStats(strokes) {
    if (!elements.statsEl) return;

    let modeText = "가우시안";
    if (config.mode === 'spline') modeText = "스플라인";
    if (config.mode === 'quadratic') modeText = "2차 베지에";
    if (config.mode === 'rectilinear') modeText = "직각";

    let typeText = "없음";
    if (state.currentMediaType === 'image') typeText = "이미지";
    else if (state.currentMediaType === 'audio') typeText = "오디오 파형";
    else if (state.currentMediaType === 'video') typeText = "동영상 (Live)";

    let instantText = config.instant ? " (즉시)" : "";
    if (state.currentMediaType === 'video') instantText = " (실시간)";

    const wasmText = isWasmEnabled() ? '🚀' : '';

    elements.statsEl.innerHTML = `${wasmText} 소스: ${typeText} | 포인트: ${state.smoothedPoints.length}개<br>
    <span class="text-xs text-gray-500">모드: ${modeText} | 강도: ${config.smoothness}${instantText} | 강조 영역: ${state.focusZones.length}개</span>`;
}

// ========================================
// Initialize on DOM Ready
// ========================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for potential external use
export { config, state, wcEngine };
