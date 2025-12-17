import './style.css';

// Prevent scroll restoration
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// MediaPipe will be loaded from CDN via script tags
// Access via window object
const SelfieSegmentation = window.SelfieSegmentation;
const Camera = window.Camera;

// Configuration - now controllable via sliders
let CELL_SIZE = 20; // Larger for 5-character cells
let WAVE_SPEED = 0.015; // Reduced wave intensity
const COLOR_CHANGE_SPEED = 0.0015;
let BG_COLOR = '#FFFFFF'; // Background color - default white for minimalist look
let SPECTRUM_OFFSET = 0; // 0 = rainbow, 1-360 = spectrum starting at hue
let WAVE_PATTERN = 'radial'; // Wave pattern: radial, horizontal, vertical, sinusoidal, random

// Color palettes for vibrant, smooth transitions - Excel-inspired
const COLOR_PALETTES = [
  { h: 280, s: 95, l: 65 }, // Vibrant Purple
  { h: 200, s: 100, l: 60 }, // Electric Cyan
  { h: 330, s: 100, l: 65 }, // Hot Pink
  { h: 160, s: 90, l: 60 }, // Lime Green
  { h: 40, s: 100, l: 65 },  // Bright Orange
  { h: 260, s: 95, l: 70 }, // Violet
  { h: 120, s: 85, l: 55 }, // Emerald
  { h: 0, s: 90, l: 60 },   // Red
  { h: 60, s: 95, l: 60 },  // Yellow
  { h: 300, s: 90, l: 65 }, // Magenta
];

