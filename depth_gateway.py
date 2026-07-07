import sys
import time
import json
import numpy as np
import asyncio
import threading
import websockets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pyorbbecsdk import Pipeline, Config, OBSensorType

# ==================== 1. 深度抗干扰超参数 ====================
MIN_DIST = 120.0
MAX_DIST = 850.0
MAX_FRAME_JUMP = 260.0
FILTER_ALPHA = 0.7
ROI_HALF_WIDTH = 80
ROI_HALF_HEIGHT = 60

last_valid_distance = 450.0
smoothed_distance = 450.0
current_global_data = {"raw": 450.0, "smoothed": 450.0, "angle": 0, "control_distance": 450.0}

# 相机运行状态控制量
CAMERA_RUNNING = False
pipeline = None
config = None
CONNECTED_WEBSOCKETS = set()
frame_count = 0
depth_frame_count = 0
valid_pixel_count = 0
full_valid_pixel_count = 0
wide_valid_pixel_count = 0
last_center_distance = 0.0
last_depth_min = 0.0
last_depth_max = 0.0
last_raw_dtype = ""
last_raw_shape = ""
last_raw_min = 0.0
last_raw_max = 0.0
last_raw_nonzero_count = 0
last_depth_scale = 0.0
last_frame_size = ""
last_update_time = 0.0
last_error = ""

def depth_snapshot():
    return {
        "type": "depth_gateway_data",
        "raw": round(current_global_data["raw"], 1),
        "smoothed": round(current_global_data["smoothed"], 1),
        "control_distance": round(current_global_data["control_distance"], 1),
        "angle": current_global_data["angle"],
        "camera_active": CAMERA_RUNNING,
        "frame_count": frame_count,
        "depth_frame_count": depth_frame_count,
        "valid_pixel_count": valid_pixel_count,
        "full_valid_pixel_count": full_valid_pixel_count,
        "wide_valid_pixel_count": wide_valid_pixel_count,
        "center": round(last_center_distance, 1),
        "depth_min": round(last_depth_min, 1),
        "depth_max": round(last_depth_max, 1),
        "raw_dtype": last_raw_dtype,
        "raw_shape": last_raw_shape,
        "raw_min": round(last_raw_min, 1),
        "raw_max": round(last_raw_max, 1),
        "raw_nonzero_count": last_raw_nonzero_count,
        "scale": last_depth_scale,
        "frame_size": last_frame_size,
        "last_update_age": round(time.time() - last_update_time, 2) if last_update_time else None,
        "last_error": last_error,
    }

def process_and_filter_distance(raw_dist):
    global last_valid_distance, smoothed_distance, current_global_data
    if raw_dist <= 50.0 or raw_dist > 1500.0:
        raw_dist = smoothed_distance

    diff = raw_dist - last_valid_distance
    if abs(diff) > MAX_FRAME_JUMP:
        usable_dist = last_valid_distance + (MAX_FRAME_JUMP if diff > 0 else -MAX_FRAME_JUMP)
        last_valid_distance = usable_dist
    else:
        usable_dist = raw_dist
        last_valid_distance = raw_dist

    smoothed_distance = (FILTER_ALPHA * usable_dist) + ((1.0 - FILTER_ALPHA) * smoothed_distance)
    
    clipped = max(MIN_DIST, min(MAX_DIST, smoothed_distance))
    ratio = (clipped - MIN_DIST) / (MAX_DIST - MIN_DIST)
    # 离镜头越近（Distance越小），比例越小，180 - 0 = 180 (握拳)
    # 离镜头越远（Distance越大），比例越大，180 - 180 = 0 (张开)
    target_angle = int(180 - (ratio * 180))
    
    current_global_data = {
        "raw": float(raw_dist),
        "smoothed": float(smoothed_distance),
        "control_distance": float(clipped),
        "angle": target_angle
    }

