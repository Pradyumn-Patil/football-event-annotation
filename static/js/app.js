let selectedVideo = null;
let availableVideos = [];
let extractedFrames = [];
let touchFrameIndices = [];  // Array of indices for frames that are touch events
let isGridView = false;
let currentFrameIndex = 0;
let isFullscreen = false;
let framesSaved = false;
let isTimelineMode = false;

// Touch editing state
let editMode = false;
let originalCSVData = [];
let pendingChanges = [];
let editingTouchData = new Map(); // Map of frame_number -> touch_data

document.addEventListener('DOMContentLoaded', function() {
    loadAvailableVideos();
    setupVideoSelection();
    setupButtons();
    setupFilters();
    setupKeyboardNavigation();
    setupImageViewer();
});

async function loadAvailableVideos() {
    try {
        const response = await fetch('/api/videos');
        const data = await response.json();
        
        if (data.success) {
            availableVideos = data.videos;
            populateVideoSelect();
        } else {
            showAlert('Error loading videos: ' + (data.error || 'Unknown error'), 'danger');
        }
    } catch (error) {
        console.error('Error loading videos:', error);
        showAlert('Error loading videos. Please refresh the page.', 'danger');
    }
}

function populateVideoSelect() {
    const videoSelect = document.getElementById('videoSelect');
    videoSelect.innerHTML = '<option value="">Select a video...</option>';
    
    if (availableVideos.length === 0) {
        videoSelect.innerHTML = '<option value="">No videos found in data folder</option>';
        return;
    }
    
    availableVideos.forEach(video => {
        const option = document.createElement('option');
        option.value = video.filename;
        option.textContent = `${video.base_name}${video.has_csv ? ' ✓' : ' ⚠️'}`;
        option.dataset.hasCSV = video.has_csv;
        videoSelect.appendChild(option);
    });
}

function setupVideoSelection() {
    const videoSelect = document.getElementById('videoSelect');
    const refreshBtn = document.getElementById('refreshBtn');
    
    videoSelect.addEventListener('change', handleVideoSelection);
    refreshBtn.addEventListener('click', () => {
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        loadAvailableVideos().then(() => {
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        });
    });
}

function handleVideoSelection(event) {
    const selectedFilename = event.target.value;
    selectedVideo = availableVideos.find(video => video.filename === selectedFilename);
    
    if (selectedVideo) {
        displayVideoInfo(selectedVideo);
        displayCSVStatus(selectedVideo);
        checkVideoReady();
    } else {
        hideVideoInfo();
        hideCSVStatus();
        checkVideoReady();
    }
}

function displayVideoInfo(video) {
    const videoInfoCard = document.getElementById('videoInfoCard');
    const videoDuration = document.getElementById('videoDuration');
    const videoFPS = document.getElementById('videoFPS');
    const videoResolution = document.getElementById('videoResolution');
    const videoSize = document.getElementById('videoSize');
    
    videoDuration.textContent = video.video_info.duration ? `${video.video_info.duration}s` : '-';
    videoFPS.textContent = video.video_info.fps ? `${Math.round(video.video_info.fps)}` : '-';
    videoResolution.textContent = video.video_info.width && video.video_info.height ? 
        `${video.video_info.width}×${video.video_info.height}` : '-';
    videoSize.textContent = formatFileSize(video.file_size);
    
    videoInfoCard.classList.remove('d-none');
}

function displayCSVStatus(video) {
    const csvStatus = document.getElementById('csvStatus');
    const csvStatusText = document.getElementById('csvStatusText');
    const csvStatusDetail = document.getElementById('csvStatusDetail');
    const csvStatusIcon = document.getElementById('csvStatusIcon');
    
    if (video.has_csv) {
        csvStatusText.textContent = video.csv_filename;
        csvStatusDetail.textContent = 'CSV file found - ready to extract frames';
        csvStatusIcon.className = 'fas fa-check-circle text-success';
        csvStatus.className = 'csv-status mt-3 alert alert-success py-2';
    } else {
        csvStatusText.textContent = `${video.csv_filename} (missing)`;
        csvStatusDetail.textContent = 'CSV file not found - cannot extract frames';
        csvStatusIcon.className = 'fas fa-exclamation-triangle text-warning';
        csvStatus.className = 'csv-status mt-3 alert alert-warning py-2';
    }
    
    csvStatus.classList.remove('d-none');
}

