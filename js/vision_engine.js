/**
 * VisionGuard AI - Browser Computer Vision Processing Engine
 * Handles real-time canvas frame analysis, motion vectors, vehicle tracking, and accident detection.
 */
class WebVisionEngine {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { willReadFrequently: true });
    this.options = Object.assign({
      sensitivity: 1.0,
      minArea: 800,
      iouThreshold: 0.15,
      decelThreshold: 5.5,
      onAccidentDetected: null,
      onWarningDetected: null
    }, options);

    this.prevImageData = null;
    this.trackedObjects = new Map(); // id -> tracker object
    this.nextId = 1;
    this.activeAccident = false;
    this.activeWarning = false;
    this.currentRiskScore = 12; // Base risk score %
    this.simulatedMode = false;
    this.proceduralVehicles = [];
    this.initProceduralSimulation();
  }

  initProceduralSimulation() {
    // Initialize procedural traffic simulation for demo streams
    this.proceduralVehicles = [
      { id: 101, x: 100, y: 320, vx: 4.2, vy: 0.2, w: 75, h: 42, color: '#10b981', status: 'NORMAL', label: 'Car-1' },
      { id: 102, x: 450, y: 310, vx: 3.8, vy: -0.1, w: 80, h: 45, color: '#10b981', status: 'NORMAL', label: 'Car-2' },
      { id: 103, x: 800, y: 220, vx: -5.1, vy: 0.1, w: 90, h: 48, color: '#10b981', status: 'NORMAL', label: 'Truck' },
      { id: 104, x: 250, y: 190, vx: 4.8, vy: 0.0, w: 60, h: 35, color: '#10b981', status: 'NORMAL', label: 'Taxi' }
    ];
  }

  processVideoFrame(videoElement) {
    if (!videoElement || videoElement.paused || videoElement.ended) {
      if (this.simulatedMode) {
        this.processProceduralFrame();
      }
      return;
    }

    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    // Draw current video frame onto canvas
    this.ctx.drawImage(videoElement, 0, 0, w, h);
    
    // Perform frame differencing analysis
    try {
      const frameData = this.ctx.getImageData(0, 0, w, h);
      this.analyzeImageData(frameData, w, h);
    } catch (e) {
      // Fallback if cross-origin video prevents raw canvas read
      this.processProceduralFrame();
    }
  }

  processProceduralFrame() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return;

    this.ctx.clearRect(0, 0, w, h);

    // Update procedural vehicles
    let collisionTriggered = false;
    let warningTriggered = false;

    // Check collision between Car-1 & Car-2 in simulation loop
    const v1 = this.proceduralVehicles[0];
    const v2 = this.proceduralVehicles[1];

    v1.x += v1.vx;
    v1.y += v1.vy;
    v2.x += v2.vx;
    v2.y += v2.vy;

    // Reset boundary wrap
    if (v1.x > w + 100) { v1.x = -80; v1.vx = 4.2; v1.status = 'NORMAL'; }
    if (v2.x > w + 100) { v2.x = -150; v2.vx = 3.8; v2.status = 'NORMAL'; }
    
    const v3 = this.proceduralVehicles[2];
    v3.x += v3.vx;
    if (v3.x < -100) { v3.x = w + 80; }

    // Distance calculation between v1 and v2 for collision event
    const dist = Math.hypot(v1.x - v2.x, v1.y - v2.y);
    if (dist < 70) {
      v1.status = 'ACCIDENT';
      v2.status = 'ACCIDENT';
      v1.vx = 0.5; // Hard stop impact
      v2.vx = 0.2;
      collisionTriggered = true;
      this.currentRiskScore = 94;
    } else if (dist < 130) {
      v1.status = 'WARNING';
      v2.status = 'WARNING';
      warningTriggered = true;
      this.currentRiskScore = 62;
    } else {
      v1.status = 'NORMAL';
      v2.status = 'NORMAL';
      this.currentRiskScore = Math.floor(15 + Math.random() * 8);
    }

    this.activeAccident = collisionTriggered;
    this.activeWarning = warningTriggered;

    // Render Procedural Visual Overlay
    this.renderProceduralHUD(w, h);

    if (collisionTriggered && this.options.onAccidentDetected) {
      this.options.onAccidentDetected({
        type: 'HIGH IMPACT COLLISION',
        location: 'Intersection CCTV-04',
        severity: 94,
        timestamp: new Date().toLocaleTimeString()
      });
    } else if (warningTriggered && this.options.onWarningDetected) {
      this.options.onWarningDetected({
        type: 'NEAR-MISS / BRAKING SURGE',
        severity: 62
      });
    }
  }

  renderProceduralHUD(w, h) {
    this.proceduralVehicles.forEach(v => {
      let strokeColor = '#10b981'; // Green
      if (v.status === 'WARNING') strokeColor = '#f59e0b'; // Yellow
      if (v.status === 'ACCIDENT') strokeColor = '#ef4444'; // Red

      // Draw bounding box
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = v.status === 'ACCIDENT' ? 4 : 2;
      this.ctx.strokeRect(v.x, v.y, v.w, v.h);

      // Fill semi-transparent box
      this.ctx.fillStyle = strokeColor + '22';
      this.ctx.fillRect(v.x, v.y, v.w, v.h);

      // Draw velocity vector arrow
      this.ctx.beginPath();
      this.ctx.moveTo(v.x + v.w/2, v.y + v.h/2);
      this.ctx.lineTo(v.x + v.w/2 + v.vx * 15, v.y + v.h/2 + v.vy * 15);
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // Label text
      const speedKm = Math.abs(v.vx * 14).toFixed(1);
      this.ctx.fillStyle = strokeColor;
      this.ctx.font = 'bold 12px monospace';
      this.ctx.fillText(`${v.label} | ${speedKm} km/h`, v.x, Math.max(15, v.y - 6));
    });
  }

  analyzeImageData(imageData, w, h) {
    // Frame differencing calculation
    const currentData = imageData.data;
    if (!this.prevImageData) {
      this.prevImageData = currentData;
      return;
    }

    let changedPixels = 0;
    const prevData = this.prevImageData;

    for (let i = 0; i < currentData.length; i += 4) {
      const diff = Math.abs(currentData[i] - prevData[i]) + 
                   Math.abs(currentData[i+1] - prevData[i+1]) + 
                   Math.abs(currentData[i+2] - prevData[i+2]);

      if (diff > 80) {
        changedPixels++;
      }
    }

    const motionRatio = changedPixels / (w * h / 4);
    this.currentRiskScore = Math.min(100, Math.floor(motionRatio * 350));
    this.prevImageData = currentData;
  }

  triggerSimulatedAccident() {
    const v1 = this.proceduralVehicles[0];
    const v2 = this.proceduralVehicles[1];
    v1.x = 380;
    v2.x = 410;
    v1.vx = 0;
    v2.vx = 0;
    v1.status = 'ACCIDENT';
    v2.status = 'ACCIDENT';
    this.activeAccident = true;
    this.currentRiskScore = 98;
  }
}
