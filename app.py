from flask import Flask, render_template, request, jsonify, send_file, url_for, session, Response
import os
import cv2
import pandas as pd
import json
from werkzeug.utils import secure_filename
import shutil
from datetime import datetime
import base64
from io import BytesIO, StringIO
from PIL import Image
import uuid
import time
import re

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['DATA_FOLDER'] = 'data'
app.config['CSV_FOLDER'] = 'csv'
app.config['FRAMES_FOLDER'] = 'extracted_frames'
app.config['REVIEWED_FRAMES_FOLDER'] = 'reviewed_extracted_frames'

ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}
ALLOWED_CSV_EXTENSIONS = {'csv'}

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['DATA_FOLDER'], exist_ok=True)
os.makedirs(app.config['CSV_FOLDER'], exist_ok=True)
os.makedirs(app.config['FRAMES_FOLDER'], exist_ok=True)
os.makedirs(app.config['REVIEWED_FRAMES_FOLDER'], exist_ok=True)

# Global session tracking
current_extraction_session = None

def allowed_file(filename, allowed_extensions):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

def clean_extraction_folder():
    frames_dir = app.config['FRAMES_FOLDER']
    for filename in os.listdir(frames_dir):
        file_path = os.path.join(frames_dir, filename)
        try:
            if os.path.isfile(file_path):
                os.unlink(file_path)
        except Exception as e:
            print(f"Error deleting {file_path}: {e}")