function hideVideoInfo() {
    document.getElementById('videoInfoCard').classList.add('d-none');
}

function hideCSVStatus() {
    document.getElementById('csvStatus').classList.add('d-none');
}

function checkVideoReady() {
    const extractBtn = document.getElementById('extractBtn');
    const extractionMode = document.getElementById('extractionMode');
    const isReady = selectedVideo && selectedVideo.has_csv;
    extractBtn.disabled = !isReady;
    
    if (isReady) {
        extractionMode.classList.remove('d-none');
        updateExtractionUI(); // Update UI based on current mode
    } else {
        extractionMode.classList.add('d-none');
        document.getElementById('extractionFPS').classList.add('d-none');
    }
}

function updateExtractionUI() {
    const isTimelineMode = document.getElementById('timelineMode').checked;
    const fpsSelector = document.getElementById('extractionFPS');
    
    if (isTimelineMode) {
        fpsSelector.classList.remove('d-none');
    } else {
        fpsSelector.classList.add('d-none');
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function setupButtons() {
    document.getElementById('extractBtn').addEventListener('click', extractFrames);
    document.getElementById('clearAllBtn').addEventListener('click', clearAll);
    document.getElementById('downloadAllBtn').addEventListener('click', downloadAll);
    document.getElementById('downloadCurrentBtn').addEventListener('click', downloadCurrentFrame);
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
    document.getElementById('saveFramesBtn').addEventListener('click', saveFrames);
    document.getElementById('prevTouchBtn').addEventListener('click', previousTouch);
    document.getElementById('nextTouchBtn').addEventListener('click', nextTouch);
    
    // Setup extraction mode change handlers
    document.getElementById('touchMode').addEventListener('change', updateExtractionUI);
    document.getElementById('timelineMode').addEventListener('change', updateExtractionUI);
    
    // Setup touch editing handlers
    document.getElementById('editModeBtn').addEventListener('click', toggleEditMode);
    document.getElementById('markTouchBtn').addEventListener('click', markCurrentFrameAsTouch);
    document.getElementById('removeTouchBtn').addEventListener('click', removeCurrentTouch);
    document.getElementById('saveChangesBtn').addEventListener('click', saveCSVChanges);
    document.getElementById('discardChangesBtn').addEventListener('click', discardChanges);
}

function setupKeyboardNavigation() {
    document.addEventListener('keydown', function(e) {
        if (extractedFrames.length === 0) return;
        
        switch(e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                previousFrame();
                break;
            case 'ArrowRight':
                e.preventDefault();
                nextFrame();
                break;
            case 'f':
            case 'F':
                if (e.target.tagName !== 'INPUT') {
                    e.preventDefault();
                    toggleFullscreen();
                }
                break;
            case 'Escape':
                if (isFullscreen) {
                    e.preventDefault();
                    toggleFullscreen();
                }
                break;
        }
    });
}

function setupImageViewer() {
    // Setup navigation buttons
    document.getElementById('prevBtn').addEventListener('click', previousFrame);
    document.getElementById('nextBtn').addEventListener('click', nextFrame);
    
    // Setup main image click for zoom
    document.getElementById('mainImage').addEventListener('click', toggleZoom);
    
    // Handle fullscreen changes
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);
}

function handleFullscreenChange() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        isFullscreen = false;
        document.getElementById('fullscreenBtn').innerHTML = '<i class="fas fa-expand me-1"></i>';
    }
}

