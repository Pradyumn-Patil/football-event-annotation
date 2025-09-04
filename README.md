# Football Touch Annotation Tool

A comprehensive Flask web application for analyzing football touch events with frame-by-frame analysis and high-definition video playback verification. Perfect for sports analysis, coaching, and detailed movement study.

## ✨ Key Features

### 🎥 Advanced Video Playback System
- **High-Quality Video Streaming**: Range request support for smooth seeking and buffering
- **Frame-Perfect Navigation**: Jump to any specific frame number with precision
- **Variable Playback Speeds**: 0.25x to 2x speed for detailed analysis
- **Loop Mode**: Automatically loop ±2 seconds around touch events
- **Bidirectional Synchronization**: Video and frame viewer stay perfectly in sync
- **Real-Time Position Tracking**: Live display of current frame number and timestamp

### 🖼️ Professional Frame Analysis
- **Timeline Extraction**: Extract frames at customizable FPS (1-30 FPS)
- **Touch Event Highlighting**: Touch frames highlighted in orange/gold for easy identification
- **Original Frame Numbering**: Frame numbers preserved for CSV synchronization
- **Smart Frame Management**: Automatic cleanup with permanent save options
- **Thumbnail Navigation**: Professional image viewer with horizontal thumbnail strip

### ✏️ Direct CSV Annotation Editing
- **In-App Touch Editing**: Move, add, or remove touch annotations directly from UI
- **Real-Time Validation**: Instant feedback on annotation changes
- **Smart Backup System**: Single backup per CSV file in dedicated folder
- **Undo/Redo Support**: Cancel changes or save modifications seamlessly

### 🎯 Intelligent Navigation
- **Touch Event Jumping**: Quick navigation between touch events
- **Frame/Time Conversion**: Seamless switching between frame numbers and timestamps
- **Keyboard Shortcuts**: Full keyboard support for efficient workflow
- **Quick Actions**: Sync, center, and reset functions for rapid navigation

### 🎨 Modern User Interface
- **Two-Row Control Layout**: Organized controls for playback and navigation
- **Mobile Responsive**: Works perfectly on tablets and mobile devices
- **Color-Coded Interface**: Intuitive button colors for different functions
- **Professional Styling**: Clean, modern design with consistent theme

## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## 🚀 Quick Start

### 1. Start the Application
```bash
python app.py
```

### 2. Access the Interface
Navigate to: `http://localhost:5001`

### 3. Automatic File Detection
- Place video files in the `data/` folder  
- Place corresponding CSV files in the `csv/` folder
- Files are matched automatically by name (e.g., `video.mp4` ↔ `video.csv`)

### 4. Extract and Analyze
- Select your video from the dropdown
- Choose extraction mode:
  - **Touch Frames Only**: Extract only frames with touch events
  - **Full Timeline**: Extract frames at selected FPS (1-30 FPS)
- Click "Extract Frames"

### 5. Analyze with Video Playback
- **Show Video Player**: Click the eye icon to reveal video controls
- **Jump to Frame**: Enter frame number and press Enter
- **Navigate Touches**: Use Previous/Next touch buttons
- **Analyze in Detail**: Click "Analyze" to play video around current timestamp
- **Edit Annotations**: Use Edit Mode to modify touch events directly

## CSV Format

The CSV file should have the following columns:
- `Frame Number`: The frame number where the touch occurred
- `Time (seconds)`: The time in seconds when the touch occurred
- `Body Part`: The body part used (e.g., "Right Foot", "Left Foot")
- `Timestamp`: The timestamp of the annotation

## 📁 File Structure

```
Touch/
├── app.py                          # Main Flask application with video streaming
├── templates/
│   └── index.html                  # Enhanced web interface with video controls
├── static/
│   ├── css/
│   │   └── style.css              # Professional styling with video player CSS
│   └── js/
│       └── app.js                 # Advanced client-side logic with video sync
├── data/                          # 📹 Video files (MP4, MOV, AVI, etc.)
├── csv/                           # 📄 CSV annotation files  
├── backup_csv/                    # 💾 Original CSV backups (auto-created)
├── extracted_frames/              # 🖼️ Temporary extracted frames
├── reviewed_extracted_frames/     # ⭐ Permanently saved frames
├── test/
│   └── test_extraction.py         # Test script for validation
├── requirements.txt               # Python dependencies
├── CLAUDE.md                      # Development documentation
└── README.md                      # This file
```

## 🎮 Advanced Usage

### Video Player Controls

**Row 1 - Status & Playback:**
- **Playback Speed**: 0.25x - 2x variable speed control
- **Loop Mode**: Auto-loop ±2 seconds around touch events  
- **Current Position**: Real-time time display
- **Current Frame**: Live frame number tracking

**Row 2 - Navigation:**
- **Jump to Time**: Enter timestamp to seek (e.g., "15.5" for 15.5 seconds)
- **Jump to Frame**: Enter frame number to seek (e.g., "450" for frame 450)
- **Touch Navigation**: Previous/Next buttons to jump between touch events
- **Quick Actions**: Sync, center, and reset functions

### Keyboard Shortcuts
- **Space**: Play/Pause video
- **← →**: Seek video ±5 seconds  
- **↑ ↓**: Volume control
- **F**: Fullscreen mode
- **Enter**: Execute jump commands in input fields

### Edit Mode
1. Click "Edit Mode" to modify touch annotations
2. Select any frame and mark/unmark as touch event
3. Choose body part from dropdown (Right Foot, Left Foot, etc.)
4. Save changes to update CSV file
5. Original CSV is automatically backed up

## Testing

Run the test script to verify your setup:
```bash
cd test
python test_extraction.py
```

## 📝 Technical Notes

### Performance & Optimization
- **Video Streaming**: Efficient range request handling for smooth seeking
- **Memory Management**: 8KB chunk streaming for large video files
- **Frame Caching**: Session-based caching prevents re-extraction
- **Auto Cleanup**: Temporary files cleaned automatically

### File Support
- **Video Formats**: MP4, MOV, AVI, MKV, WEBM
- **Maximum Size**: 500MB per file
- **Frame Format**: High-quality JPEG images
- **CSV Encoding**: UTF-8 with proper timestamp formatting

### Browser Compatibility
- **Chrome**: Full support with all features
- **Firefox**: Full support with all features  
- **Safari**: Full support including MOV playback
- **Mobile**: Responsive design works on tablets and phones

## 🔧 Troubleshooting

### Common Issues
1. **Video not loading**: Check file format and size (<500MB)
2. **Frame sync issues**: Use the Sync button to realign
3. **CSV not detected**: Ensure files have matching names in correct folders
4. **Performance issues**: Lower FPS extraction rate for better performance

### Development Setup
```bash
# Install dependencies
pip install flask opencv-python pandas pillow

# Run in development mode
export FLASK_ENV=development
python app.py
```

### Port Configuration  
Default port: `5001`  
To change: Modify `app.run(port=5001)` in `app.py`

## 🏆 Use Cases

- **Football Analysis**: Detailed touch event analysis for players
- **Coaching**: Frame-by-frame technique analysis  
- **Sports Research**: Academic studies on player movement
- **Training**: Precision feedback for skill development
- **Match Analysis**: Professional game review and statistics

## 📞 Support

For issues or questions:
1. Check the `CLAUDE.md` file for development details
2. Run the test script: `python test/test_extraction.py` 
3. Verify all dependencies are installed correctly

---

**Note**: This application processes videos locally for privacy and performance. No data is sent to external servers.