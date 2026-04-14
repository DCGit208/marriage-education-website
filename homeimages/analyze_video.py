#!/usr/bin/env python3
"""
Video Analysis Tool - Detect scenes, transitions, and timing
Analyzes Home video.mov to document animation specifications
"""

import cv2
import numpy as np
import json
from pathlib import Path

def analyze_video(video_path):
    """Analyze video for scene changes and timing"""
    
    cap = cv2.VideoCapture(str(video_path))
    
    if not cap.isOpened():
        print("Error: Cannot open video file")
        return None
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps
    
    print(f"Video Analysis")
    print(f"=" * 50)
    print(f"FPS: {fps:.2f}")
    print(f"Total Frames: {total_frames}")
    print(f"Duration: {duration:.2f}s")
    print(f"Resolution: {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")
    print(f"=" * 50)
    print()
    
    scenes = []
    prev_frame = None
    frame_num = 0
    scene_start = 0
    threshold = 30  # Scene change threshold (0-100)
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Convert to grayscale for comparison
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        if prev_frame is not None:
            # Calculate frame difference
            diff = cv2.absdiff(prev_frame, gray)
            mean_diff = np.mean(diff)
            
            # Detect scene change
            if mean_diff > threshold:
                timestamp = frame_num / fps
                scene_duration = (frame_num - scene_start) / fps
                
                scenes.append({
                    'scene_num': len(scenes) + 1,
                    'start_frame': scene_start,
                    'end_frame': frame_num - 1,
                    'start_time': scene_start / fps,
                    'end_time': timestamp,
                    'duration': scene_duration,
                    'transition_intensity': float(mean_diff)
                })
                
                print(f"Scene {len(scenes)}: {scene_start/fps:.2f}s - {timestamp:.2f}s ({scene_duration:.2f}s)")
                
                scene_start = frame_num
        
        prev_frame = gray
        frame_num += 1
        
        # Progress indicator
        if frame_num % 100 == 0:
            progress = (frame_num / total_frames) * 100
            print(f"Progress: {progress:.1f}%", end='\r')
    
    # Add final scene
    if scene_start < frame_num:
        timestamp = frame_num / fps
        scene_duration = (frame_num - scene_start) / fps
        scenes.append({
            'scene_num': len(scenes) + 1,
            'start_frame': scene_start,
            'end_frame': frame_num - 1,
            'start_time': scene_start / fps,
            'end_time': timestamp,
            'duration': scene_duration,
            'transition_intensity': 0
        })
        print(f"Scene {len(scenes)}: {scene_start/fps:.2f}s - {timestamp:.2f}s ({scene_duration:.2f}s)")
    
    cap.release()
    
    # Analysis summary
    print()
    print("=" * 50)
    print(f"DETECTED {len(scenes)} SCENES")
    print("=" * 50)
    
    for scene in scenes:
        print(f"\nScene {scene['scene_num']}:")
        print(f"  Time: {scene['start_time']:.2f}s - {scene['end_time']:.2f}s")
        print(f"  Duration: {scene['duration']:.2f}s")
        print(f"  Frames: {scene['start_frame']} - {scene['end_frame']}")
    
    # Save results
    output_file = Path(video_path).parent / 'video_analysis.json'
    with open(output_file, 'w') as f:
        json.dump({
            'video_info': {
                'fps': fps,
                'total_frames': total_frames,
                'duration': duration
            },
            'scenes': scenes
        }, f, indent=2)
    
    print(f"\n✓ Analysis saved to: {output_file}")
    
    return scenes

if __name__ == '__main__':
    video_path = Path(__file__).parent / 'Home video.mov'
    analyze_video(video_path)