def extract_frames(video_path, csv_path, video_filename):
    global current_extraction_session
    try:
        df = pd.read_csv(csv_path)
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"error": "Could not open video file"}
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Create new session ID
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        video_base_name = os.path.splitext(video_filename)[0].replace(" ", "_")
        session_id = f"{video_base_name}_{timestamp}"
        
        # Set current session
        current_extraction_session = {
            'session_id': session_id,
            'video_filename': video_filename,
            'csv_path': csv_path,
            'timestamp': timestamp,
            'saved': False
        }
        
        # Clean previous frames before extracting new ones
        clean_extraction_folder()
        
        extracted_frames = []
        total_touches = len(df)
        
        for idx, row in df.iterrows():
            frame_num = int(row['Frame Number'])
            time_sec = row['Time (seconds)']
            body_part = row['Body Part']
            timestamp = row['Timestamp']
            
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num - 1)
            ret, frame = cap.read()
            
            if ret:
                frame_filename = f"frame_{frame_num:06d}.jpg"
                frame_path = os.path.join(app.config['FRAMES_FOLDER'], frame_filename)
                
                cv2.imwrite(frame_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
                thumbnail_base64 = base64.b64encode(buffer).decode('utf-8')
                
                extracted_frames.append({
                    'frame_number': frame_num,
                    'time_seconds': float(time_sec),
                    'body_part': body_part,
                    'timestamp': timestamp,
                    'filename': frame_filename,
                    'thumbnail': f"data:image/jpeg;base64,{thumbnail_base64}",
                    'index': idx + 1,
                    'total': total_touches
                })
                
                yield {
                    'type': 'progress',
                    'current': idx + 1,
                    'total': total_touches,
                    'frame_number': frame_num
                }
        
        cap.release()
        
        yield {
            'type': 'complete',
            'frames': extracted_frames,
            'total_frames': len(extracted_frames),
            'session_info': current_extraction_session,
            'video_info': {
                'fps': fps,
                'total_frames': total_frames,
                'duration': total_frames / fps if fps > 0 else 0
            }
        }
        
    except Exception as e:
        yield {
            'type': 'error',
            'error': str(e)
        }

def extract_timeline(video_path, csv_path, video_filename, extraction_fps=5):
    """Extract frames at specified FPS rate for timeline view, marking touch frames"""
    global current_extraction_session
    try:
        # Create session tracking
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        video_base_name = os.path.splitext(video_filename)[0].replace(" ", "_")
        session_id = f"{video_base_name}_{timestamp}"
        
        current_extraction_session = {
            'session_id': session_id,
            'video_filename': video_filename,
            'csv_path': csv_path,
            'timestamp': timestamp,
            'saved': False
        }
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            yield {'type': 'error', 'error': 'Could not open video file'}
            return
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Calculate frame interval based on desired extraction FPS
        if extraction_fps >= fps:
            # If requested FPS is higher than video FPS, extract all frames
            frame_interval = 1
        else:
            # Calculate interval: video_fps / extraction_fps
            frame_interval = int(fps / extraction_fps)
        
        # Read touch annotations
        df = pd.read_csv(csv_path)
        touch_frames = set(int(row['Frame Number']) for _, row in df.iterrows())
        touch_data = {}
        for _, row in df.iterrows():
            frame_num = int(row['Frame Number'])
            touch_data[frame_num] = {
                'body_part': row['Body Part'],
                'time_seconds': float(row['Time (seconds)']),
                'timestamp': row['Timestamp']
            }
        
        # Clean previous frames before extracting new ones
        clean_extraction_folder()
        
        timeline_frames = []
        # Extract frames at the calculated interval (FPS-based)
        frames_to_extract = list(range(0, total_frames, frame_interval))
        
        # Add all touch frames to ensure they're included
        for touch_frame in touch_frames:
            if touch_frame - 1 not in frames_to_extract:  # -1 because CV2 uses 0-based indexing
                frames_to_extract.append(touch_frame - 1)
        
        frames_to_extract.sort()
        total_to_extract = len(frames_to_extract)
        
        for idx, frame_idx in enumerate(frames_to_extract):
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            
            if ret:
                frame_number = frame_idx + 1  # Convert to 1-based
                time_seconds = frame_idx / fps if fps > 0 else 0
                is_touch = frame_number in touch_frames
                
                frame_filename = f"frame_{frame_number:06d}.jpg"
                frame_path = os.path.join(app.config['FRAMES_FOLDER'], frame_filename)
                
                cv2.imwrite(frame_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
                thumbnail_base64 = base64.b64encode(buffer).decode('utf-8')
                
                frame_data = {
                    'frame_number': frame_number,
                    'time_seconds': time_seconds,
                    'filename': frame_filename,
                    'thumbnail': f"data:image/jpeg;base64,{thumbnail_base64}",
                    'is_touch': is_touch,
                    'body_part': touch_data.get(frame_number, {}).get('body_part', '') if is_touch else '',
                    'timestamp': touch_data.get(frame_number, {}).get('timestamp', '') if is_touch else ''
                }
                
                timeline_frames.append(frame_data)
                
                yield {
                    'type': 'progress',
                    'current': idx + 1,
                    'total': total_to_extract,
                    'frame_number': frame_number
                }
        
        cap.release()
        
        yield {
            'type': 'complete',
            'frames': timeline_frames,
            'total_frames': len(timeline_frames),
            'touch_frames': len(touch_frames),
            'session_info': current_extraction_session,
            'video_info': {
                'fps': fps,
                'total_frames': total_frames,
                'duration': total_frames / fps if fps > 0 else 0
            }
        }
        
    except Exception as e:
        yield {
            'type': 'error',
            'error': str(e)
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/videos')
def get_videos():
    try:
        data_folder = app.config['DATA_FOLDER']
        csv_folder = app.config['CSV_FOLDER']
        videos = []
        
        if os.path.exists(data_folder):
            for filename in os.listdir(data_folder):
                if allowed_file(filename, ALLOWED_VIDEO_EXTENSIONS):
                    # Get base name without extension
                    base_name = os.path.splitext(filename)[0]
                    
                    # Check if corresponding CSV exists in csv folder
                    csv_filename = f"{base_name}.csv"
                    csv_path = os.path.join(csv_folder, csv_filename)
                    has_csv = os.path.exists(csv_path)
                    
                    # Get video file info
                    video_path = os.path.join(data_folder, filename)
                    file_size = os.path.getsize(video_path)
                    
                    # Get video metadata
                    cap = cv2.VideoCapture(video_path)
                    video_info = {}
                    if cap.isOpened():
                        fps = cap.get(cv2.CAP_PROP_FPS)
                        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        duration = total_frames / fps if fps > 0 else 0
                        
                        video_info = {
                            'fps': fps,
                            'total_frames': total_frames,
                            'width': width,
                            'height': height,
                            'duration': round(duration, 2)
                        }
                    cap.release()
                    
                    videos.append({
                        'filename': filename,
                        'base_name': base_name,
                        'has_csv': has_csv,
                        'csv_filename': csv_filename if has_csv else None,
                        'file_size': file_size,
                        'video_info': video_info
                    })
        
        # Sort videos by filename
        videos.sort(key=lambda x: x['filename'])
        
        return jsonify({
            'success': True,
            'videos': videos
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/check_csv/<video_name>')
def check_csv(video_name):
    try:
        csv_folder = app.config['CSV_FOLDER']
        base_name = os.path.splitext(video_name)[0]
        csv_filename = f"{base_name}.csv"
        csv_path = os.path.join(csv_folder, csv_filename)
        
        if os.path.exists(csv_path):
            # Read CSV to get annotation count
            df = pd.read_csv(csv_path)
            return jsonify({
                'success': True,
                'has_csv': True,
                'csv_filename': csv_filename,
                'annotation_count': len(df),
                'csv_preview': df.head().to_dict('records')
            })
        else:
            return jsonify({
                'success': True,
                'has_csv': False,
                'csv_filename': csv_filename
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/upload', methods=['POST'])
def upload_files():
    try:
        if 'video' not in request.files or 'csv' not in request.files:
            return jsonify({'error': 'Both video and CSV files are required'}), 400
        
        video_file = request.files['video']
        csv_file = request.files['csv']
        
        if video_file.filename == '' or csv_file.filename == '':
            return jsonify({'error': 'No files selected'}), 400
        
        if not allowed_file(video_file.filename, ALLOWED_VIDEO_EXTENSIONS):
            return jsonify({'error': 'Invalid video format. Allowed: mp4, avi, mov, mkv, webm'}), 400
        
        if not allowed_file(csv_file.filename, ALLOWED_CSV_EXTENSIONS):
            return jsonify({'error': 'Invalid CSV format'}), 400
        
        video_filename = secure_filename(video_file.filename)
        csv_filename = secure_filename(csv_file.filename)
        
        video_path = os.path.join(app.config['UPLOAD_FOLDER'], video_filename)
        csv_path = os.path.join(app.config['UPLOAD_FOLDER'], csv_filename)
        
        video_file.save(video_path)
        csv_file.save(csv_path)
        
        return jsonify({
            'success': True,
            'video_path': video_path,
            'csv_path': csv_path
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/extract', methods=['POST'])
def extract():
    try:
        data = request.json
        video_filename = data.get('video_filename')
        
        if not video_filename:
            return jsonify({'error': 'Missing video filename'}), 400
        
        data_folder = app.config['DATA_FOLDER']
        csv_folder = app.config['CSV_FOLDER']
        video_path = os.path.join(data_folder, video_filename)
        
        # Get corresponding CSV path from csv folder
        base_name = os.path.splitext(video_filename)[0]
        csv_filename = f"{base_name}.csv"
        csv_path = os.path.join(csv_folder, csv_filename)
        
        if not os.path.exists(video_path):
            return jsonify({'error': f'Video file not found: {video_filename}'}), 404
            
        if not os.path.exists(csv_path):
            return jsonify({'error': f'CSV file not found: {csv_filename}. Please ensure the CSV file has the same base name as the video file.'}), 404
        
        result = None
        for update in extract_frames(video_path, csv_path, video_filename):
            if update['type'] == 'complete':
                result = update
                break
            elif update['type'] == 'error':
                return jsonify({'error': update['error']}), 500
        
        if result:
            return jsonify(result)
        else:
            return jsonify({'error': 'Extraction failed'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/extract_timeline', methods=['POST'])
def extract_timeline_endpoint():
    try:
        data = request.json
        video_filename = data.get('video_filename')
        extraction_fps = data.get('extraction_fps', 5)  # Default to 5 FPS
        
        if not video_filename:
            return jsonify({'error': 'Missing video filename'}), 400
        
        data_folder = app.config['DATA_FOLDER']
        csv_folder = app.config['CSV_FOLDER']
        video_path = os.path.join(data_folder, video_filename)
        
        # Get corresponding CSV path from csv folder
        base_name = os.path.splitext(video_filename)[0]
        csv_filename = f"{base_name}.csv"
        csv_path = os.path.join(csv_folder, csv_filename)
        
        if not os.path.exists(video_path):
            return jsonify({'error': f'Video file not found: {video_filename}'}), 404
            
        if not os.path.exists(csv_path):
            return jsonify({'error': f'CSV file not found: {csv_filename}. Please ensure the CSV file has the same base name as the video file.'}), 404
        
        result = None
        for update in extract_timeline(video_path, csv_path, video_filename, extraction_fps):
            if update['type'] == 'complete':
                result = update
                break
            elif update['type'] == 'error':
                return jsonify({'error': update['error']}), 500
        
        if result:
            return jsonify(result)
        else:
            return jsonify({'error': 'Timeline extraction failed'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/frame/<filename>')
def serve_frame(filename):
    try:
        return send_file(os.path.join(app.config['FRAMES_FOLDER'], filename))
    except FileNotFoundError:
        return jsonify({'error': 'Frame not found'}), 404

@app.route('/download_all')
def download_all():
    try:
        import zipfile
        from io import BytesIO
        
        memory_file = BytesIO()
        
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            frames_dir = app.config['FRAMES_FOLDER']
            for filename in os.listdir(frames_dir):
                if filename.endswith('.jpg'):
                    file_path = os.path.join(frames_dir, filename)
                    zf.write(file_path, filename)
        
        memory_file.seek(0)
        
        return send_file(
            memory_file,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'extracted_frames_{datetime.now().strftime("%Y%m%d_%H%M%S")}.zip'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/save_current_frames', methods=['POST'])
def save_current_frames():
    global current_extraction_session
    try:
        if not current_extraction_session:
            return jsonify({'error': 'No active extraction session'}), 400
        
        if current_extraction_session['saved']:
            return jsonify({'error': 'Frames already saved for this session'}), 400
        
        # Create directory for this session
        session_dir = os.path.join(app.config['REVIEWED_FRAMES_FOLDER'], current_extraction_session['session_id'])
        frames_dir = os.path.join(session_dir, 'frames')
        os.makedirs(frames_dir, exist_ok=True)
        
        # Copy all frames from extracted_frames to reviewed folder
        frames_folder = app.config['FRAMES_FOLDER']
        copied_files = []
        
        if os.path.exists(frames_folder):
            for filename in os.listdir(frames_folder):
                if filename.endswith('.jpg'):
                    src_path = os.path.join(frames_folder, filename)
                    dst_path = os.path.join(frames_dir, filename)
                    shutil.copy2(src_path, dst_path)
                    copied_files.append(filename)
        
        # Copy the CSV file
        csv_src = current_extraction_session['csv_path']
        csv_dst = os.path.join(session_dir, 'annotations.csv')
        shutil.copy2(csv_src, csv_dst)
        
        # Create metadata file
        metadata = {
            'session_id': current_extraction_session['session_id'],
            'video_filename': current_extraction_session['video_filename'],
            'extraction_timestamp': current_extraction_session['timestamp'],
            'saved_timestamp': datetime.now().isoformat(),
            'total_frames': len(copied_files),
            'frame_files': copied_files
        }
        
        metadata_path = os.path.join(session_dir, 'metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        # Mark session as saved
        current_extraction_session['saved'] = True
        
        return jsonify({
            'success': True,
            'session_id': current_extraction_session['session_id'],
            'saved_location': session_dir,
            'total_frames': len(copied_files)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cleanup_frames', methods=['POST'])
def cleanup_frames():
    global current_extraction_session
    try:
        # Only clean if frames are saved or user confirms
        force_cleanup = request.json.get('force', False) if request.is_json else False
        
        if current_extraction_session and not current_extraction_session['saved'] and not force_cleanup:
            return jsonify({'error': 'Unsaved frames exist. Save them first or use force=true'}), 400
        
        clean_extraction_folder()
        current_extraction_session = None
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============= TOUCH EDITING ENDPOINTS =============

@app.route('/api/load_csv', methods=['POST'])
def load_csv():
    """Load CSV data for editing"""
    try:
        data = request.json
        video_filename = data.get('video_filename')
        
        if not video_filename:
            return jsonify({'error': 'Missing video filename'}), 400
        
        csv_folder = app.config['CSV_FOLDER']
        base_name = os.path.splitext(video_filename)[0]
        csv_filename = f"{base_name}.csv"
        csv_path = os.path.join(csv_folder, csv_filename)
        
        if not os.path.exists(csv_path):
            return jsonify({'error': f'CSV file not found: {csv_filename}'}), 404
        
        df = pd.read_csv(csv_path)
        csv_data = df.to_dict('records')
        
        return jsonify({
            'success': True,
            'csv_data': csv_data,
            'csv_filename': csv_filename,
            'total_touches': len(csv_data)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/move_touch', methods=['POST'])
def move_touch():
    """Move a touch annotation from one frame to another"""
    try:
        data = request.json
        video_filename = data.get('video_filename')
        from_frame = data.get('from_frame')
        to_frame = data.get('to_frame')
        
        if not all([video_filename, from_frame, to_frame]):
            return jsonify({'error': 'Missing required parameters'}), 400
        
        # Calculate new time based on video FPS and new frame number
        data_folder = app.config['DATA_FOLDER']
        video_path = os.path.join(data_folder, video_filename)
        
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        cap.release()
        
        new_time = (to_frame - 1) / fps  # -1 because frames are 1-indexed
        
        return jsonify({
            'success': True,
            'from_frame': from_frame,
            'to_frame': to_frame,
            'new_time': new_time,
            'fps': fps
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/add_touch', methods=['POST'])
def add_touch():
    """Add a new touch annotation"""
    try:
        data = request.json
        video_filename = data.get('video_filename')
        frame_number = data.get('frame_number')
        body_part = data.get('body_part', 'Right Foot')
        
        if not all([video_filename, frame_number]):
            return jsonify({'error': 'Missing required parameters'}), 400
        
        # Calculate time based on video FPS
        data_folder = app.config['DATA_FOLDER']
        video_path = os.path.join(data_folder, video_filename)
        
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        cap.release()
        
        time_seconds = (frame_number - 1) / fps
        timestamp = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        
        return jsonify({
            'success': True,
            'frame_number': frame_number,
            'time_seconds': time_seconds,
            'body_part': body_part,
            'timestamp': timestamp
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/save_csv_changes', methods=['POST'])
def save_csv_changes():
    """Save all touch editing changes back to CSV file"""
    try:
        data = request.json
        video_filename = data.get('video_filename')
        touch_data = data.get('touch_data', [])
        
        if not video_filename:
            return jsonify({'error': 'Missing video filename'}), 400
        
        csv_folder = app.config['CSV_FOLDER']
        base_name = os.path.splitext(video_filename)[0]
        csv_filename = f"{base_name}.csv"
        csv_path = os.path.join(csv_folder, csv_filename)
        
        # Create backup folder and backup original CSV only once (before first edit)
        backup_folder = os.path.join(os.path.dirname(csv_folder), 'backup_csv')
        os.makedirs(backup_folder, exist_ok=True)
        
        backup_filename = f"{base_name}_original.csv"
        backup_path = os.path.join(backup_folder, backup_filename)
        
        # Only create backup if it doesn't already exist (first edit only)
        if os.path.exists(csv_path) and not os.path.exists(backup_path):
            shutil.copy2(csv_path, backup_path)
        
        # Load original CSV to preserve existing annotations
        original_df = pd.DataFrame()
        if os.path.exists(csv_path):
            original_df = pd.read_csv(csv_path)
        
        # Convert touch_data to DataFrame for easier manipulation
        edited_df = pd.DataFrame(touch_data)
        
        if not edited_df.empty:
            # Get list of frame numbers that were edited
            edited_frame_numbers = set(edited_df['Frame Number'].tolist())
            
            # Keep original annotations that weren't edited
            if not original_df.empty:
                unchanged_df = original_df[~original_df['Frame Number'].isin(edited_frame_numbers)]
            else:
                unchanged_df = pd.DataFrame()
            
            # Combine unchanged original data with new edited data
            if unchanged_df.empty:
                combined_df = edited_df
            elif edited_df.empty:
                combined_df = unchanged_df
            else:
                combined_df = pd.concat([unchanged_df, edited_df], ignore_index=True)
        else:
            # If no touch data provided, keep only original data
            combined_df = original_df
        
        # Ensure proper column order
        column_order = ['Frame Number', 'Time (seconds)', 'Body Part', 'Timestamp']
        if not combined_df.empty:
            combined_df = combined_df.reindex(columns=column_order)
            
            # Sort by frame number
            combined_df = combined_df.sort_values('Frame Number')
            
            # Save to CSV
            combined_df.to_csv(csv_path, index=False)
            saved_count = len(combined_df)
        else:
            # If no data at all, create empty CSV with headers
            empty_df = pd.DataFrame(columns=column_order)
            empty_df.to_csv(csv_path, index=False)
            saved_count = 0
        
        return jsonify({
            'success': True,
            'edited_touches': len(touch_data),
            'total_touches': saved_count,
            'backup_created': backup_path,
            'message': f'Successfully saved {len(touch_data)} edits. Total annotations: {saved_count}'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/clear', methods=['POST'])
def clear_files():
    global current_extraction_session
    try:
        for folder in [app.config['UPLOAD_FOLDER'], app.config['FRAMES_FOLDER']]:
            for filename in os.listdir(folder):
                file_path = os.path.join(folder, filename)
                try:
                    if os.path.isfile(file_path):
                        os.unlink(file_path)
                except Exception as e:
                    print(f"Error deleting {file_path}: {e}")
        
        # Reset session
        current_extraction_session = None
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============= ANNOTATION SYSTEM ROUTES =============

@app.route('/annotator')
def annotator():
    return render_template('annotator.html')

@app.route('/upload_video', methods=['POST'])
def upload_video():
    try:
        if 'video' not in request.files:
            return jsonify({'error': 'No video file provided'}), 400
        
        video_file = request.files['video']
        
        if video_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(video_file.filename, ALLOWED_VIDEO_EXTENSIONS):
            return jsonify({'error': 'Invalid video format'}), 400
        
        # Generate unique session ID
        session_id = str(uuid.uuid4())
        session['session_id'] = session_id
        session['annotations'] = []
        
        # Save video file
        filename = secure_filename(video_file.filename)
        video_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_{filename}")
        video_file.save(video_path)
        
        # Get video metadata
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return jsonify({'error': 'Could not open video file'}), 500
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = total_frames / fps if fps > 0 else 0
        
        cap.release()
        
        # Store video info in session
        session['video_info'] = {
            'path': video_path,
            'filename': filename,
            'fps': fps,
            'total_frames': total_frames,
            'width': width,
            'height': height,
            'duration': duration
        }
        
        return jsonify({
            'success': True,
            'video_info': session['video_info']
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_frame/<int:frame_number>')
def get_frame(frame_number):
    try:
        if 'video_info' not in session:
            return jsonify({'error': 'No video loaded'}), 400
        
        video_path = session['video_info']['path']
        total_frames = session['video_info']['total_frames']
        
        if frame_number < 0 or frame_number >= total_frames:
            return jsonify({'error': 'Invalid frame number'}), 400
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return jsonify({'error': 'Could not open video'}), 500
        
        # Set to specific frame
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ret, frame = cap.read()
        cap.release()
        
        if not ret:
            return jsonify({'error': 'Could not read frame'}), 500
        
        # Convert frame to base64
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return jsonify({
            'frame': f"data:image/jpeg;base64,{frame_base64}",
            'frame_number': frame_number,
            'time_seconds': frame_number / session['video_info']['fps']
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/add_annotation', methods=['POST'])
def add_annotation():
    try:
        if 'video_info' not in session:
            return jsonify({'error': 'No video loaded'}), 400
        
        data = request.json
        frame_number = data.get('frame_number')
        body_part = data.get('body_part')
        
        if frame_number is None or not body_part:
            return jsonify({'error': 'Missing frame_number or body_part'}), 400
        
        # Calculate time in seconds
        fps = session['video_info']['fps']
        time_seconds = frame_number / fps
        
        # Create annotation
        annotation = {
            'frame_number': frame_number,
            'time_seconds': round(time_seconds, 3),
            'body_part': body_part,
            'timestamp': datetime.now().isoformat() + 'Z'
        }
        
        # Get current annotations
        annotations = session.get('annotations', [])
        
        # Check if frame already annotated
        existing_index = next((i for i, a in enumerate(annotations) 
                              if a['frame_number'] == frame_number), None)
        
        if existing_index is not None:
            # Update existing annotation
            annotations[existing_index] = annotation
        else:
            # Add new annotation
            annotations.append(annotation)
        
        # Sort by frame number
        annotations.sort(key=lambda x: x['frame_number'])
        
        # Update session
        session['annotations'] = annotations
        session.modified = True
        
        return jsonify({
            'success': True,
            'annotation': annotation,
            'total_annotations': len(annotations)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/remove_annotation', methods=['POST'])
def remove_annotation():
    try:
        data = request.json
        frame_number = data.get('frame_number')
        
        if frame_number is None:
            return jsonify({'error': 'Missing frame_number'}), 400
        
        annotations = session.get('annotations', [])
        annotations = [a for a in annotations if a['frame_number'] != frame_number]
        
        session['annotations'] = annotations
        session.modified = True
        
        return jsonify({
            'success': True,
            'total_annotations': len(annotations)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_annotations')
def get_annotations():
    try:
        annotations = session.get('annotations', [])
        return jsonify({
            'annotations': annotations,
            'total': len(annotations)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/export_csv')
def export_csv():
    try:
        annotations = session.get('annotations', [])
        
        if not annotations:
            return jsonify({'error': 'No annotations to export'}), 400
        
        # Create CSV data
        df = pd.DataFrame(annotations)
        df = df[['frame_number', 'time_seconds', 'body_part', 'timestamp']]
        df.columns = ['Frame Number', 'Time (seconds)', 'Body Part', 'Timestamp']
        
        # Create CSV string
        csv_string = df.to_csv(index=False)
        
        # Generate filename
        video_filename = session.get('video_info', {}).get('filename', 'video')
        base_name = os.path.splitext(video_filename)[0]
        filename = f"{base_name}_annotations.csv"
        
        # Create BytesIO object for binary mode
        csv_bytes = BytesIO()
        csv_bytes.write(csv_string.encode('utf-8'))
        csv_bytes.seek(0)
        
        return send_file(
            csv_bytes,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/clear_session', methods=['POST'])
def clear_session():
    try:
        # Clean up video file if exists
        if 'video_info' in session:
            video_path = session['video_info'].get('path')
            if video_path and os.path.exists(video_path):
                try:
                    os.remove(video_path)
                except:
                    pass
        
        # Clear session
        session.clear()
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/video/<filename>')
def stream_video(filename):
    """Stream video file from data folder with range request support"""
    try:
        video_path = os.path.join(app.config['DATA_FOLDER'], filename)
        
        if not os.path.exists(video_path):
            return jsonify({'error': 'Video file not found'}), 404
        
        # Check if it's an allowed video file
        if not allowed_file(filename, ALLOWED_VIDEO_EXTENSIONS):
            return jsonify({'error': 'Invalid video format'}), 400
        
        # Get range header before creating generator
        range_header = request.headers.get('Range', None)
        file_size = os.path.getsize(video_path)
        
        # Parse range header
        byte_start = 0
        byte_end = file_size - 1
        
        if range_header:
            match = re.search(r'bytes=(\d+)-(\d*)', range_header)
            if match:
                byte_start = int(match.group(1))
                if match.group(2):
                    byte_end = int(match.group(2))
        
        content_length = byte_end - byte_start + 1
        
        def generate():
            with open(video_path, 'rb') as f:
                f.seek(byte_start)
                remaining = content_length
                while remaining:
                    read_size = min(remaining, 8192)  # Read in 8KB chunks
                    data = f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data
        
        # Determine MIME type based on file extension
        file_ext = filename.lower().split('.')[-1]
        mime_types = {
            'mp4': 'video/mp4',
            'avi': 'video/x-msvideo',
            'mov': 'video/quicktime',
            'mkv': 'video/x-matroska',
            'webm': 'video/webm'
        }
        mimetype = mime_types.get(file_ext, 'video/mp4')
        
        response = Response(generate(), 
                          206 if range_header else 200,
                          mimetype=mimetype)
        
        if range_header:
            response.headers.add('Content-Range', 
                               f'bytes {byte_start}-{byte_end}/{file_size}')
            response.headers.add('Accept-Ranges', 'bytes')
            response.headers.add('Content-Length', str(content_length))
            response.status_code = 206
        else:
            response.headers.add('Content-Length', str(file_size))
        
        response.headers.add('Cache-Control', 'no-cache')
        
        return response
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)