#!/usr/bin/env python3

import asyncio
import json
import cv2
import mediapipe as mp
import numpy as np
from typing import Dict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import signal
import sys
from contextlib import asynccontextmanager
from datetime import datetime
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VisionProcessor:
    """Simplified vision processor for face and hand detection"""
    
    def __init__(self):
        # Initialize MediaPipe
        self.mp_face_detection = mp.solutions.face_detection
        self.mp_hands = mp.solutions.hands
        
        # Face detection
        self.face_detection = self.mp_face_detection.FaceDetection(
            model_selection=1,
            min_detection_confidence=0.5
        )
        
        # Hand tracking with better settings
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            model_complexity=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7
        )
        
        # Camera
        self.cap = None
        self.camera_available = False
        
        # State tracking
        self.last_face_detected = False
        self.last_finger_count = 0
        self.finger_history = []
        self.history_size = 5
        
    def initialize_camera(self) -> bool:
        """Try to initialize camera"""
        try:
            # Try multiple camera indices
            for i in range(3):
                self.cap = cv2.VideoCapture(i)
                if self.cap.isOpened():
                    ret, frame = self.cap.read()
                    if ret and frame is not None:
                        self.camera_available = True
                        logger.info(f"Camera initialized at index {i}")
                        return True
                    self.cap.release()
            
            logger.warning("No camera available")
            return False
        except Exception as e:
            logger.error(f"Camera initialization error: {e}")
            return False
    
    def process_frame(self) -> Dict:
        """Process a single frame and return vision data"""
        result = {
            'faceDetected': False,
            'fingerCount': 0,
            'handsDetected': 0,
            'gesture': None,
            'timestamp': datetime.now().isoformat()
        }
        
        if not self.camera_available or not self.cap:
            return result
        
        try:
            ret, frame = self.cap.read()
            if not ret or frame is None:
                return result
            
            # Flip frame for mirror effect
            frame = cv2.flip(frame, 1)
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Face detection
            face_results = self.face_detection.process(image_rgb)
            if face_results.detections:
                result['faceDetected'] = True
                self.last_face_detected = True
            else:
                self.last_face_detected = False
            
            # Hand tracking
            hand_results = self.hands.process(image_rgb)
            if hand_results.multi_hand_landmarks:
                result['handsDetected'] = len(hand_results.multi_hand_landmarks)
                
                total_fingers = 0
                for hand_landmarks in hand_results.multi_hand_landmarks:
                    fingers = self._count_fingers(hand_landmarks.landmark, image_rgb.shape)
                    total_fingers += fingers
                
                # Stabilize finger count
                self.finger_history.append(total_fingers)
                if len(self.finger_history) > self.history_size:
                    self.finger_history.pop(0)
                
                # Use most common recent count
                if self.finger_history:
                    result['fingerCount'] = max(set(self.finger_history), 
                                               key=self.finger_history.count)
                else:
                    result['fingerCount'] = total_fingers
                
                # Simple gesture detection
                if result['fingerCount'] == 0:
                    result['gesture'] = 'fist'
                elif result['fingerCount'] == 1:
                    result['gesture'] = 'pointing'
                elif result['fingerCount'] == 2:
                    result['gesture'] = 'peace'
                elif result['fingerCount'] == 5:
                    result['gesture'] = 'open'
                
                self.last_finger_count = result['fingerCount']
            
        except Exception as e:
            logger.error(f"Frame processing error: {e}")
        
        return result
    
    def _count_fingers(self, landmarks, shape) -> int:
        """Count raised fingers from hand landmarks"""
        h, w, _ = shape
        fingers_up = 0
        
        # Convert normalized coordinates to pixel coordinates
        coords = []
        for lm in landmarks:
            coords.append([lm.x * w, lm.y * h])
        
        # Thumb (special case - check x coordinate)
        if coords[4][0] > coords[3][0]:  # Right hand
            if coords[4][0] > coords[3][0] + 20:
                fingers_up += 1
        else:  # Left hand
            if coords[4][0] < coords[3][0] - 20:
                fingers_up += 1
        
        # Four fingers (check y coordinate)
        tip_indices = [8, 12, 16, 20]
        pip_indices = [6, 10, 14, 18]
        
        for tip, pip in zip(tip_indices, pip_indices):
            if coords[tip][1] < coords[pip][1] - 10:
                fingers_up += 1
        
        return fingers_up
    
    def cleanup(self):
        """Clean up resources"""
        if self.cap:
            self.cap.release()
        cv2.destroyAllWindows()


# Global processor instance
processor = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    global processor
    processor = VisionProcessor()
    processor.initialize_camera()
    yield
    if processor:
        processor.cleanup()


# Create FastAPI app
app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "Pocket Soul Vision Service",
        "camera_available": processor.camera_available if processor else False
    }


@app.get("/vision/status")
async def vision_status():
    """Get current vision status"""
    if not processor:
        return {"error": "Vision processor not initialized"}
    
    return {
        "camera_available": processor.camera_available,
        "last_face_detected": processor.last_face_detected,
        "last_finger_count": processor.last_finger_count
    }


@app.websocket("/vision/stream")
async def vision_stream(websocket: WebSocket):
    """WebSocket endpoint for streaming vision data"""
    await websocket.accept()
    logger.info("Vision stream client connected")
    
    if not processor or not processor.camera_available:
        await websocket.send_json({
            "error": "Camera not available",
            "faceDetected": False,
            "fingerCount": 0
        })
    
    try:
        while True:
            # Process frame and send data
            vision_data = processor.process_frame()
            await websocket.send_json(vision_data)
            
            # Small delay to control frame rate (15 FPS)
            await asyncio.sleep(0.067)
            
    except WebSocketDisconnect:
        logger.info("Vision stream client disconnected")
    except Exception as e:
        logger.error(f"Vision stream error: {e}")
        try:
            await websocket.close()
        except:
            pass


def signal_handler(sig, frame):
    """Handle shutdown signals"""
    logger.info("Shutting down vision service...")
    if processor:
        processor.cleanup()
    sys.exit(0)


if __name__ == "__main__":
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Run the service
    logger.info("Starting Pocket Soul Vision Service on port 8001")
    uvicorn.run(app, host="0.0.0.0", port=8001)