class NumberTwinApp {
  constructor() {
    this.video = document.getElementById('video');
    this.segmentationCanvas = document.getElementById('segmentation-canvas');
    this.gridCanvas = document.getElementById('grid-canvas');
    this.cellCanvas = document.getElementById('cell-canvas');
    this.textCanvas = document.getElementById('text-canvas');
    this.startBtn = document.getElementById('start-btn');
    this.fullscreenBtn = document.getElementById('fullscreen-btn');
    this.recordBtn = document.getElementById('record-btn');
    this.downloadBtn = document.getElementById('download-btn');
    this.status = document.getElementById('status');
    this.textInput = document.getElementById('text-input');
    this.clearTextBtn = document.getElementById('clear-text-btn');
    this.columnHeaders = document.getElementById('column-headers');
    this.rowHeaders = document.getElementById('row-headers');
    this.videoContainer = document.querySelector('.video-container');
    this.loadingMessage = document.querySelector('.loading-message');
    this.recordingTimer = document.getElementById('recording-timer');
    this.timerDisplay = document.getElementById('timer-display');

    // Sliders
    // Sliders and color picker
    this.bgColorPicker = document.getElementById('bg-color-picker');
    this.sizeSlider = document.getElementById('size-slider');
    this.colorSlider = document.getElementById('color-slider');
    this.bgColorValue = document.getElementById('bg-color-value');
    this.sizeValue = document.getElementById('size-value');
    this.colorValue = document.getElementById('color-value');

    this.segmentationCtx = this.segmentationCanvas.getContext('2d', { willReadFrequently: true });
    this.gridCtx = this.gridCanvas.getContext('2d');
    this.cellCtx = this.cellCanvas.getContext('2d');
    this.textCtx = this.textCanvas.getContext('2d');

    this.isRunning = false;
    this.segmentationMask = null;
    this.time = 0;
    this.colorTime = 0;
    this.currentPaletteIndex = 0;
    this.userText = '';
    this.needsHeaderUpdate = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.recordingStartTime = 0;
    this.timerInterval = null;

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.startBtn.addEventListener('click', () => this.start());

    this.textInput.addEventListener('input', (e) => {
      this.userText = e.target.value.toUpperCase();
    });

    this.clearTextBtn.addEventListener('click', () => {
      this.textInput.value = '';
      this.userText = '';
    });

    // Color picker and slider controls
    this.bgColorPicker.addEventListener('input', (e) => {
      BG_COLOR = e.target.value;
      this.bgColorValue.textContent = BG_COLOR;
    });

    this.sizeSlider.addEventListener('input', (e) => {
      CELL_SIZE = parseInt(e.target.value);
      this.sizeValue.textContent = CELL_SIZE + 'px';
      this.needsHeaderUpdate = true;
    });

    this.colorSlider.addEventListener('input', (e) => {
      SPECTRUM_OFFSET = parseInt(e.target.value);
      if (SPECTRUM_OFFSET === 0) {
        this.colorValue.textContent = 'Rainbow';
      } else {
        this.colorValue.textContent = SPECTRUM_OFFSET + '°';
      }
    });

    // Wave pattern buttons
    const waveButtons = document.querySelectorAll('.wave-btn');
    waveButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        waveButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        WAVE_PATTERN = btn.dataset.pattern;
      });
    });

    // Fullscreen button
    this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

    // Record button
    this.recordBtn.addEventListener('click', () => this.toggleRecording());

    // Download button
    this.downloadBtn.addEventListener('click', () => this.downloadScreenshot());

    // Listen for fullscreen changes to update button text
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        this.fullscreenBtn.textContent = 'Exit Fullscreen';
      } else {
        this.fullscreenBtn.textContent = 'Fullscreen';
      }
    });
  }

  async start() {
    try {
      console.log('[DEBUG] Starting camera...');
      this.startBtn.disabled = true;
      this.updateStatus('Requesting camera access...', 'active');

      // Get camera stream
      console.log('[DEBUG] Requesting camera permissions...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });
      console.log('[DEBUG] Camera stream obtained');

      this.video.srcObject = stream;
      await this.video.play();
      console.log('[DEBUG] Video playing');

      // Setup canvases
      this.setupCanvases();
      console.log('[DEBUG] Canvases setup complete');

      // Create spreadsheet headers
      this.createSpreadsheetHeaders();
      console.log('[DEBUG] Headers created');

      // Initialize segmentation
      console.log('[DEBUG] Initializing MediaPipe segmentation...');
      await this.initSegmentation();
      console.log('[DEBUG] Segmentation initialized');

      this.updateStatus('Camera active - Segmentation running', 'active');
      this.isRunning = true;

      // Hide loading message
      this.loadingMessage.classList.add('hidden');

      // Enable buttons
      this.fullscreenBtn.disabled = false;
      this.recordBtn.disabled = false;
      this.downloadBtn.disabled = false;

      // Start animation loop
      this.animate();
      console.log('[DEBUG] Animation loop started');

    } catch (error) {
      console.error('Error starting camera:', error);
      let errorMessage = 'Camera access denied';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please allow camera access.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application.';
      } else {
        errorMessage = `Error: ${error.message}`;
      }
      this.updateStatus(errorMessage, 'error');
      this.startBtn.disabled = false;
    }
  }

  setupCanvases() {
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;

    this.segmentationCanvas.width = width;
    this.segmentationCanvas.height = height;

    this.gridCanvas.width = width;
    this.gridCanvas.height = height;

    this.cellCanvas.width = width;
    this.cellCanvas.height = height;

    this.textCanvas.width = width;
    this.textCanvas.height = height;

    // Draw grid lines
    this.drawGrid();
  }

  createSpreadsheetHeaders() {
    const cols = Math.ceil(this.video.videoWidth / CELL_SIZE);
    const rows = Math.ceil(this.video.videoHeight / CELL_SIZE);

    // Create column headers (A, B, C, ...)
    this.columnHeaders.innerHTML = '';
    for (let i = 0; i < cols; i++) {
      const header = document.createElement('div');
      header.className = 'column-header';
      header.textContent = this.getColumnLabel(i);
      header.style.minWidth = CELL_SIZE + 'px';
      this.columnHeaders.appendChild(header);
    }

    // Create row headers (1, 2, 3, ...)
    this.rowHeaders.innerHTML = '';
    for (let i = 0; i < rows; i++) {
      const header = document.createElement('div');
      header.className = 'row-header';
      header.textContent = i + 1;
      header.style.minHeight = CELL_SIZE + 'px';
      this.rowHeaders.appendChild(header);
    }
  }

  getColumnLabel(index) {
    let label = '';
    let num = index;
    while (num >= 0) {
      label = String.fromCharCode(65 + (num % 26)) + label;
      num = Math.floor(num / 26) - 1;
    }
    return label;
  }

  drawGrid() {
    const ctx = this.gridCtx;
    const width = this.gridCanvas.width;
    const height = this.gridCanvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;

    // Draw vertical lines
    for (let x = 0; x <= width; x += CELL_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw horizontal lines
    for (let y = 0; y <= height; y += CELL_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  async initSegmentation() {
    try {
      console.log('[DEBUG] Starting segmentation initialization...');
      this.updateStatus('Loading segmentation model...', 'active');

      console.log('[DEBUG] Creating SelfieSegmentation instance...');
      this.selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => {
          const url = `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
          console.log('[DEBUG] Loading MediaPipe file:', url);
          return url;
        }
      });
      console.log('[DEBUG] SelfieSegmentation instance created');

      console.log('[DEBUG] Setting segmentation options...');
      this.selfieSegmentation.setOptions({
        modelSelection: 1,
        selfieMode: false, // No mirror effect
      });
      console.log('[DEBUG] Options set');

      console.log('[DEBUG] Setting up results callback...');
      this.selfieSegmentation.onResults((results) => {
        console.log('[DEBUG] Segmentation results received');
        this.onSegmentationResults(results);
      });

      // Start camera processing
      console.log('[DEBUG] Creating Camera instance...');
      const camera = new Camera(this.video, {
        onFrame: async () => {
          if (this.isRunning) {
            await this.selfieSegmentation.send({ image: this.video });
          }
        },
        width: 1280,
        height: 720
      });
      console.log('[DEBUG] Camera instance created');

      console.log('[DEBUG] Starting camera processing...');
      camera.start();
      console.log('[DEBUG] Camera processing started');
    } catch (error) {
      console.error('[ERROR] Segmentation initialization failed:', error);
      console.error('[ERROR] Error stack:', error.stack);
      this.updateStatus('Failed to load segmentation model: ' + error.message, 'error');
      this.isRunning = false;
      this.startBtn.disabled = false;
    }
  }

  onSegmentationResults(results) {
    // Store segmentation mask
    this.segmentationCtx.clearRect(0, 0, this.segmentationCanvas.width, this.segmentationCanvas.height);
    this.segmentationCtx.drawImage(results.segmentationMask, 0, 0);

    // Get image data for cell processing
    this.segmentationMask = this.segmentationCtx.getImageData(
      0, 0,
      this.segmentationCanvas.width,
      this.segmentationCanvas.height
    );
  }

  animate() {
    if (!this.isRunning) return;

    this.time += WAVE_SPEED;
    this.colorTime += COLOR_CHANGE_SPEED;

    // Update headers if cell size changed
    if (this.needsHeaderUpdate) {
      this.createSpreadsheetHeaders();
      this.drawGrid();
      this.needsHeaderUpdate = false;
    }

    // Smoothly transition between color palettes
    if (Math.floor(this.colorTime) > this.currentPaletteIndex) {
      this.currentPaletteIndex = (this.currentPaletteIndex + 1) % COLOR_PALETTES.length;
    }

    this.drawCells();
    this.drawTextArt();

    requestAnimationFrame(() => this.animate());
  }

  calculateWave(col, row, cols, rows) {
    let wave, wave2;

    switch (WAVE_PATTERN) {
      case 'horizontal':
        // Wave moves horizontally
        wave = Math.sin(col * 0.3 - this.time * 2) * 0.3 + 0.5;
        wave2 = Math.cos(col * 0.2 + this.time * 1.5) * 0.2 + 0.5;
        break;

      case 'vertical':
        // Wave moves vertically
        wave = Math.sin(row * 0.3 - this.time * 2) * 0.3 + 0.5;
        wave2 = Math.cos(row * 0.2 + this.time * 1.5) * 0.2 + 0.5;
        break;

      case 'sinusoidal':
        // Diagonal sinusoidal pattern
        wave = Math.sin((col + row) * 0.2 - this.time * 2) * 0.3 + 0.5;
        wave2 = Math.cos((col - row) * 0.15 + this.time * 1.5) * 0.2 + 0.5;
        break;

      case 'random':
        // Pseudo-random pattern based on cell position
        const seed = col * 12.9898 + row * 78.233;
        const random = Math.sin(seed + this.time * 2) * 0.5 + 0.5;
        wave = random * 0.6 + 0.2;
        wave2 = Math.cos(seed * 1.5 + this.time * 1.5) * 0.2 + 0.5;
        break;

      case 'radial':
      default:
        // Radial wave from center (original)
        const distance = Math.sqrt(
          Math.pow(col - cols / 2, 2) +
          Math.pow(row - rows / 2, 2)
        );
        wave = Math.sin(distance * 0.15 - this.time * 2) * 0.3 + 0.5;
        wave2 = Math.cos(distance * 0.1 + this.time * 1.5) * 0.2 + 0.5;
        break;
    }

    return { wave, wave2 };
  }

  drawCells() {
    const ctx = this.cellCtx;
    const width = this.cellCanvas.width;
    const height = this.cellCanvas.height;

    // Fill background with selected color
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    if (!this.segmentationMask) return;

    // Skip colored cells if we're in ASCII art mode (user has typed text)
    if (this.userText) return;

    const cols = Math.ceil(width / CELL_SIZE);
    const rows = Math.ceil(height / CELL_SIZE);

    // Get current and next color palette for smooth transition
    const currentPalette = COLOR_PALETTES[this.currentPaletteIndex];
    const nextPalette = COLOR_PALETTES[(this.currentPaletteIndex + 1) % COLOR_PALETTES.length];
    const paletteBlend = this.colorTime % 1;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * CELL_SIZE;
        const y = row * CELL_SIZE;

        // Sample segmentation at cell center
        const sampleX = Math.min(Math.floor(x + CELL_SIZE / 2), width - 1);
        const sampleY = Math.min(Math.floor(y + CELL_SIZE / 2), height - 1);
        const pixelIndex = (sampleY * width + sampleX) * 4;

        // Check if this cell is over a person (segmentation mask value)
        const isPersonPixel = this.segmentationMask.data[pixelIndex] > 128;

        if (isPersonPixel) {
          // Calculate wave based on selected pattern
          const { wave, wave2 } = this.calculateWave(col, row, cols, rows);

          // Blend between color palettes
          const h = this.lerp(currentPalette.h, nextPalette.h, paletteBlend);
          const s = this.lerp(currentPalette.s, nextPalette.s, paletteBlend);
          const l = this.lerp(currentPalette.l, nextPalette.l, paletteBlend);

          // Apply hue offset and subtle wave
          const finalH = (h + SPECTRUM_OFFSET + wave * 15 - 7.5 + 360) % 360;
          const finalL = Math.min(85, l + wave * 15 - 5);
          const finalS = Math.min(100, s + wave2 * 8);

          // More uniform cell size
          const cellScale = 0.95 + wave * 0.05;
          const scaledSize = CELL_SIZE * cellScale;
          const offset = (CELL_SIZE - scaledSize) / 2;

          // Draw cell with vibrant gradient (Excel-like)
          const gradient = ctx.createLinearGradient(
            x, y,
            x + scaledSize, y + scaledSize
          );

          gradient.addColorStop(0, `hsl(${finalH}, ${finalS}%, ${finalL + 15}%)`);
          gradient.addColorStop(0.5, `hsl(${finalH}, ${finalS}%, ${finalL}%)`);
          gradient.addColorStop(1, `hsl(${finalH}, ${finalS}%, ${finalL - 10}%)`);

          ctx.fillStyle = gradient;

          // Draw rounded rectangle cell (Excel-style)
          this.roundRect(
            ctx,
            x + offset + 1,
            y + offset + 1,
            scaledSize - 2,
            scaledSize - 2,
            3
          );

          // Add Excel-like border
          ctx.strokeStyle = `hsl(${finalH}, ${Math.min(100, finalS + 10)}%, ${Math.min(90, finalL + 25)}%)`;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Add inner highlight for depth
          ctx.strokeStyle = `hsla(${finalH}, ${finalS}%, ${Math.min(95, finalL + 30)}%, 0.3)`;
          ctx.lineWidth = 1;
          this.roundRect(
            ctx,
            x + offset + 3,
            y + offset + 3,
            scaledSize - 6,
            scaledSize - 6,
            2
          );
          ctx.stroke();
        }
      }
    }

    // Draw watermark
    this.drawWatermark();
  }

  drawTextArt() {
    if (!this.segmentationMask) return;

    // Draw text directly on the cell canvas for visibility
    const ctx = this.cellCtx;
    const width = this.cellCanvas.width;
    const height = this.cellCanvas.height;

    // Always fill background with selected color first
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    const cols = Math.ceil(width / CELL_SIZE);
    const rows = Math.ceil(height / CELL_SIZE);

    // Decorative characters for ASCII art - ordered by density
    const decorativeChars = [' ', '.', ':', '/', '\\', '*', '#', '@'];

    // Get user text or use default
    const userChars = this.userText ? this.userText.split('') : ['@', '#', '*', '+', '=', '-', ':', '.'];

    // Font size for multi-character cells
    const fontSize = Math.max(6, Math.floor(CELL_SIZE * 0.3));
    ctx.font = `${fontSize}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Get video frame for brightness sampling
    const videoCtx = document.createElement('canvas').getContext('2d');
    videoCtx.canvas.width = this.video.videoWidth;
    videoCtx.canvas.height = this.video.videoHeight;
    videoCtx.drawImage(this.video, 0, 0);
    const videoData = videoCtx.getImageData(0, 0, videoCtx.canvas.width, videoCtx.canvas.height);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * CELL_SIZE;
        const y = row * CELL_SIZE;

        // Sample segmentation at cell center
        const sampleX = Math.min(Math.floor(x + CELL_SIZE / 2), width - 1);
        const sampleY = Math.min(Math.floor(y + CELL_SIZE / 2), height - 1);
        const pixelIndex = (sampleY * width + sampleX) * 4;

        // Check if this cell is over a person
        const isPersonPixel = this.segmentationMask.data[pixelIndex] > 128;

        if (isPersonPixel) {
          // Get brightness from video frame
          const videoSampleX = Math.floor(sampleX / width * videoCtx.canvas.width);
          const videoSampleY = Math.floor(sampleY / height * videoCtx.canvas.height);
          const videoPixelIndex = (videoSampleY * videoCtx.canvas.width + videoSampleX) * 4;

          const r = videoData.data[videoPixelIndex];
          const g = videoData.data[videoPixelIndex + 1];
          const b = videoData.data[videoPixelIndex + 2];

          // Calculate brightness with enhanced contrast (0-255)
          const brightness = (r * 0.299 + g * 0.587 + b * 0.114); // Luminance formula

          // Normalize to 0-1 and apply contrast enhancement
          const normalizedBrightness = brightness / 255;
          const contrastEnhanced = Math.pow(normalizedBrightness, 0.7); // Gamma correction for better contrast

          // Create 5-character string based on brightness
          let cellText = '';

          // Use brightness to determine character density (16 levels for more detail)
          // Add wave speed influence for procedural variation
          const waveInfluence = Math.sin((col + row) * 0.1 + this.time * WAVE_SPEED * 50) * 2;
          const densityLevel = Math.floor(contrastEnhanced * 16 + waveInfluence);

          for (let i = 0; i < 5; i++) {
            if (densityLevel >= 14) {
              // Brightest - almost empty
              cellText += (i === 2) ? '.' : ' ';
            } else if (densityLevel >= 12) {
              // Very bright
              cellText += (i % 2 === 0) ? ' ' : '.';
            } else if (densityLevel >= 10) {
              // Bright
              cellText += [' ', '.', ' ', ':', ' '][i];
            } else if (densityLevel >= 8) {
              // Medium-bright
              cellText += (i % 2 === 0) ? userChars[userChars.length - 1] : '/';
            } else if (densityLevel >= 6) {
              // Medium
              cellText += (i === 2) ? userChars[Math.floor(userChars.length / 2)] : ['/', '\\', '*', '/', '\\'][i];
            } else if (densityLevel >= 4) {
              // Medium-dark
              cellText += (i % 2 === 0) ? userChars[(col + row) % userChars.length] : '*';
            } else if (densityLevel >= 2) {
              // Dark
              cellText += userChars[(col + row + i) % Math.max(3, userChars.length - 2)];
            } else {
              // Darkest - very dense
              cellText += userChars[i % Math.min(3, userChars.length)];
            }
          }

          // Draw colored cell background with spectrum
          if (SPECTRUM_OFFSET === 0) {
            // Rainbow mode - full spectrum across face with rotation speed based on WAVE_SPEED
            const timeOffset = (this.time * (WAVE_SPEED * 666)) % 360; // Speed controlled by slider
            const hue = ((col / cols) * 360 + timeOffset) % 360;
            const finalL = Math.min(70, 30 + contrastEnhanced * 40); // Darker for better text contrast
            const finalS = 85;
            ctx.fillStyle = `hsl(${hue}, ${finalS}%, ${finalL}%)`;
          } else {
            // Spectrum mode - use offset as starting hue
            const hue = (SPECTRUM_OFFSET + (col / cols) * 120) % 360; // 120° range
            const finalL = Math.min(70, 30 + contrastEnhanced * 40);
            const finalS = 85;
            ctx.fillStyle = `hsl(${hue}, ${finalS}%, ${finalL}%)`;
          }

          // Draw colored cell background
          ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

          // Draw text in contrasting color (white or black based on brightness)
          const textColor = contrastEnhanced > 0.5 ? '#000000' : '#FFFFFF';
          ctx.fillStyle = textColor;

          // Draw the 5-character string
          ctx.fillText(cellText, x + 1, y + CELL_SIZE / 2 - fontSize / 2);
        }
      }
    }

    // Draw watermark
    this.drawWatermark();
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      // Enter fullscreen
      this.videoContainer.requestFullscreen().catch(err => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      // Exit fullscreen
      document.exitFullscreen();
    }
  }

  updateStatus(message, type = '') {
    this.status.textContent = message;
    this.status.className = 'status' + (type ? ' ' + type : '');
  }

  drawWatermark() {
    const ctx = this.cellCtx;
    const text = 'DIMENSIONS BY LIVIA ELLEN';
    const padding = 12;
    const fontSize = 10;

    ctx.font = `${fontSize}px 'Press Start 2P', monospace`;
    const textWidth = ctx.measureText(text).width;

    // Position box in bottom-right corner
    const boxWidth = textWidth + padding * 2;
    const boxHeight = fontSize + padding * 2;
    const x = this.cellCanvas.width - boxWidth - 10;
    const y = this.cellCanvas.height - boxHeight - 10;

    // Draw semi-transparent background with gradient
    const gradient = ctx.createLinearGradient(x, y, x, y + boxHeight);
    gradient.addColorStop(0, 'rgba(0, 17, 0, 0.9)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, boxWidth, boxHeight);

    // Draw double border for depth
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, boxWidth, boxHeight);

    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + 2, boxWidth - 4, boxHeight - 4);

    // Draw centered text with glow
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00ff00';
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 8;
    ctx.fillText(text, x + boxWidth / 2, y + boxHeight / 2);
    ctx.shadowBlur = 0;
  }

  toggleRecording() {
    if (!this.isRecording) {
      this.startRecording();
    } else {
      this.stopRecording();
    }
  }

  startRecording() {
    try {
      const stream = this.cellCanvas.captureStream(30); // 30 FPS

      // Try different codec options for better compatibility
      let options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log('vp9 not supported, trying vp8');
        options = { mimeType: 'video/webm;codecs=vp8' };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log('vp8 not supported, using default');
        options = { mimeType: 'video/webm' };
      }

      this.mediaRecorder = new MediaRecorder(stream, options);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
          console.log('Recorded chunk:', event.data.size, 'bytes');
        }
      };

      this.mediaRecorder.onstop = () => {
        console.log('Recording stopped, chunks:', this.recordedChunks.length);
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        console.log('Final blob size:', blob.size, 'bytes');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dimensions-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      // Request data every second for better chunking
      this.mediaRecorder.start(1000);
      this.isRecording = true;
      this.recordBtn.classList.add('recording');

      // Start timer
      this.recordingStartTime = Date.now();
      this.recordingTimer.style.display = 'block';
      this.updateRecordingTimer();
      this.timerInterval = setInterval(() => this.updateRecordingTimer(), 100);

      this.updateStatus('Recording...', 'error');
      console.log('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      this.updateStatus('Recording failed: ' + error.message, 'error');
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      this.recordBtn.classList.remove('recording');

      // Stop timer
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      this.recordingTimer.style.display = 'none';

      this.updateStatus('Recording saved', 'active');
      console.log('Recording stopped');
    }
  }

  updateRecordingTimer() {
    const elapsed = Date.now() - this.recordingStartTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    this.timerDisplay.textContent =
      `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  downloadScreenshot() {
    try {
      // Create a temporary canvas to combine all layers
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = this.cellCanvas.width;
      tempCanvas.height = this.cellCanvas.height;
      const tempCtx = tempCanvas.getContext('2d');

      // Draw the cell canvas (which includes everything)
      tempCtx.drawImage(this.cellCanvas, 0, 0);

      // Convert to blob and download
      tempCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dimensions-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        this.updateStatus('Screenshot saved', 'active');
      });
    } catch (error) {
      console.error('Error downloading screenshot:', error);
      this.updateStatus('Download failed: ' + error.message, 'error');
    }
  }
}

// Initialize app
const app = new NumberTwinApp();
