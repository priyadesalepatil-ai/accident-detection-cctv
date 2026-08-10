# VisionGuard AI - CCTV Traffic Accident & Dangerous Event Detection System

VisionGuard AI is a high-performance computer vision and analytics system built to analyze video and CCTV feeds in real-time, automatically detecting traffic accidents, near-miss collisions, hard braking, wrong-way driving, and hazardous road anomalies.

---

## 🌟 Key Features

1. **Real-Time Web Command Center UI**
   - **Canvas Computer Vision Engine**: Frame differencing, vehicle tracking, velocity vector arrows, and trajectory overlap analysis.
   - **Multi-Camera Grid & Custom Video Support**: Test built-in AI simulations or upload any `.mp4`/`.webm` video file.
   - **Live Crash Risk Index Chart**: Dynamic Telemetry graph powered by Chart.js.
   - **Audio & Visual Alarm System**: Web Audio API synthesizer siren for high-impact alerts.
   - **Emergency SOS Dispatch**: One-click simulated emergency service alert with GPS & snapshot export.
   - **Audit Log Export**: Export filterable incident history logs in JSON format.

2. **Standalone Python OpenCV Pipeline (`accident_detector.py`)**
   - Background subtraction (`MOG2`) and contour tracking.
   - Optical speed magnitude & directional velocity vectors.
   - Sudden deceleration surge and Intersection-over-Union (IoU) vehicle collision detection.
   - Auto-captures high-res JPEG alert snapshots to `detected_incidents/`.

---

## 🚀 How to Run the Web Application

Simply launch an HTTP server or open `index.html` directly in your browser:

### Option 1: Using Python HTTP Server
```bash
cd C:\Users\PRIYA\.gemini\antigravity\scratch\accident-detection-system
python -m http.server 8000
```
Then open `http://localhost:8000` in your web browser!

---

## 🐍 How to Run the Python OpenCV Detector

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Python Detection Script
- **Webcam feed**:
  ```bash
  python accident_detector.py --source 0
  ```
- **Local Video File**:
  ```bash
  python accident_detector.py --source path/to/traffic_video.mp4
  ```

### Controls in Python Window:
- `q`: Quit application cleanly
- `s`: Save manual snapshot frame
- `r`: Reset active alert state

---

## 📁 File Structure

```
accident-detection-system/
├── index.html              # Main Command Center UI Dashboard
├── css/
│   └── style.css           # Glassmorphism cyber dark theme stylesheet
├── js/
│   ├── vision_engine.js    # Canvas computer vision frame analyzer & vehicle tracker
│   └── app.js              # Application controller, audio synthesizer & telemetry chart
├── accident_detector.py    # Python OpenCV & NumPy video processing engine
├── requirements.txt        # Python package dependencies
└── README.md               # User guide & documentation
```