async function extractFrames() {
    if (!selectedVideo || !selectedVideo.has_csv) {
        showAlert('Please select a video with a corresponding CSV file', 'warning');
        return;
    }
    
    const extractBtn = document.getElementById('extractBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const statusMessage = document.getElementById('statusMessage');
    
    // Check which mode is selected
    const selectedMode = document.querySelector('input[name="extractionMode"]:checked').value;
    isTimelineMode = selectedMode === 'timeline';
    
    extractBtn.disabled = true;
    extractBtn.innerHTML = '<span class="loading-spinner"></span> Extracting...';
    progressContainer.classList.remove('d-none');
    statusMessage.classList.remove('d-none');
    statusMessage.innerHTML = `<i class="fas fa-info-circle"></i> Processing video in ${isTimelineMode ? 'timeline' : 'touch'} mode...`;
    
    try {
        const endpoint = isTimelineMode ? '/extract_timeline' : '/extract';
        const requestBody = {
            video_filename: selectedVideo.filename
        };
        
        // Add FPS parameter for timeline mode
        if (isTimelineMode) {
            const selectedFPS = parseFloat(document.getElementById('fpsSelector').value);
            requestBody.extraction_fps = selectedFPS;
        }
        
        const extractResponse = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!extractResponse.ok) {
            const error = await extractResponse.json();
            throw new Error(error.error || 'Extraction failed');
        }
        
        const result = await extractResponse.json();
        
        if (result.type === 'complete' || result.frames) {
            extractedFrames = result.frames;
            currentFrameIndex = 0;
            
            // Build touch frame indices for navigation
            touchFrameIndices = [];
            extractedFrames.forEach((frame, index) => {
                if (frame.is_touch || frame.body_part) {  // Check for touch frames
                    touchFrameIndices.push(index);
                }
            });
            
            initializeImageViewer();
            
            progressBar.style.width = '100%';
            progressBar.textContent = 'Complete!';
            progressBar.classList.remove('progress-bar-animated');
            progressBar.classList.add('bg-success');
            
            statusMessage.classList.remove('alert-info');
            statusMessage.classList.add('alert-success');
            const touchCount = isTimelineMode ? result.touch_frames || touchFrameIndices.length : result.frames.length;
            statusMessage.innerHTML = `<i class="fas fa-check-circle"></i> Successfully extracted ${result.frames.length} frames${isTimelineMode ? ` (${touchCount} touch events)` : ''}!`;
            
            document.getElementById('frameCount').textContent = result.frames.length;
            document.getElementById('downloadAllBtn').disabled = false;
            document.getElementById('downloadCurrentBtn').disabled = false;
            document.getElementById('fullscreenBtn').disabled = false;
            document.getElementById('saveFramesBtn').disabled = false;
            document.getElementById('editModeBtn').disabled = false;
            document.getElementById('filterSection').classList.remove('d-none');
            
            // Show/hide touch navigation buttons based on mode
            const touchNavButtons = document.querySelectorAll('#prevTouchBtn, #nextTouchBtn');
            touchNavButtons.forEach(btn => {
                if (isTimelineMode && touchFrameIndices.length > 0) {
                    btn.classList.remove('d-none');
                    btn.disabled = false;
                } else {
                    btn.classList.add('d-none');
                }
            });
            
            framesSaved = false;
            updateSaveStatus();
            
            setTimeout(() => {
                progressContainer.classList.add('d-none');
                statusMessage.classList.add('d-none');
            }, 3000);
        }
        
    } catch (error) {
        console.error('Error:', error);
        showAlert(`Error: ${error.message}`, 'danger');
        progressContainer.classList.add('d-none');
    } finally {
        extractBtn.disabled = false;
        extractBtn.innerHTML = '<i class="fas fa-cogs me-2"></i>Extract Frames';
    }
}

// Image Viewer Functions
function initializeImageViewer() {
    if (extractedFrames.length === 0) return;
    
    // Show viewer content and hide empty state
    document.querySelector('.viewer-empty').classList.add('d-none');
    document.querySelector('.viewer-content').classList.remove('d-none');
    
    // Initialize thumbnails
    createThumbnailStrip();
    
    // Show first frame
    showFrame(0);
}

