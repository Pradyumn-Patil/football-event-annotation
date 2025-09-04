# CLAUDE.md - Development Documentation

## Project Overview
Football Touch Annotation Tool - A comprehensive web application for analyzing football touch events with frame-by-frame analysis and video playback verification.

## Key Commands

### Run the Application
```bash
python app.py
```
The app runs on `http://localhost:5001` with video streaming capabilities.

### Testing
```bash
# Run extraction tests
python test/test_extraction.py
```

## Recent Major Features (Latest Update)

### 🎥 Advanced Video Playback System
- **Video streaming endpoint** with range request support for smooth seeking
- **Frame-by-frame jumping** - Jump to any specific frame number
- **Timestamp synchronization** - Bidirectional sync between video and frame viewer
- **Touch event navigation** - Previous/Next touch buttons for quick jumping
- **Variable playback speeds** (0.25x - 2x) for detailed analysis
- **Loop mode** for analyzing specific sections
- **Real-time frame/time display** with current position tracking

### 🖼️ Enhanced Frame Management
- **Timeline extraction** with selectable FPS (1-30 FPS)
- **Touch frame highlighting** in orange/gold colors
- **Original frame numbering** preserved for CSV synchronization
- **Auto cleanup** of extracted frames with permanent save option
- **Professional image viewer** with thumbnail strip navigation

### ✏️ CSV Annotation Editing
- **Direct touch editing** from UI - move, add, or remove annotations
- **Single backup system** - one backup per CSV in separate folder
- **Real-time validation** and error handling
- **Touch data synchronization** with frame viewer

### 🎨 UI/UX Improvements
- **Two-row video controls** layout for better organization
- **Color-coded buttons** for intuitive navigation
- **Mobile responsive design** for all controls
- **Professional styling** with consistent theme
- **Status indicators** with monospace fonts

## Architecture

### Backend (Flask)
- **Video streaming** with range request support for efficient seeking
- **Frame extraction** using OpenCV with FPS-based intervals
- **CSV manipulation** with pandas for touch annotations
- **Session management** for temporary frame storage
- **File organization** with separate folders for videos, CSVs, and backups

### Frontend (JavaScript/HTML/CSS)
- **Bidirectional synchronization** between video and frame viewer
- **Dynamic UI updates** with real-time position tracking
- **Event-driven navigation** with keyboard and button controls
- **Responsive layout** adapting to different screen sizes

### File Structure
```
├── app.py                 # Main Flask application
├── templates/
│   └── index.html        # Main UI with video player controls
├── static/
│   ├── css/style.css     # Enhanced styling for video features
│   └── js/app.js         # Video player and frame navigation logic
├── data/                 # Video files (.mov, .mp4, etc.)
├── csv/                  # CSV annotation files
├── backup_csv/           # Original CSV backups
├── extracted_frames/     # Temporary frame storage
└── reviewed_extracted_frames/  # Permanent frame storage
```

## Development Notes

### Video Streaming Implementation
- Uses Flask Response with generator for memory-efficient streaming
- Proper HTTP range request handling for video seeking
- MIME type detection for different video formats
- Error handling for request context issues

### Frame-Video Synchronization
- Calculates timestamps using `frame_number / fps`
- Finds closest extracted frames within 30-frame tolerance
- Updates UI elements bidirectionally for seamless experience

### Performance Optimizations
- 8KB chunk streaming for large video files
- Session-based frame caching to avoid re-extraction
- Automatic cleanup of temporary files
- Efficient thumbnail generation and display

## Dependencies
- Flask (web framework)
- OpenCV (video/image processing)
- Pandas (CSV manipulation)
- PIL (image processing)

## Known Issues
- None currently reported

## Future Enhancements
- Multiple video format support expansion
- Advanced touch analysis algorithms
- Export options for annotated data
- Team collaboration features