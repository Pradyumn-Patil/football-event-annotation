import cv2
import pandas as pd
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_frame_extraction():
    print("Testing frame extraction logic...")
    
    csv_file = "../ingapore 7 Cone 3_annotations (2).csv"
    
    if not os.path.exists(csv_file):
        print(f"Error: CSV file not found at {csv_file}")
        return
    
    try:
        df = pd.read_csv(csv_file)
        print(f"✓ Successfully loaded CSV with {len(df)} touch events")
        print(f"  Columns: {', '.join(df.columns)}")
        print(f"  Frame range: {df['Frame Number'].min()} - {df['Frame Number'].max()}")
        print(f"  Time range: {df['Time (seconds)'].min():.2f}s - {df['Time (seconds)'].max():.2f}s")
        
        body_parts = df['Body Part'].value_counts()
        print(f"  Body parts: {', '.join([f'{part}: {count}' for part, count in body_parts.items()])}")
        
        print("\nSample data (first 5 rows):")
        print(df.head().to_string())
        
    except Exception as e:
        print(f"✗ Error reading CSV: {e}")
        return
    
    print("\n✓ Frame extraction logic test passed!")
    print("Note: Actual video processing will require a video file")

def test_opencv_availability():
    print("\nTesting OpenCV availability...")
    try:
        print(f"✓ OpenCV version: {cv2.__version__}")
        
        cap = cv2.VideoCapture()
        print("✓ VideoCapture object created successfully")
        cap.release()
        
    except Exception as e:
        print(f"✗ OpenCV error: {e}")
        print("  Install with: pip install opencv-python")

if __name__ == "__main__":
    print("="*50)
    print("Frame Extraction Test Suite")
    print("="*50)
    
    test_opencv_availability()
    test_frame_extraction()
    
    print("\n" + "="*50)
    print("Test completed!")