function createThumbnailStrip() {
    const container = document.getElementById('thumbnailContainer');
    container.innerHTML = '';
    
    extractedFrames.forEach((frame, index) => {
        const thumbnailItem = document.createElement('div');
        thumbnailItem.className = 'thumbnail-item';
        thumbnailItem.dataset.index = index;
        
        // Add touch frame styling
        if (frame.is_touch || frame.body_part) {
            thumbnailItem.classList.add('touch-frame');
        }
        
        const img = document.createElement('img');
        img.src = frame.thumbnail;
        img.alt = `Frame ${frame.frame_number}`;
        
        const label = document.createElement('div');
        label.className = 'thumbnail-label';
        label.textContent = `#${frame.frame_number}`;
        
        // Add touch indicator icon for touch frames
        if (frame.is_touch || frame.body_part) {
            const touchIcon = document.createElement('div');
            touchIcon.className = 'touch-indicator';
            touchIcon.innerHTML = '<i class="fas fa-circle"></i>';
            thumbnailItem.appendChild(touchIcon);
        }
        
        thumbnailItem.appendChild(img);
        thumbnailItem.appendChild(label);
        
        thumbnailItem.addEventListener('click', () => showFrame(index));
        
        container.appendChild(thumbnailItem);
    });
}

function showFrame(index) {
    if (index < 0 || index >= extractedFrames.length) return;
    
    currentFrameIndex = index;
    const frame = extractedFrames[index];
    
    // Update main image
    const mainImage = document.getElementById('mainImage');
    mainImage.src = `/frame/${frame.filename}`;
    
    // Update frame info
    document.getElementById('currentFrameIndex').textContent = index + 1;
    document.getElementById('totalFrames').textContent = extractedFrames.length;
    document.getElementById('frameNumber').textContent = frame.frame_number;
    document.getElementById('frameTime').textContent = formatTime(frame.time_seconds);
    document.getElementById('frameBodyPart').textContent = frame.body_part || (frame.is_touch ? 'Touch Event' : '-');
    
    // Update thumbnail selection
    document.querySelectorAll('.thumbnail-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
    
    // Update navigation buttons
    document.getElementById('prevBtn').disabled = index === 0;
    document.getElementById('nextBtn').disabled = index === extractedFrames.length - 1;
    
    // Scroll thumbnail into view
    scrollThumbnailIntoView(index);
    
    // Update edit buttons if in edit mode
    if (editMode) {
        updateEditButtons();
    }
}

function scrollThumbnailIntoView(index) {
    const container = document.getElementById('thumbnailContainer');
    const thumbnails = container.querySelectorAll('.thumbnail-item');
    
    if (thumbnails[index]) {
        thumbnails[index].scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
        });
    }
}

function previousFrame() {
    if (currentFrameIndex > 0) {
        showFrame(currentFrameIndex - 1);
    }
}

function nextFrame() {
    if (currentFrameIndex < extractedFrames.length - 1) {
        showFrame(currentFrameIndex + 1);
    }
}

function previousTouch() {
    if (touchFrameIndices.length === 0) return;
    
    // Find the previous touch frame index
    let prevTouchIndex = -1;
    for (let i = touchFrameIndices.length - 1; i >= 0; i--) {
        if (touchFrameIndices[i] < currentFrameIndex) {
            prevTouchIndex = touchFrameIndices[i];
            break;
        }
    }
    
    // If no previous touch found, wrap to last touch
    if (prevTouchIndex === -1 && touchFrameIndices.length > 0) {
        prevTouchIndex = touchFrameIndices[touchFrameIndices.length - 1];
    }
    
    if (prevTouchIndex !== -1) {
        showFrame(prevTouchIndex);
    }
}

function nextTouch() {
    if (touchFrameIndices.length === 0) return;
    
    // Find the next touch frame index
    let nextTouchIndex = -1;
    for (let i = 0; i < touchFrameIndices.length; i++) {
        if (touchFrameIndices[i] > currentFrameIndex) {
            nextTouchIndex = touchFrameIndices[i];
            break;
        }
    }
    
    // If no next touch found, wrap to first touch
    if (nextTouchIndex === -1 && touchFrameIndices.length > 0) {
        nextTouchIndex = touchFrameIndices[0];
    }
    
    if (nextTouchIndex !== -1) {
        showFrame(nextTouchIndex);
    }
}

function toggleZoom() {
    const mainImage = document.getElementById('mainImage');
    mainImage.classList.toggle('zoomed');
}

