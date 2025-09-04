# Video Touch Frame Extractor

A Flask web application that extracts specific frames from a video based on touch event annotations from a CSV file.

## Features

- **Easy File Upload**: Drag-and-drop or click to upload video and CSV files
- **Batch Frame Extraction**: Extract all touch event frames at once
- **Interactive Gallery**: View extracted frames in list or grid view
- **Frame Information**: Display frame number, timing, body part, and timestamp
- **Filtering & Sorting**: Filter by body part and sort by various criteria
- **Download Options**: Download individual frames or all frames as a ZIP
- **Modern UI**: Clean, responsive design with Bootstrap 5
- **Progress Tracking**: Real-time progress during extraction

## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Usage

1. Start the Flask application:
```bash
python app.py
```

2. Open your browser and navigate to:
```
http://localhost:5000
```

3. Upload your files:
   - **Video File**: Upload your video (MP4, AVI, MOV, MKV, or WEBM)
   - **CSV File**: Upload your touch annotations CSV file

4. Click "Extract Frames" to process the video

5. View and download the extracted frames

## CSV Format

The CSV file should have the following columns:
- `Frame Number`: The frame number where the touch occurred
- `Time (seconds)`: The time in seconds when the touch occurred
- `Body Part`: The body part used (e.g., "Right Foot", "Left Foot")
- `Timestamp`: The timestamp of the annotation

## File Structure

```
Touch/
├── app.py                  # Main Flask application
├── templates/
│   └── index.html         # Web interface
├── static/
│   ├── css/
│   │   └── style.css      # Custom styles
│   └── js/
│       └── app.js         # Client-side logic
├── uploads/               # Temporary upload storage
├── extracted_frames/      # Extracted frame images
├── test/
│   └── test_extraction.py # Test script
├── requirements.txt       # Python dependencies
└── README.md             # This file
```

## Testing

Run the test script to verify your setup:
```bash
cd test
python test_extraction.py
```

## Notes

- Maximum upload size: 500MB per file
- Extracted frames are saved as JPEG images
- The application automatically cleans up old frames when processing new videos
- All uploads and extracted frames are stored locally