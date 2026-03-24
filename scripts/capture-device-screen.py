import argparse
import pathlib
import shutil
import subprocess
import time

import cv2
import numpy as np


def run_adb(adb_path, serial, *args):
    command = [str(adb_path)]
    if serial:
        command.extend(["-s", serial])
    command.extend(args)
    return subprocess.run(command, capture_output=True, check=True)


def capture_frame(adb_path, serial):
    return run_adb(adb_path, serial, "exec-out", "screencap", "-p").stdout


def main():
    parser = argparse.ArgumentParser(description="Capture Android screen frames over adb.")
    parser.add_argument("--adb", required=True, help="Path to adb executable.")
    parser.add_argument("--serial", default="", help="Device serial.")
    parser.add_argument("--duration", type=float, default=30.0, help="Capture duration in seconds.")
    parser.add_argument("--fps", type=float, default=4.0, help="Capture frames per second.")
    parser.add_argument("--output", required=True, help="Output mp4 path.")
    parser.add_argument("--frames-dir", required=True, help="Directory for raw frames.")
    args = parser.parse_args()

    adb_path = pathlib.Path(args.adb)
    output_path = pathlib.Path(args.output)
    frames_dir = pathlib.Path(args.frames_dir)

    if frames_dir.exists():
        shutil.rmtree(frames_dir)
    frames_dir.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    frame_interval = 1.0 / max(args.fps, 0.1)
    started_at = time.time()
    next_frame_at = started_at
    frame_index = 0
    frames = []

    while True:
        now = time.time()
        elapsed = now - started_at
        if elapsed >= max(args.duration, 0.1):
            break
        if now < next_frame_at:
            time.sleep(min(0.03, next_frame_at - now))
            continue

        frame_bytes = capture_frame(adb_path, args.serial)
        frame_path = frames_dir / f"{frame_index:04d}.png"
        frame_path.write_bytes(frame_bytes)

        frame = cv2.imdecode(np.frombuffer(frame_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is not None:
            frames.append(frame)

        frame_index += 1
        next_frame_at += frame_interval

    if not frames:
        raise SystemExit("No frames captured.")

    height, width = frames[0].shape[:2]
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        max(args.fps, 0.1),
        (width, height),
    )
    for frame in frames:
        writer.write(frame)
    writer.release()

    print(f"frames={len(frames)}")
    print(f"output={output_path}")


if __name__ == "__main__":
    main()