function toggleFullscreen() {
    const imageViewer = document.getElementById('imageViewer');
    
    if (!isFullscreen) {
        if (imageViewer.requestFullscreen) {
            imageViewer.requestFullscreen();
        } else if (imageViewer.webkitRequestFullscreen) {
            imageViewer.webkitRequestFullscreen();
        } else if (imageViewer.msRequestFullscreen) {
            imageViewer.msRequestFullscreen();
        }
        isFullscreen = true;
        document.getElementById('fullscreenBtn').innerHTML = '<i class="fas fa-compress me-1"></i>';
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        isFullscreen = false;
        document.getElementById('fullscreenBtn').innerHTML = '<i class="fas fa-expand me-1"></i>';
    }
}

function downloadCurrentFrame() {
    if (extractedFrames.length > 0 && currentFrameIndex >= 0) {
        const frame = extractedFrames[currentFrameIndex];
        const link = document.createElement('a');
        link.href = `/frame/${frame.filename}`;
        link.download = `frame_${frame.frame_number}.jpg`;
        link.click();
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return `${minutes}:${secs.padStart(6, '0')}`;
}

function setupFilters() {
    const filterInput = document.getElementById('filterInput');
    const sortSelect = document.getElementById('sortSelect');
    
    filterInput.addEventListener('input', filterFrames);
    sortSelect.addEventListener('change', sortFrames);
}

function filterFrames() {
    const filterValue = document.getElementById('filterInput').value.toLowerCase();
    const frames = document.querySelectorAll('.frame-item');
    
    frames.forEach(frame => {
        const bodyPart = frame.dataset.bodyPart.toLowerCase();
        frame.style.display = bodyPart.includes(filterValue) ? '' : 'none';
    });
}

function sortFrames() {
    const sortBy = document.getElementById('sortSelect').value;
    const container = document.getElementById('framesContainer');
    const frames = Array.from(container.querySelectorAll('.frame-item'));
    
    frames.sort((a, b) => {
        switch(sortBy) {
            case 'frame':
                return parseInt(a.dataset.frameNumber) - parseInt(b.dataset.frameNumber);
            case 'time':
                return parseFloat(a.dataset.time) - parseFloat(b.dataset.time);
            case 'bodypart':
                return a.dataset.bodyPart.localeCompare(b.dataset.bodyPart);
            default:
                return 0;
        }
    });
    
    container.innerHTML = '';
    frames.forEach(frame => container.appendChild(frame));
}

async function downloadAll() {
    window.location.href = '/download_all';
}

async function clearAll() {
    let confirmMessage = 'Are you sure you want to clear all extracted frames?';
    if (!framesSaved && extractedFrames.length > 0) {
        confirmMessage = 'WARNING: Current frames are not saved! Are you sure you want to clear all extracted frames? This action cannot be undone.';
    }
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const response = await fetch('/clear', {
            method: 'POST'
        });
        
        if (response.ok) {
            // Reset the UI without reloading
            selectedVideo = null;
            extractedFrames = [];
            touchFrameIndices = [];
            isTimelineMode = false;
            currentFrameIndex = 0;
            document.getElementById('videoSelect').value = '';
            hideVideoInfo();
            hideCSVStatus();
            checkVideoReady();
            
            // Reset image viewer
            document.querySelector('.viewer-empty').classList.remove('d-none');
            document.querySelector('.viewer-content').classList.add('d-none');
            document.getElementById('thumbnailContainer').innerHTML = '';
            
            // Reset UI controls
            document.getElementById('frameCount').textContent = '0';
            document.getElementById('downloadAllBtn').disabled = true;
            document.getElementById('downloadCurrentBtn').disabled = true;
            document.getElementById('fullscreenBtn').disabled = true;
            document.getElementById('saveFramesBtn').disabled = true;
            document.getElementById('filterSection').classList.add('d-none');
            document.getElementById('prevTouchBtn').classList.add('d-none');
            document.getElementById('nextTouchBtn').classList.add('d-none');
            framesSaved = false;
            
            showAlert('All extracted frames cleared', 'success');
        }
    } catch (error) {
        showAlert('Error clearing files', 'danger');
    }
}

