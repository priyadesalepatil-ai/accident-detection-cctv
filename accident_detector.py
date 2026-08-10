import cv2
import numpy as np
import time
import os
import argparse
from datetime import datetime

class VehicleTracker:
    def __init__(self, obj_id, bbox, centroid):
        self.id = obj_id
        self.bbox = bbox  # (x, y, w, h)
        self.history = [centroid]  # (cx, cy)
        self.velocities = []  # speed magnitudes
        self.vectors = []  # (dx, dy)
        self.last_seen = time.time()
        self.status = "NORMAL"  # "NORMAL", "WARNING", "ACCIDENT"
        self.anomaly_type = None

    def update(self, bbox, centroid):
        self.bbox = bbox
        prev_cx, prev_cy = self.history[-1]
        cx, cy = centroid
        
        dx = cx - prev_cx
        dy = cy - prev_cy
        speed = np.sqrt(dx**2 + dy**2)
        
        self.history.append(centroid)
        if len(self.history) > 30:
            self.history.pop(0)
            
        self.velocities.append(speed)
        if len(self.velocities) > 10:
            self.velocities.pop(0)
            
        self.vectors.append((dx, dy))
        if len(self.vectors) > 10:
            self.vectors.pop(0)
            
        self.last_seen = time.time()

class AccidentDetector:
    def __init__(self, video_source=0, sensitivity=1.0, save_snapshots=True):
        self.video_source = video_source
        self.sensitivity = sensitivity
        self.save_snapshots = save_snapshots
        self.output_dir = "detected_incidents"
        if self.save_snapshots and not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

        # Background subtractor
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50, detectShadows=True)
        
        self.trackers = {}
        self.next_obj_id = 1
        self.incidents_log = []
        self.alert_active = False
        self.last_alert_time = 0

    def calculate_iou(self, boxA, boxB):
        # box: (x, y, w, h) -> (x1, y1, x2, y2)
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[0] + boxA[2], boxB[0] + boxB[2])
        yB = min(boxA[1] + boxA[3], boxB[1] + boxB[3])

        interArea = max(0, xB - xA) * max(0, yB - yA)
        boxAArea = boxA[2] * boxA[3]
        boxBArea = boxB[2] * boxB[3]

        iou = interArea / float(boxAArea + boxBArea - interArea + 1e-5)
        return iou

    def run(self):
        cap = cv2.VideoCapture(self.video_source)
        if not cap.isOpened():
            print(f"[ERROR] Could not open video source: {self.video_source}")
            return

        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
        fps = cap.get(cv2.CAP_PROP_FPS) or 30

        print(f"[INFO] Initialized CCTV Vision Processor ({frame_width}x{frame_height} @ {fps:.1f} FPS)")
        print("[INFO] Press 'q' to exit, 's' to save manual snapshot, 'r' to reset alert state.")

        prev_time = time.time()

        while True:
            ret, frame = cap.read()
            if not ret:
                print("[INFO] End of video stream or feed interrupted.")
                break

            display_frame = frame.copy()
            overlay = frame.copy()

            # Preprocessing
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)

            # Motion mask
            fg_mask = self.bg_subtractor.apply(blurred)
            _, thresh = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            dilated = cv2.dilate(thresh, kernel, iterations=2)

            # Find vehicle contours
            contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            current_detections = []

            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area > 1200:  # Filter out small noise
                    x, y, w, h = cv2.boundingRect(cnt)
                    cx, cy = x + w // 2, y + h // 2
                    current_detections.append(((x, y, w, h), (cx, cy)))

            # Associate detections with existing tracked objects
            updated_ids = set()
            for bbox, centroid in current_detections:
                matched_id = None
                min_dist = float('inf')

                for obj_id, tracker in self.trackers.items():
                    if obj_id in updated_ids:
                        continue
                    last_cx, last_cy = tracker.history[-1]
                    dist = np.sqrt((centroid[0] - last_cx)**2 + (centroid[1] - last_cy)**2)
                    if dist < 80 and dist < min_dist:
                        min_dist = dist
                        matched_id = obj_id

                if matched_id is not None:
                    self.trackers[matched_id].update(bbox, centroid)
                    updated_ids.add(matched_id)
                else:
                    new_tracker = VehicleTracker(self.next_obj_id, bbox, centroid)
                    self.trackers[self.next_obj_id] = new_tracker
                    updated_ids.add(self.next_obj_id)
                    self.next_obj_id += 1

            # Remove stale trackers
            current_time = time.time()
            stale_ids = [obj_id for obj_id, t in self.trackers.items() if current_time - t.last_seen > 1.5]
            for obj_id in stale_ids:
                del self.trackers[obj_id]

            # Detect Accidents & Dangerous Trajectories
            active_accident = False
            active_warning = False

            tracker_items = list(self.trackers.values())
            for i in range(len(tracker_items)):
                t1 = tracker_items[i]
                t1.status = "NORMAL"

                # Check sudden deceleration / impact stop spike
                if len(t1.velocities) >= 4:
                    recent_avg_speed = np.mean(t1.velocities[-4:-1])
                    current_speed = t1.velocities[-1]
                    speed_drop = recent_avg_speed - current_speed

                    if recent_avg_speed > 8.0 and speed_drop > 6.5 * self.sensitivity:
                        t1.status = "ACCIDENT"
                        t1.anomaly_type = "SUDDEN IMPACT / HARD BRAKING"
                        active_accident = True

                # Check pairwise collision / IoU intersection
                for j in range(i + 1, len(tracker_items)):
                    t2 = tracker_items[j]
                    iou = self.calculate_iou(t1.bbox, t2.bbox)

                    if iou > 0.15:  # Bounding box overlap threshold
                        # Calculate relative speed between overlapping objects
                        if len(t1.velocities) > 0 and len(t2.velocities) > 0:
                            v1 = t1.velocities[-1]
                            v2 = t2.velocities[-1]

                            if v1 > 3.0 or v2 > 3.0:
                                t1.status = "ACCIDENT"
                                t2.status = "ACCIDENT"
                                t1.anomaly_type = "VEHICLE COLLISION DETECTED"
                                t2.anomaly_type = "VEHICLE COLLISION DETECTED"
                                active_accident = True
                            elif iou > 0.3:
                                t1.status = "WARNING"
                                t2.status = "WARNING"
                                active_warning = True

            # Draw HUD Overlays & Bounding Boxes
            for tracker in self.trackers.values():
                x, y, w, h = tracker.bbox
                cx, cy = tracker.history[-1]

                # Bounding Box Color
                if tracker.status == "ACCIDENT":
                    color = (0, 0, 255)  # Bright Red
                    box_thick = 3
                elif tracker.status == "WARNING":
                    color = (0, 255, 255)  # Yellow
                    box_thick = 2
                else:
                    color = (0, 255, 0)  # Green
                    box_thick = 2

                # Bounding Box Corner Reticles
                cv2.rectangle(display_frame, (x, y), (x + w, y + h), color, box_thick)
                
                # Trajectory Line
                if len(tracker.history) > 1:
                    pts = np.array(tracker.history, np.int32).reshape((-1, 1, 2))
                    cv2.polylines(display_frame, [pts], False, color, 2)

                # Velocity Vector Arrow
                if len(tracker.vectors) > 0:
                    dx, dy = tracker.vectors[-1]
                    cv2.arrowedLine(display_frame, (cx, cy), (int(cx + dx * 3), int(cy + dy * 3)), (255, 255, 255), 2, tipLength=0.3)

                # Object ID Tag
                speed_text = f"ID:{tracker.id} | {tracker.velocities[-1]*3.6:.1f} km/h" if tracker.velocities else f"ID:{tracker.id}"
                cv2.putText(display_frame, speed_text, (x, max(15, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

            # Alert Banner & Sound / Snapshot Trigger
            if active_accident:
                self.alert_active = True
                self.last_alert_time = current_time

                # Red Flash Overlay
                cv2.rectangle(overlay, (0, 0), (frame_width, frame_height), (0, 0, 255), -1)
                cv2.addWeighted(overlay, 0.25, display_frame, 0.75, 0, display_frame)

                # Alert Text Banner
                cv2.rectangle(display_frame, (0, 0), (frame_width, 60), (0, 0, 180), -1)
                cv2.putText(display_frame, "[ALERT] ACCIDENT / HIGH RISK COLLISION DETECTED!", (30, 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 3)

                # Auto Snapshot
                if self.save_snapshots and (current_time - self.last_alert_time < 0.5):
                    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
                    snap_path = os.path.join(self.output_dir, f"accident_snapshot_{timestamp_str}.jpg")
                    cv2.imwrite(snap_path, display_frame)
                    print(f"[ACCIDENT SAVED] Captured alert frame: {snap_path}")

            elif active_warning:
                # Yellow Banner
                cv2.rectangle(display_frame, (0, 0), (frame_width, 45), (0, 180, 220), -1)
                cv2.putText(display_frame, "[WARNING] NEAR-MISS / TRAJECTORY OVERLAP RISK", (30, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 0), 2)

            # Top Info HUD Panel
            curr_fps = 1.0 / max(0.001, (time.time() - prev_time))
            prev_time = time.time()

            hud_str = f"FPS: {curr_fps:.1f} | Active Vehicles: {len(self.trackers)} | Status: {'CRITICAL ALERT' if active_accident else 'MONITORING'}"
            cv2.putText(display_frame, hud_str, (20, frame_height - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

            # Display Output Window
            cv2.imshow("VisionGuard AI - CCTV Traffic Accident Detector", display_frame)

            # Keybindings
            key = cv2.waitKey(max(1, int(1000 / fps))) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('s'):
                snap_path = os.path.join(self.output_dir, f"manual_snap_{int(time.time())}.jpg")
                cv2.imwrite(snap_path, display_frame)
                print(f"[MANUAL SNAPSHOT] Saved to {snap_path}")
            elif key == ord('r'):
                self.alert_active = False

        cap.release()
        cv2.destroyAllWindows()
        print("[INFO] VisionGuard AI shutdown cleanly.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VisionGuard AI - CCTV Accident Detection System")
    parser.add_argument("--source", type=str, default="0", help="Video source (0 for webcam or path to .mp4 video)")
    parser.add_argument("--sensitivity", type=float, default=1.0, help="Detection sensitivity multiplier (0.5 to 2.0)")
    args = parser.parse_args()

    # Convert numeric camera string to int if applicable
    video_src = int(args.source) if args.source.isdigit() else args.source

    detector = AccidentDetector(video_source=video_src, sensitivity=args.sensitivity)
    detector.run()