# ==================== 2. 相机流线程控制 ====================
def camera_stream_worker():
    global CAMERA_RUNNING, pipeline, config
    global frame_count, depth_frame_count, valid_pixel_count, last_center_distance
    global full_valid_pixel_count, wide_valid_pixel_count, last_depth_min, last_depth_max
    global last_raw_dtype, last_raw_shape, last_raw_min, last_raw_max, last_raw_nonzero_count
    global last_depth_scale, last_frame_size, last_update_time, last_error
    pipeline = Pipeline()
    config = Config()
    try:
        profile_list = pipeline.get_stream_profile_list(OBSensorType.DEPTH_SENSOR)
        depth_profile = profile_list.get_default_video_stream_profile()
        print("Depth profile:", depth_profile)
        config.enable_stream(depth_profile)
        pipeline.start(config)
        print("🟢 Orbbec Depth Camera Stream Started.")
        CAMERA_RUNNING = True
        last_error = ""
    except Exception as e:
        last_error = f"Camera setup failed: {e}"
        print(f"❌ {last_error}")
        CAMERA_RUNNING = False
        return

    try:
        while CAMERA_RUNNING:
            frames = pipeline.wait_for_frames(100)
            frame_count += 1
            if frames is None:
                last_error = "wait_for_frames returned None"
                continue
            depth_frame = frames.get_depth_frame()
            if depth_frame is None:
                last_error = "frames.get_depth_frame returned None"
                continue
            depth_frame_count += 1
                
            width, height = depth_frame.get_width(), depth_frame.get_height()
            cx, cy = width // 2, height // 2
            last_frame_size = f"{width}x{height}"
            last_depth_scale = float(depth_frame.get_depth_scale())
            
            raw_buffer = depth_frame.get_data()
            expected_size = width * height
            if isinstance(raw_buffer, np.ndarray):
                raw_array = np.ascontiguousarray(raw_buffer)
                last_raw_dtype = str(raw_array.dtype)
                last_raw_shape = str(raw_array.shape)
                last_raw_min = float(np.min(raw_array)) if raw_array.size else 0.0
                last_raw_max = float(np.max(raw_array)) if raw_array.size else 0.0
                last_raw_nonzero_count = int(np.count_nonzero(raw_array))
                if raw_array.dtype == np.uint16 and raw_array.size == expected_size:
                    depth_array = raw_array.reshape(-1)
                else:
                    depth_array = np.frombuffer(raw_array.tobytes(), dtype=np.uint16)
            else:
                last_raw_dtype = type(raw_buffer).__name__
                last_raw_shape = ""
                depth_array = np.frombuffer(raw_buffer, dtype=np.uint16)

            if depth_array.size != expected_size:
                last_error = f"depth buffer size {depth_array.size}, expected {expected_size}"
                continue

            depth_matrix = depth_array.reshape((height, width)).astype(np.float32) * last_depth_scale
            wide_valid_pixels = depth_matrix[(depth_matrix > 20.0) & (depth_matrix < 10000.0)]
            wide_valid_pixel_count = int(len(wide_valid_pixels))
            full_valid_pixels = depth_matrix[(depth_matrix > MIN_DIST) & (depth_matrix < 1500.0)]
            full_valid_pixel_count = int(len(full_valid_pixels))
            if wide_valid_pixel_count > 0:
                last_depth_min = float(np.min(wide_valid_pixels))
                last_depth_max = float(np.max(wide_valid_pixels))

            x0 = max(0, cx - ROI_HALF_WIDTH)
            x1 = min(width, cx + ROI_HALF_WIDTH)
            y0 = max(0, cy - ROI_HALF_HEIGHT)
            y1 = min(height, cy + ROI_HALF_HEIGHT)
            center_roi = depth_matrix[y0:y1, x0:x1]
            valid_pixels = center_roi[(center_roi > MIN_DIST) & (center_roi < 1500.0)]
            valid_pixel_count = int(len(valid_pixels))
            last_center_distance = float(depth_matrix[cy, cx])
            if len(valid_pixels) == 0 and len(full_valid_pixels) > 0:
                valid_pixels = full_valid_pixels
                valid_pixel_count = int(len(valid_pixels))
            elif len(valid_pixels) == 0 and len(wide_valid_pixels) > 0:
                valid_pixels = wide_valid_pixels
                valid_pixel_count = int(len(valid_pixels))
            
            if len(valid_pixels) > 0:
                nearest_group = valid_pixels[valid_pixels <= np.percentile(valid_pixels, 25)]
                raw_mean_distance = np.median(nearest_group if len(nearest_group) > 0 else valid_pixels)
                process_and_filter_distance(raw_mean_distance)
                last_update_time = time.time()
                last_error = "" if last_center_distance > 0 else "center pixel invalid; using fallback valid depth"
            else:
                last_error = "no valid depth pixels in 20-10000mm"
            time.sleep(0.04)
    except Exception as e:
        last_error = f"Stream error: {e}"
        print(last_error)
    finally:
        CAMERA_RUNNING = False
        try:
            pipeline.stop()
        except:
            pass
        print("🛑 Orbbec Depth Camera Stream Stopped.")

def start_camera_pipeline():
    global CAMERA_RUNNING
    if CAMERA_RUNNING: return
    t = threading.Thread(target=camera_stream_worker, daemon=True)
    t.start()

def stop_camera_pipeline():
    global CAMERA_RUNNING
    CAMERA_RUNNING = False

# ==================== 3. 异步及网络逻辑 ====================
async def register(websocket, path=None):
    CONNECTED_WEBSOCKETS.add(websocket)
    try:
        async for message in websocket: pass
    except websockets.exceptions.ConnectionClosed: pass
    finally: CONNECTED_WEBSOCKETS.remove(websocket)

async def broadcast_data():
    while True:
        if CONNECTED_WEBSOCKETS and CAMERA_RUNNING:
            message = json.dumps(depth_snapshot())
            await asyncio.gather(*[ws.send(message) for ws in CONNECTED_WEBSOCKETS], return_exceptions=True)
        await asyncio.sleep(0.04)

async def websocket_main():
    async with websockets.serve(register, "localhost", 8765):
        await broadcast_data()

class DepthGatewayHttpHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self): self._send_json(200, {"ok": True})
    def do_GET(self):
        if self.path == "/data": self._send_json(200, depth_snapshot())
        else: self._send_json(200, {"ok": True, "camera_active": CAMERA_RUNNING})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send_json(400, {"ok": False, "error": "invalid json"})
            return
        if self.path == "/mode":
            mode = payload.get("mode", "none")
            if mode == "depth":
                start_camera_pipeline()
            else:
                stop_camera_pipeline()
            self._send_json(200, {"ok": True, "camera_active": CAMERA_RUNNING})
        else:
            self._send_json(404, {"ok": False, "error": "unknown endpoint"})

def main():
    threading.Thread(target=lambda: asyncio.run(websocket_main()), daemon=True).start()
    print("🚀 WebSocket Data Broadcast Server running at ws://localhost:8765")
    server = ThreadingHTTPServer(("localhost", 8766), DepthGatewayHttpHandler)
    print("🚀 HTTP API Control Server running at http://localhost:8766")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        stop_camera_pipeline()

if __name__ == "__main__":
    main()
