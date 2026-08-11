/**
 * VisionGuard AI - Main Dashboard Controller
 */
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const visionCanvas = document.getElementById('visionCanvasOverlay');
  const cameraSelect = document.getElementById('cameraSourceSelect');
  const videoFileInput = document.getElementById('videoFileInput');
  
  const riskScoreVal = document.getElementById('riskScoreVal');
  const riskLevelText = document.getElementById('riskLevelText');
  const trackedObjCountVal = document.getElementById('trackedObjCountVal');
  const avgSpeedVal = document.getElementById('avgSpeedVal');
  const fpsVal = document.getElementById('fpsVal');
  
  const systemStatusBadge = document.getElementById('systemStatusBadge');
  const statusBadgeText = document.getElementById('statusBadgeText');
  const hudAlertBanner = document.getElementById('hudAlertBanner');
  const hudAlertText = document.getElementById('hudAlertText');
  
  const toggleAudioBtn = document.getElementById('toggleAudioBtn');
  const audioIcon = document.getElementById('audioIcon');
  const triggerSimulatedCrashBtn = document.getElementById('triggerSimulatedCrashBtn');
  const captureSnapshotBtn = document.getElementById('captureSnapshotBtn');
  const exportAuditLogBtn = document.getElementById('exportAuditLogBtn');
  
  const incidentLogList = document.getElementById('incidentLogList');
  const manualSosBtn = document.getElementById('manualSosBtn');
  const sosModal = document.getElementById('sosModal');
  const confirmSosBtn = document.getElementById('confirmSosBtn');
  const closeSosBtn = document.getElementById('closeSosBtn');

  // App State
  let audioEnabled = true;
  let audioCtx = null;
  let lastIncidentTime = 0;
  const incidentHistory = [];
  
  // Initialize Chart.js Risk Graph
  const chartCtx = document.getElementById('riskTelemetryChart').getContext('2d');
  const riskChart = new Chart(chartCtx, {
    type: 'line',
    data: {
      labels: Array(20).fill(''),
      datasets: [{
        label: 'Crash Risk Index (%)',
        data: Array(20).fill(12),
        borderColor: '#00f2fe',
        backgroundColor: 'rgba(0, 242, 254, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { display: false },
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });

  // Sound Alarm Synthesizer (Web Audio API)
  function playAlarmTone() {
    if (!audioEnabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3); // A4
      
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn('Audio Context sound play error:', e);
    }
  }

  // Initialize Web Vision Engine
  const visionEngine = new WebVisionEngine(visionCanvas, {
    onAccidentDetected: (incident) => {
      handleAccidentTrigger(incident);
    },
    onWarningDetected: (warning) => {
      handleWarningTrigger(warning);
    }
  });
  visionEngine.simulatedMode = true; // Default to procedural simulated traffic demo

  // Handle Accident Alert Event
  function handleAccidentTrigger(incident) {
    const now = Date.now();
    if (now - lastIncidentTime < 4000) return; // Cooldown 4s between alert logs
    lastIncidentTime = now;

    playAlarmTone();

    // Update Status Badge
    systemStatusBadge.classList.add('alert-active');
    statusBadgeText.innerText = 'ACCIDENT ALERT!';

    // Show HUD Banner
    hudAlertBanner.classList.add('visible');
    hudAlertText.innerText = `ACCIDENT DETECTED - ${incident.type.toUpperCase()}`;

    // Add to Incident Audit Log
    addIncidentToLog({
      type: 'CRITICAL',
      title: incident.type,
      time: new Date().toLocaleTimeString(),
      desc: `Detected at ${incident.location} | Severity Score: ${incident.severity}%`,
      severity: incident.severity
    });

    // Automatically trigger Emergency SOS modal if score > 85
    if (incident.severity > 85) {
      setTimeout(() => {
        openSosModal(incident);
      }, 1000);
    }
  }

  function handleWarningTrigger(warning) {
    riskScoreVal.style.color = 'var(--accent-yellow)';
    riskLevelText.innerText = 'ELEVATED RISK';
    riskLevelText.style.color = 'var(--accent-yellow)';
  }

  function addIncidentToLog(incident) {
    incidentHistory.unshift(incident);

    const item = document.createElement('div');
    item.className = `incident-item ${incident.type.toLowerCase()}`;
    item.innerHTML = `
      <div class="incident-item-header">
        <span>
          <i class="fa-solid ${incident.type === 'CRITICAL' ? 'fa-triangle-exclamation' : 'fa-circle-info'}" 
             style="color: ${incident.type === 'CRITICAL' ? 'var(--accent-red)' : 'var(--accent-yellow)'}"></i>
          ${incident.title}
        </span>
        <span class="incident-time">${incident.time}</span>
      </div>
      <div class="incident-desc">${incident.desc}</div>
    `;

    incidentLogList.insertBefore(item, incidentLogList.firstChild);

    // Limit log length
    if (incidentLogList.children.length > 20) {
      incidentLogList.removeChild(incidentLogList.lastChild);
    }
  }

  // Animation Loop (60 FPS Telemetry & Vision)
  let lastFrameTime = performance.now();
  function animationFrameLoop() {
    const now = performance.now();
    const fps = 1000 / Math.max(1, (now - lastFrameTime));
    lastFrameTime = now;
    fpsVal.innerText = fps.toFixed(1);

    // Process frame
    visionEngine.processVideoFrame(videoPlayer);

    // Update Telemetry metrics
    const currentRisk = visionEngine.currentRiskScore;
    riskScoreVal.innerText = `${currentRisk}%`;

    if (currentRisk > 75) {
      riskScoreVal.style.color = 'var(--accent-red)';
      riskLevelText.innerText = 'CRITICAL DANGER';
      riskLevelText.style.color = 'var(--accent-red)';
    } else if (currentRisk > 45) {
      riskScoreVal.style.color = 'var(--accent-yellow)';
      riskLevelText.innerText = 'MODERATE RISK';
      riskLevelText.style.color = 'var(--accent-yellow)';
    } else {
      riskScoreVal.style.color = 'var(--accent-green)';
      riskLevelText.innerText = 'LOW RISK';
      riskLevelText.style.color = 'var(--accent-green)';
    }

    trackedObjCountVal.innerText = visionEngine.proceduralVehicles.length;

    // Update Live Chart
    const chartData = riskChart.data.datasets[0].data;
    chartData.shift();
    chartData.push(currentRisk);
    
    if (currentRisk > 75) {
      riskChart.data.datasets[0].borderColor = '#ef4444';
      riskChart.data.datasets[0].backgroundColor = 'rgba(239, 68, 68, 0.2)';
    } else {
      riskChart.data.datasets[0].borderColor = '#00f2fe';
      riskChart.data.datasets[0].backgroundColor = 'rgba(0, 242, 254, 0.1)';
    }
    riskChart.update('none');

    requestAnimationFrame(animationFrameLoop);
  }

  // Start Animation Loop
  requestAnimationFrame(animationFrameLoop);

  // Camera Source Switcher
  cameraSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'custom_file') {
      videoFileInput.click();
    } else {
      visionEngine.simulatedMode = true;
      videoPlayer.style.display = 'none';
    }
  });

  // Custom Video File Upload
  videoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      videoPlayer.src = url;
      videoPlayer.style.display = 'block';
      videoPlayer.play();
      visionEngine.simulatedMode = false;
      addIncidentToLog({
        type: 'INFO',
        title: 'Custom Video Stream Loaded',
        time: new Date().toLocaleTimeString(),
        desc: `Processing video clip: ${file.name}`
      });
    }
  });

  // Buttons & Modals
  toggleAudioBtn.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    audioIcon.className = audioEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
    toggleAudioBtn.style.opacity = audioEnabled ? '1' : '0.6';
  });

  triggerSimulatedCrashBtn.addEventListener('click', () => {
    visionEngine.triggerSimulatedAccident();
    handleAccidentTrigger({
      type: 'SIMULATED TRAFFIC ACCIDENT',
      location: 'CAM-01 Main Lane',
      severity: 96
    });
  });

  captureSnapshotBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `VisionGuard_Snapshot_${Date.now()}.jpg`;
    link.href = visionCanvas.toDataURL('image/jpeg');
    link.click();
  });

  exportAuditLogBtn.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(incidentHistory, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Incident_Audit_Log_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  function openSosModal(incident) {
    sosModal.classList.add('active');
  }

  function closeSosModal() {
    sosModal.classList.remove('active');
    systemStatusBadge.classList.remove('alert-active');
    statusBadgeText.innerText = 'SYSTEM OPERATIONAL';
    hudAlertBanner.classList.remove('visible');
  }

  manualSosBtn.addEventListener('click', () => openSosModal({ severity: 99 }));
  closeSosBtn.addEventListener('click', closeSosModal);

  confirmSosBtn.addEventListener('click', () => {
    confirmSosBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Dispatching Units...';
    setTimeout(() => {
      alert('✅ Emergency Units (Police & Medical Dispatch) have been notified with GPS Coordinates & Incident Snapshot!');
      confirmSosBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Dispatch Emergency Response Units';
      closeSosModal();
    }, 1500);
  });
});
