#!/usr/bin/env python3
"""
Enhanced Video Analysis - Detect swipe transitions and card timing
Tracks horizontal movement to identify when slider cards change
"""

import cv2
import numpy as np
import json
from pathlib import Path

def analyze_slider_video(video_path):
    """Analyze horizontal slider transitions"""
    
    cap = cv2.VideoCapture(str(video_path))
    
    if not cap.isOpened():
        print("Error: Cannot open video file")
        return None
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    print(f"Slider Video Analysis")
    print(f"=" * 60)
    print(f"Resolution: {width}x{height}")
    print(f"FPS: {fps:.2f}")
    print(f"Total Frames: {total_frames}")
    print(f"Duration: {total_frames/fps:.2f}s")
    print(f"=" * 60)
    print()
    
    prev_frame = None
    frame_num = 0
    transitions = []
    current_card = 1
    motion_threshold = 5.0  # Horizontal motion threshold
    
    # Sample center column to detect horizontal movement
    sample_x = width // 2
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        if prev_frame is not None and frame_num % 3 == 0:  # Sample every 3 frames
            # Calculate optical flow in center region
            center_region = gray[:, sample_x-100:sample_x+100]
            prev_center = prev_frame[:, sample_x-100:sample_x+100]
            
            # Detect horizontal motion
            diff = cv2.absdiff(center_region, prev_center)
            motion_score = np.mean(diff)
            
            # Detect significant horizontal movement (swipe)
            if motion_score > motion_threshold:
                timestamp = frame_num / fps
                
                # Check if this is a new transition (not continuation)
                if not transitions or (timestamp - transitions[-1]['time']) > 0.5:
                    current_card += 1
                    transitions.append({
                        'card': current_card,
                        'frame': frame_num,
                        'time': timestamp,
                        'motion_intensity': float(motion_score)
                    })
                    print(f"Card {current_card} detected at {timestamp:.2f}s (frame {frame_num})")
        
        prev_frame = gray
        frame_num += 1
        
        if frame_num % 200 == 0:
            progress = (frame_num / total_frames) * 100
            print(f"Progress: {progress:.1f}%", end='\r')
    
    cap.release()
    
    # Build card timing data
    cards = []
    for i, transition in enumerate(transitions):
        if i == 0:
            # Card 1 starts at beginning
            cards.append({
                'card_number': 1,
                'start_time': 0.0,
                'end_time': transition['time'],
                'duration': transition['time'],
                'start_frame': 0,
                'end_frame': transition['frame']
            })
        
        # Add current card
        next_time = transitions[i+1]['time'] if i+1 < len(transitions) else (total_frames / fps)
        next_frame = transitions[i+1]['frame'] if i+1 < len(transitions) else total_frames
        
        cards.append({
            'card_number': transition['card'],
            'start_time': transition['time'],
            'end_time': next_time,
            'duration': next_time - transition['time'],
            'start_frame': transition['frame'],
            'end_frame': next_frame
        })
    
    # If no transitions detected, it's all one card
    if not cards:
        cards.append({
            'card_number': 1,
            'start_time': 0.0,
            'end_time': total_frames / fps,
            'duration': total_frames / fps,
            'start_frame': 0,
            'end_frame': total_frames
        })
    
    print()
    print("=" * 60)
    print(f"DETECTED {len(cards)} CARDS")
    print("=" * 60)
    
    for card in cards:
        print(f"\nCard {card['card_number']}:")
        print(f"  Time: {card['start_time']:.2f}s - {card['end_time']:.2f}s")
        print(f"  Duration: {card['duration']:.2f}s")
        print(f"  Key frame: {card['start_frame']}")
    
    # Save analysis
    output_file = Path(video_path).parent / 'slider_timing.json'
    with open(output_file, 'w') as f:
        json.dump({
            'video_info': {
                'fps': fps,
                'resolution': f"{width}x{height}",
                'total_frames': total_frames,
                'duration': total_frames / fps
            },
            'cards': cards,
            'transitions': transitions
        }, f, indent=2)
    
    print(f"\n✓ Analysis saved to: {output_file}")
    
    return cards

if __name__ == '__main__':
    video_path = Path(__file__).parent / 'Home video.mov'
    analyze_slider_video(video_path)