async function saveFrames() {
    if (!confirm('Save current frames to reviewed folder? This will preserve them from automatic cleanup.')) {
        return;
    }
    
    const saveBtn = document.getElementById('saveFramesBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="loading-spinner"></span> Saving...';
    
    try {
        const response = await fetch('/api/save_current_frames', {
            method: 'POST'
        });
        
        if (response.ok) {
            const result = await response.json();
            framesSaved = true;
            updateSaveStatus();
            showAlert(`Frames saved successfully! Location: ${result.saved_path}`, 'success');
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Save failed');
        }
    } catch (error) {
        showAlert(`Error saving frames: ${error.message}`, 'danger');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i> Save for Review';
    }
}

function updateSaveStatus() {
    const saveStatus = document.getElementById('saveStatus');
    const saveBtn = document.getElementById('saveFramesBtn');
    
    if (framesSaved) {
        saveStatus.innerHTML = '<i class="fas fa-check-circle text-success me-1"></i><span>Saved</span>';
        saveBtn.classList.remove('btn-success');
        saveBtn.classList.add('btn-secondary');
        saveBtn.innerHTML = '<i class="fas fa-check me-1"></i> Saved';
        saveBtn.disabled = true;
    } else {
        saveStatus.innerHTML = '<i class="fas fa-exclamation-triangle text-warning me-1"></i><span>Unsaved</span>';
        saveBtn.classList.remove('btn-secondary');
        saveBtn.classList.add('btn-success');
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i> Save for Review';
        saveBtn.disabled = false;
    }
}

function showAlert(message, type) {
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.className = `alert alert-${type}`;
    statusMessage.innerHTML = message;
    statusMessage.classList.remove('d-none');
    
    setTimeout(() => {
        statusMessage.classList.add('d-none');
    }, 5000);
}

// ============= TOUCH EDITING FUNCTIONS =============

async function toggleEditMode() {
    if (!selectedVideo) return;
    
    editMode = !editMode;
    const editModeBtn = document.getElementById('editModeBtn');
    const editControls = document.getElementById('editControls');
    
    if (editMode) {
        // Enter edit mode
        await loadCSVData();
        editModeBtn.innerHTML = '<i class="fas fa-times me-1"></i> Exit Edit';
        editModeBtn.classList.remove('btn-info');
        editModeBtn.classList.add('btn-warning');
        editControls.classList.remove('d-none');
        updateEditButtons();
    } else {
        // Exit edit mode
        if (pendingChanges.length > 0) {
            if (!confirm('You have unsaved changes. Are you sure you want to exit edit mode?')) {
                editMode = true; // Cancel the toggle
                return;
            }
        }
        exitEditMode();
    }
}

function exitEditMode() {
    editMode = false;
    pendingChanges = [];
    editingTouchData.clear();
    
    const editModeBtn = document.getElementById('editModeBtn');
    const editControls = document.getElementById('editControls');
    
    editModeBtn.innerHTML = '<i class="fas fa-edit me-1"></i> Edit Mode';
    editModeBtn.classList.remove('btn-warning');
    editModeBtn.classList.add('btn-info');
    editControls.classList.add('d-none');
    
    // Remove edit mode styling from thumbnails
    document.querySelectorAll('.thumbnail-item').forEach(item => {
        item.classList.remove('editable', 'pending-change');
    });
    
    updateChangesCount();
}

async function loadCSVData() {
    try {
        const response = await fetch('/api/load_csv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_filename: selectedVideo.filename
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            originalCSVData = result.csv_data;
            
            // Initialize editing touch data
            editingTouchData.clear();
            originalCSVData.forEach(touch => {
                editingTouchData.set(touch['Frame Number'], {
                    'Frame Number': touch['Frame Number'],
                    'Time (seconds)': touch['Time (seconds)'],
                    'Body Part': touch['Body Part'],
                    'Timestamp': touch['Timestamp']
                });
            });
            
            showAlert(`Loaded ${result.total_touches} touch annotations for editing`, 'info');
        } else {
            const error = await response.json();
            showAlert(`Error loading CSV: ${error.error}`, 'danger');
        }
    } catch (error) {
        showAlert(`Error loading CSV data: ${error.message}`, 'danger');
    }
}

function markCurrentFrameAsTouch() {
    if (!editMode || currentFrameIndex < 0 || currentFrameIndex >= extractedFrames.length) return;
    
    const frame = extractedFrames[currentFrameIndex];
    const frameNumber = frame.frame_number;
    const bodyPart = document.getElementById('bodyPartSelect').value;
    
    if (editingTouchData.has(frameNumber)) {
        showAlert(`Frame ${frameNumber} is already marked as a touch`, 'warning');
        return;
    }
    
    // Add new touch
    const newTouch = {
        'Frame Number': frameNumber,
        'Time (seconds)': frame.time_seconds,
        'Body Part': bodyPart,
        'Timestamp': new Date().toISOString()
    };
    
    editingTouchData.set(frameNumber, newTouch);
    pendingChanges.push({
        type: 'add',
        frame_number: frameNumber,
        data: newTouch
    });
    
    // Update UI
    updateThumbnailEditState(currentFrameIndex, true);
    updateEditButtons();
    updateChangesCount();
    showAlert(`Marked frame ${frameNumber} as ${bodyPart} touch`, 'success');
}

function removeCurrentTouch() {
    if (!editMode || currentFrameIndex < 0 || currentFrameIndex >= extractedFrames.length) return;
    
    const frame = extractedFrames[currentFrameIndex];
    const frameNumber = frame.frame_number;
    
    if (!editingTouchData.has(frameNumber)) {
        showAlert(`Frame ${frameNumber} is not marked as a touch`, 'warning');
        return;
    }
    
    // Remove touch
    editingTouchData.delete(frameNumber);
    pendingChanges.push({
        type: 'remove',
        frame_number: frameNumber
    });
    
    // Update UI
    updateThumbnailEditState(currentFrameIndex, false);
    updateEditButtons();
    updateChangesCount();
    showAlert(`Removed touch from frame ${frameNumber}`, 'success');
}

function updateEditButtons() {
    if (!editMode) return;
    
    const frame = extractedFrames[currentFrameIndex];
    const isCurrentTouch = editingTouchData.has(frame.frame_number);
    
    document.getElementById('markTouchBtn').disabled = isCurrentTouch;
    document.getElementById('removeTouchBtn').disabled = !isCurrentTouch;
    document.getElementById('saveChangesBtn').disabled = pendingChanges.length === 0;
}

function updateThumbnailEditState(frameIndex, isTouch) {
    const thumbnails = document.querySelectorAll('.thumbnail-item');
    if (thumbnails[frameIndex]) {
        const thumbnail = thumbnails[frameIndex];
        thumbnail.classList.add('pending-change');
        
        if (isTouch) {
            thumbnail.classList.add('touch-frame');
        } else {
            thumbnail.classList.remove('touch-frame');
        }
    }
}

function updateChangesCount() {
    document.getElementById('changesCount').textContent = `${pendingChanges.length} changes`;
}

async function saveCSVChanges() {
    if (pendingChanges.length === 0) {
        showAlert('No changes to save', 'info');
        return;
    }
    
    const saveBtn = document.getElementById('saveChangesBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="loading-spinner"></span> Saving...';
    
    try {
        // Convert Map to array for API
        const touchData = Array.from(editingTouchData.values());
        
        const response = await fetch('/api/save_csv_changes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_filename: selectedVideo.filename,
                touch_data: touchData
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            pendingChanges = [];
            
            // Remove pending change styling
            document.querySelectorAll('.pending-change').forEach(item => {
                item.classList.remove('pending-change');
            });
            
            updateChangesCount();
            showAlert(`Successfully saved ${result.saved_touches} touch annotations to CSV`, 'success');
            
            // Re-extract frames to reflect changes
            if (confirm('CSV updated! Re-extract frames to see changes?')) {
                exitEditMode();
                await extractFrames();
            }
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Save failed');
        }
    } catch (error) {
        showAlert(`Error saving changes: ${error.message}`, 'danger');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i> Save CSV';
    }
}

function discardChanges() {
    if (pendingChanges.length === 0) {
        exitEditMode();
        return;
    }
    
    if (confirm(`Discard ${pendingChanges.length} unsaved changes?`)) {
        exitEditMode();
    }
}