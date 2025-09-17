// Simple LRU Cache for frames to prevent memory overflow
class SimpleFrameCache {
    constructor(maxSize = 50) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    has(key) {
        return this.cache.has(key);
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        // Move to end (most recently used)
        const value = this.cache.get(key);
        if (value == null) {
            // Remove invalid entry
            this.cache.delete(key);
            return null;
        }
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            console.log(`Frame cache: evicted frame ${firstKey} (at capacity ${this.maxSize})`);
        }
        // Add/update
        this.cache.delete(key);
        this.cache.set(key, value);

        // Update cache status display
        if (typeof updateCacheStatus === 'function') {
            updateCacheStatus();
        }
    }

    clear() {
        const size = this.cache.size;
        this.cache.clear();
        if (size > 0) {
            console.log(`Frame cache: cleared ${size} frames`);
        }

        // Update cache status display
        if (typeof updateCacheStatus === 'function') {
            updateCacheStatus();
        }
    }

    get size() {
        return this.cache.size;
    }
}

function updateCacheStatus() {
    const cacheStatusElement = document.getElementById('cacheStatus');
    if (cacheStatusElement) {
        const currentSize = frameCache.size;
        const maxSize = frameCache.maxSize;
        cacheStatusElement.textContent = `${currentSize}/${maxSize} frames`;

        // Add color coding based on cache usage
        const parent = cacheStatusElement.parentElement;
        parent.className = 'text-light';
        if (currentSize >= maxSize * 0.9) {
            parent.className = 'text-warning'; // Near capacity
        } else if (currentSize >= maxSize) {
            parent.className = 'text-danger'; // At capacity
        }
    }
}

let currentFrame = 0;
let videoInfo = null;
let annotations = [];
let abortController = null;
let frameCache = new SimpleFrameCache(50); // Limit to 50 frames
let continuousNavInterval = null;
let isLoadingFrame = false;

document.addEventListener('DOMContentLoaded', function() {
    setupUpload();
    setupVideoDropdown();
    setupCsvPanel();
    setupLiveAnnotation();
    setupNavigation();
    setupAnnotation();
    setupKeyboardShortcuts();
    setupClearButton();
    setupCacheCleanup();
});

function setupCacheCleanup() {
    // Clean up cache on page unload
    window.addEventListener('beforeunload', () => {
        clearFrameCache();
    });
    
    // Clean up cache when page becomes hidden (tab switch, minimize, etc.)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Optional: clear cache when tab becomes hidden
            // Uncomment if you want more aggressive cleanup
            // clearFrameCache();
        }
    });
    
    // Clean up cache on page reload
    window.addEventListener('unload', () => {
        clearFrameCache();
    });
}

function clearFrameCache() {
    if (frameCache && frameCache.size > 0) {
        frameCache.clear();
    }

    // Cancel any in-flight requests
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
}

function setupUpload() {
    const uploadZone = document.getElementById('videoUploadZone');
    const videoInput = document.getElementById('videoInput');
    
    uploadZone.addEventListener('click', () => videoInput.click());
    
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });
    
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleVideoUpload(files[0]);
        }
    });
    
    videoInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleVideoUpload(e.target.files[0]);
        }
    });
}

function setupVideoDropdown() {
    const videoSelect = document.getElementById('videoSelect');

    if (!videoSelect) return;

    // Load videos from data folder on page load
    loadVideosFromDataFolder();

    // Handle video selection
    videoSelect.addEventListener('change', async (e) => {
        const selectedVideo = e.target.value;
        if (selectedVideo) {
            await handleVideoSelection(selectedVideo);
        }
    });
}

async function loadVideosFromDataFolder() {
    const videoSelect = document.getElementById('videoSelect');

    try {
        const response = await fetch('/api/videos');

        if (!response.ok) {
            throw new Error('Failed to load videos');
        }

        const result = await response.json();
        const videos = result.videos;

        // Clear existing options
        videoSelect.innerHTML = '<option value="">Select a video from data folder...</option>';

        if (videos.length === 0) {
            videoSelect.innerHTML += '<option value="" disabled>No videos found in data folder</option>';
            return;
        }

        // Add video options
        videos.forEach(video => {
            const option = document.createElement('option');
            option.value = video.filename;
            option.textContent = `${video.filename}${video.has_csv ? ' ✓' : ' (no CSV)'}`;
            if (video.video_info && video.video_info.duration) {
                option.textContent += ` - ${video.video_info.duration}s`;
            }
            videoSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading videos:', error);
        videoSelect.innerHTML = '<option value="">Error loading videos</option>';
    }
}

async function handleVideoSelection(videoFilename) {
    const uploadStatus = document.getElementById('uploadStatus');

    try {
        // Show loading status
        uploadStatus.innerHTML = `
            <div class="alert alert-info">
                <span class="spinner-border spinner-border-sm me-2"></span>
                Loading video: ${videoFilename}...
            </div>
        `;

        // Check if video has corresponding CSV
        const csvResponse = await fetch(`/api/check_csv/${videoFilename}`);
        const csvResult = await csvResponse.json();

        if (!csvResult.has_csv) {
            uploadStatus.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Video selected, but no corresponding CSV file found.
                    Please ensure there's a CSV file named "${csvResult.csv_filename}" in the csv folder.
                </div>
            `;
            return;
        }

        // Get video metadata
        const videoResponse = await fetch('/api/videos');
        const videoResult = await videoResponse.json();
        const selectedVideoInfo = videoResult.videos.find(v => v.filename === videoFilename);

        if (!selectedVideoInfo) {
            throw new Error('Video not found');
        }

        // Set up video info compatible with existing annotation system
        videoInfo = {
            filename: videoFilename,
            fps: selectedVideoInfo.video_info.fps,
            total_frames: selectedVideoInfo.video_info.total_frames,
            width: selectedVideoInfo.video_info.width,
            height: selectedVideoInfo.video_info.height,
            duration: selectedVideoInfo.video_info.duration
        };

        // Load video into backend session for frame extraction
        const sessionResponse = await fetch('/api/load_data_video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_filename: videoFilename
            })
        });

        if (!sessionResponse.ok) {
            const sessionError = await sessionResponse.json();
            throw new Error(sessionError.error || 'Failed to load video into session');
        }

        console.log('Video loaded into backend session for frame extraction');

        // Initialize annotation interface
        initializeAnnotationInterface();

        // Load CSV data
        await loadCsvData(videoFilename);

        uploadStatus.innerHTML = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                Video "${videoFilename}" loaded successfully!
                <br><small>CSV file: ${csvResult.csv_filename} (${csvResult.annotation_count} annotations)</small>
            </div>
        `;

        setTimeout(() => {
            uploadStatus.innerHTML = '';
        }, 3000);

    } catch (error) {
        console.error('Error loading video:', error);
        uploadStatus.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Error loading video: ${error.message}
            </div>
        `;
    }
}

function setupCsvPanel() {
    const refreshCsvBtn = document.getElementById('refreshCsvBtn');

    if (refreshCsvBtn) {
        refreshCsvBtn.addEventListener('click', () => {
            if (videoInfo && videoInfo.filename) {
                loadCsvData(videoInfo.filename);
            }
        });
    }
}

async function loadCsvData(videoFilename) {
    const csvPanel = document.getElementById('csvPanel');
    const csvLoadingIndicator = document.getElementById('csvLoadingIndicator');
    const csvEmptyState = document.getElementById('csvEmptyState');
    const csvTableContainer = document.getElementById('csvTableContainer');
    const csvRowCount = document.getElementById('csvRowCount');

    try {
        // Show loading state
        csvLoadingIndicator.classList.remove('d-none');
        csvEmptyState.classList.add('d-none');
        csvTableContainer.classList.add('d-none');
        csvPanel.classList.remove('d-none');

        // Load CSV data using existing endpoint
        const response = await fetch('/api/load_csv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_filename: videoFilename
            })
        });

        if (!response.ok) {
            throw new Error('Failed to load CSV data');
        }

        const result = await response.json();

        if (result.success && result.csv_data && result.csv_data.length > 0) {
            displayCsvData(result.csv_data);
            csvRowCount.textContent = result.csv_data.length;
        } else {
            showCsvEmptyState();
        }

    } catch (error) {
        console.error('Error loading CSV data:', error);
        showCsvEmptyState();
        csvRowCount.textContent = '0';
    } finally {
        csvLoadingIndicator.classList.add('d-none');
    }
}

function displayCsvData(csvData) {
    const csvTableHeaders = document.getElementById('csvTableHeaders');
    const csvTableBody = document.getElementById('csvTableBody');
    const csvTableContainer = document.getElementById('csvTableContainer');
    const csvEmptyState = document.getElementById('csvEmptyState');

    if (!csvData || csvData.length === 0) {
        showCsvEmptyState();
        return;
    }

    // Show table container
    csvTableContainer.classList.remove('d-none');
    csvEmptyState.classList.add('d-none');

    // Get headers from first row
    const headers = Object.keys(csvData[0]);

    // Populate headers
    csvTableHeaders.innerHTML = '';
    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        th.style.whiteSpace = 'nowrap';
        csvTableHeaders.appendChild(th);
    });

    // Add action column header
    const actionTh = document.createElement('th');
    actionTh.textContent = 'Actions';
    actionTh.style.width = '80px';
    csvTableHeaders.appendChild(actionTh);

    // Populate rows
    csvTableBody.innerHTML = '';
    csvData.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';

        // Add hover effect
        tr.addEventListener('mouseenter', () => {
            tr.classList.add('table-active');
        });
        tr.addEventListener('mouseleave', () => {
            tr.classList.remove('table-active');
        });

        // Add data cells
        headers.forEach(header => {
            const td = document.createElement('td');
            let value = row[header];

            // Format specific columns
            if (header === 'Time (seconds)' && typeof value === 'number') {
                value = value.toFixed(3);
            } else if (header === 'Frame Number') {
                // Make frame number clickable
                td.innerHTML = `<button class="btn btn-link btn-sm p-0" onclick="goToFrame(${value})">${value}</button>`;
                tr.appendChild(td);
                return;
            }

            td.textContent = value;
            td.style.whiteSpace = 'nowrap';
            tr.appendChild(td);
        });

        // Add action buttons
        const actionTd = document.createElement('td');
        actionTd.innerHTML = `
            <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary btn-sm" onclick="goToFrame(${row['Frame Number']})" title="Go to frame">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
        `;
        tr.appendChild(actionTd);

        csvTableBody.appendChild(tr);
    });
}

function showCsvEmptyState() {
    const csvTableContainer = document.getElementById('csvTableContainer');
    const csvEmptyState = document.getElementById('csvEmptyState');

    csvTableContainer.classList.add('d-none');
    csvEmptyState.classList.remove('d-none');
}

// Global function to navigate to a specific frame from CSV
window.goToFrame = function(frameNumber) {
    if (videoInfo && frameNumber >= 0 && frameNumber < videoInfo.total_frames) {
        loadFrame(frameNumber);

        // Highlight the row in CSV table
        highlightCsvRow(frameNumber);
    }
};

function highlightCsvRow(frameNumber) {
    // Remove existing highlights
    const allRows = document.querySelectorAll('#csvTableBody tr');
    allRows.forEach(row => row.classList.remove('table-warning'));

    // Find and highlight the row with matching frame number
    allRows.forEach(row => {
        const frameCell = row.querySelector('td button');
        if (frameCell && parseInt(frameCell.textContent) === frameNumber) {
            row.classList.add('table-warning');
            // Scroll to the highlighted row
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
}

// Live Annotation Functions
function setupLiveAnnotation() {
    const deleteTouchBtn = document.getElementById('deleteTouchBtn');

    if (deleteTouchBtn) {
        deleteTouchBtn.addEventListener('click', handleDeleteTouch);
    }
}

function handleDeleteTouch() {
    // Use live annotation for data folder videos, session annotation for uploads
    if (videoInfo && videoInfo.filename) {
        deleteLiveAnnotation();
    } else {
        // For session-based, check if annotation exists and remove it
        if (annotations.some(a => a.frame_number === currentFrame)) {
            removeAnnotation(currentFrame);
        }
    }
}

async function addLiveAnnotation() {
    if (!videoInfo || !videoInfo.filename) {
        showAlert('No video loaded', 'warning');
        return;
    }

    const bodyPart = document.getElementById('bodyPartSelect').value;
    const eventType = document.getElementById('eventTypeSelect').value;
    const markTouchBtn = document.getElementById('markTouchBtn');

    try {
        // Show loading state
        markTouchBtn.disabled = true;
        markTouchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Adding...';

        const response = await fetch('/api/add_touch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_filename: videoInfo.filename,
                frame_number: currentFrame,
                body_part: bodyPart,
                event_type: eventType
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add annotation');
        }

        const result = await response.json();

        // Update CSV display immediately
        await loadCsvData(videoInfo.filename);

        // Update current frame annotation badge
        updateCurrentFrameAnnotation();

        // Show success feedback
        markTouchBtn.classList.remove('btn-success');
        markTouchBtn.classList.add('btn-info');
        markTouchBtn.innerHTML = '<i class="fas fa-check me-2"></i>Added!';

        // Highlight the new row in CSV
        setTimeout(() => {
            highlightCsvRow(currentFrame);
            flashCsvRow(currentFrame, 'success');
        }, 100);

        // Show save confirmation
        showSaveConfirmation(`Annotation saved to CSV for frame ${currentFrame}`);

        // Reset button after delay
        setTimeout(() => {
            markTouchBtn.classList.remove('btn-info');
            markTouchBtn.classList.add('btn-success');
            markTouchBtn.innerHTML = '<i class="fas fa-plus-circle me-2"></i>Add Annotation';
        }, 1500);

        showAlert(`Annotation added for frame ${currentFrame}`, 'success');

    } catch (error) {
        console.error('Error adding annotation:', error);
        showAlert(error.message, 'danger');
    } finally {
        markTouchBtn.disabled = false;
        if (markTouchBtn.innerHTML.includes('Adding...')) {
            markTouchBtn.innerHTML = '<i class="fas fa-plus-circle me-2"></i>Add Annotation';
        }
    }
}

async function deleteLiveAnnotation() {
    if (!videoInfo || !videoInfo.filename) {
        showAlert('No video loaded', 'warning');
        return;
    }

    const deleteTouchBtn = document.getElementById('deleteTouchBtn');

    // Check if annotation exists for current frame
    if (!hasAnnotationAtFrame(currentFrame)) {
        showAlert(`No annotation found for frame ${currentFrame}`, 'warning');
        return;
    }

    try {
        // Show loading state
        deleteTouchBtn.disabled = true;
        deleteTouchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Deleting...';

        const response = await fetch('/api/delete_touch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_filename: videoInfo.filename,
                frame_number: currentFrame
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete annotation');
        }

        const result = await response.json();

        // Flash the row before removing it
        flashCsvRow(currentFrame, 'danger');

        // Update CSV display after a short delay
        setTimeout(async () => {
            await loadCsvData(videoInfo.filename);
            updateCurrentFrameAnnotation();
        }, 500);

        // Show success feedback
        deleteTouchBtn.classList.remove('btn-danger');
        deleteTouchBtn.classList.add('btn-warning');
        deleteTouchBtn.innerHTML = '<i class="fas fa-check me-2"></i>Deleted!';

        // Show save confirmation
        showSaveConfirmation(`Annotation removed from CSV for frame ${currentFrame}`);

        // Reset button after delay
        setTimeout(() => {
            deleteTouchBtn.classList.remove('btn-warning');
            deleteTouchBtn.classList.add('btn-danger');
            deleteTouchBtn.innerHTML = '<i class="fas fa-trash me-2"></i>Delete Annotation';
        }, 1500);

        showAlert(`Annotation deleted for frame ${currentFrame}`, 'success');

    } catch (error) {
        console.error('Error deleting annotation:', error);
        showAlert(error.message, 'danger');
    } finally {
        deleteTouchBtn.disabled = false;
        if (deleteTouchBtn.innerHTML.includes('Deleting...')) {
            deleteTouchBtn.innerHTML = '<i class="fas fa-trash me-2"></i>Delete Annotation';
        }
    }
}

function hasAnnotationAtFrame(frameNumber) {
    const csvTableBody = document.getElementById('csvTableBody');
    if (!csvTableBody) return false;

    const rows = csvTableBody.querySelectorAll('tr');
    for (const row of rows) {
        const frameCell = row.querySelector('td button');
        if (frameCell && parseInt(frameCell.textContent) === frameNumber) {
            return true;
        }
    }
    return false;
}

function updateCurrentFrameAnnotation() {
    const annotationBadge = document.getElementById('currentFrameAnnotation');
    if (!annotationBadge) return;

    if (hasAnnotationAtFrame(currentFrame)) {
        annotationBadge.textContent = `Frame ${currentFrame} annotated`;
        annotationBadge.className = 'badge bg-success';
    } else {
        annotationBadge.textContent = 'No annotation';
        annotationBadge.className = 'badge bg-secondary';
    }
}

function flashCsvRow(frameNumber, type = 'success') {
    const allRows = document.querySelectorAll('#csvTableBody tr');

    allRows.forEach(row => {
        const frameCell = row.querySelector('td button');
        if (frameCell && parseInt(frameCell.textContent) === frameNumber) {
            const flashClass = type === 'success' ? 'table-success' : 'table-danger';
            row.classList.add(flashClass);

            setTimeout(() => {
                row.classList.remove(flashClass);
            }, 1000);
        }
    });
}

// Panel Management Functions
function hideSessionAnnotationsPanel() {
    const annotationsPanel = document.getElementById('sessionAnnotationsPanel');
    if (annotationsPanel) {
        annotationsPanel.style.display = 'none';
    }
}

function showSessionAnnotationsPanel() {
    const annotationsPanel = document.getElementById('sessionAnnotationsPanel');
    if (annotationsPanel) {
        annotationsPanel.style.display = 'block';
    }
}

function showCsvPanel() {
    const csvPanel = document.getElementById('csvPanel');
    if (csvPanel) {
        csvPanel.classList.remove('d-none');
    }
}

function hideCsvPanel() {
    const csvPanel = document.getElementById('csvPanel');
    if (csvPanel) {
        csvPanel.classList.add('d-none');
    }
}

function showAutoSaveStatus() {
    // Show the auto-save indicator in annotation controls
    const autoSaveIndicator = document.querySelector('.annotation-controls small');
    if (autoSaveIndicator) {
        autoSaveIndicator.style.display = 'block';
    }

    // Show CSV file path
    const csvFilePathElement = document.getElementById('csvFilePath');
    if (csvFilePathElement && videoInfo && videoInfo.filename) {
        const baseName = videoInfo.filename.split('.')[0];
        csvFilePathElement.textContent = `Saving to: csv/${baseName}.csv`;
        csvFilePathElement.style.display = 'block';
    }

    // Add save status indicator to CSV panel header
    const csvHeader = document.querySelector('#csvPanel .card-header h6');
    if (csvHeader && !csvHeader.querySelector('.auto-save-badge')) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-success ms-2 auto-save-badge';
        badge.innerHTML = '<i class="fas fa-check me-1"></i>Auto-save ON';
        csvHeader.appendChild(badge);
    }
}

function hideAutoSaveStatus() {
    const autoSaveIndicator = document.querySelector('.annotation-controls small');
    if (autoSaveIndicator) {
        autoSaveIndicator.style.display = 'none';
    }

    const csvFilePathElement = document.getElementById('csvFilePath');
    if (csvFilePathElement) {
        csvFilePathElement.style.display = 'none';
    }

    const autoSaveBadge = document.querySelector('.auto-save-badge');
    if (autoSaveBadge) {
        autoSaveBadge.remove();
    }
}

function showSaveConfirmation(message) {
    // Update the auto-save badge temporarily to show save confirmation
    const autoSaveBadge = document.querySelector('.auto-save-badge');
    if (autoSaveBadge) {
        const originalText = autoSaveBadge.innerHTML;
        autoSaveBadge.innerHTML = '<i class="fas fa-save me-1"></i>SAVED';
        autoSaveBadge.className = 'badge bg-primary ms-2 auto-save-badge';

        // Reset after 2 seconds
        setTimeout(() => {
            autoSaveBadge.innerHTML = originalText;
            autoSaveBadge.className = 'badge bg-success ms-2 auto-save-badge';
        }, 2000);
    }

    // Show detailed save confirmation in CSV panel
    const csvPanel = document.getElementById('csvPanel');
    if (csvPanel) {
        // Create or update save confirmation indicator
        let saveIndicator = csvPanel.querySelector('.save-confirmation');
        if (!saveIndicator) {
            saveIndicator = document.createElement('div');
            saveIndicator.className = 'save-confirmation alert alert-success alert-sm m-2';
            saveIndicator.style.display = 'none';
            csvPanel.appendChild(saveIndicator);
        }

        saveIndicator.innerHTML = `<i class="fas fa-check-circle me-2"></i>${message}`;
        saveIndicator.style.display = 'block';

        // Hide after 3 seconds
        setTimeout(() => {
            saveIndicator.style.display = 'none';
        }, 3000);
    }
}

async function handleVideoUpload(file) {
    const uploadStatus = document.getElementById('uploadStatus');
    
    // Validate file type
    const validTypes = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-matroska', 'video/webm'];
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (!validTypes.some(type => file.type.includes(type)) && 
        !['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(extension)) {
        showStatus('Please select a valid video file', 'danger');
        return;
    }
    
    // Show uploading status
    uploadStatus.innerHTML = `
        <div class="alert alert-info">
            <span class="spinner-border spinner-border-sm me-2"></span>
            Uploading and processing video...
        </div>
    `;
    
    const formData = new FormData();
    formData.append('video', file);
    
    try {
        const response = await fetch('/upload_video', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }
        
        const result = await response.json();
        videoInfo = result.video_info;
        
        // Initialize annotation interface
        initializeAnnotationInterface();
        
        uploadStatus.innerHTML = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                Video loaded successfully!
            </div>
        `;
        
        setTimeout(() => {
            uploadStatus.innerHTML = '';
        }, 2000);
        
    } catch (error) {
        uploadStatus.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                ${error.message}
            </div>
        `;
    }
}

function initializeAnnotationInterface() {
    // Clear frame cache for new video
    frameCache.clear();

    // Hide upload section, show annotation section
    document.getElementById('uploadSection').classList.add('d-none');
    document.getElementById('annotationSection').classList.remove('d-none');

    // Set video info
    document.getElementById('totalFrames').textContent = videoInfo.total_frames - 1;
    document.getElementById('frameSlider').max = videoInfo.total_frames - 1;
    document.getElementById('frameInput').max = videoInfo.total_frames - 1;

    // Determine if we're using data folder videos or session uploads
    const isDataFolderVideo = videoInfo && videoInfo.filename;

    // Show appropriate annotation panels
    if (isDataFolderVideo) {
        // Hide session-based annotations panel, show CSV panel
        hideSessionAnnotationsPanel();
        showCsvPanel();
        showAutoSaveStatus();
    } else {
        // Show session-based annotations panel, hide CSV panel
        showSessionAnnotationsPanel();
        hideCsvPanel();
        hideAutoSaveStatus();
        // Load existing session annotations
        loadAnnotations();
    }

    // Load first frame immediately
    loadFrame(0);
}

async function loadFrame(frameNumber) {
    if (frameNumber < 0 || frameNumber >= videoInfo.total_frames) {
        return Promise.resolve(false);
    }
    
    // Update current frame and UI
    currentFrame = frameNumber;
    document.getElementById('currentFrame').textContent = frameNumber;
    document.getElementById('frameSlider').value = frameNumber;
    document.getElementById('frameInput').value = frameNumber;
    document.getElementById('currentTime').textContent = (frameNumber / videoInfo.fps).toFixed(3);

    // Update annotation badge for current frame
    updateCurrentFrameAnnotation();
    
    // Check cache first
    if (frameCache.has(frameNumber)) {
        const cachedFrame = frameCache.get(frameNumber);
        if (cachedFrame) {
            document.getElementById('frameDisplay').src = cachedFrame;
            console.log(`Frame ${frameNumber} loaded from cache`);
            highlightIfAnnotated(frameNumber);
            preloadAdjacentFrames(frameNumber);
            return Promise.resolve(true);
        }
        // If cached frame is null/undefined, remove from cache and load fresh
        console.warn(`Frame ${frameNumber} in cache but data is invalid, reloading`);
        frameCache.cache.delete(frameNumber);
    }
    
    // Cancel any in-flight requests
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    
    // Show loading
    document.getElementById('loadingIndicator').classList.remove('d-none');
    
    // Create new abort controller for this request
    abortController = new AbortController();
    isLoadingFrame = true;
    
    return new Promise(async (resolve) => {
        try {
            const response = await fetch(`/get_frame/${frameNumber}`, {
                signal: abortController.signal
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to load frame');
            }

            const result = await response.json();

            // Validate frame data
            if (!result.frame || !result.frame.startsWith('data:image/')) {
                console.error('Invalid frame data received:', result);
                throw new Error('Invalid frame data from server');
            }

            // Cache the frame
            frameCache.set(frameNumber, result.frame);

            // Display frame
            document.getElementById('frameDisplay').src = result.frame;
            console.log(`Frame ${frameNumber} loaded and displayed`);

            // Check if this frame is annotated
            highlightIfAnnotated(frameNumber);

            // Pre-load adjacent frames
            preloadAdjacentFrames(frameNumber);

            resolve(true);
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error loading frame:', error);
            }
            resolve(false);
        } finally {
            document.getElementById('loadingIndicator').classList.add('d-none');
            abortController = null;
            isLoadingFrame = false;
        }
    });
}


async function preloadAdjacentFrames(frameNumber) {
    // Pre-load 5 frames before and after current frame for smoother navigation
    const framesToPreload = [];

    // Add frames ±5 around current position
    for (let i = -5; i <= 5; i++) {
        if (i !== 0) { // Skip current frame (already loaded)
            framesToPreload.push(frameNumber + i);
        }
    }

    for (const frame of framesToPreload) {
        if (frame >= 0 && frame < videoInfo.total_frames && !frameCache.has(frame)) {
            // Load in background without UI updates
            fetch(`/get_frame/${frame}`)
                .then(response => response.json())
                .then(result => {
                    frameCache.set(frame, result.frame);
                })
                .catch(() => {}); // Ignore errors for preloading
        }
    }
}

function setupNavigation() {
    // Previous/Next buttons
    document.getElementById('prevFrameBtn').addEventListener('click', () => {
        loadFrame(currentFrame - 1);
    });
    
    document.getElementById('nextFrameBtn').addEventListener('click', () => {
        loadFrame(currentFrame + 1);
    });
    
    // Frame input
    document.getElementById('goToFrameBtn').addEventListener('click', () => {
        const frameNum = parseInt(document.getElementById('frameInput').value);
        loadFrame(frameNum);
    });
    
    document.getElementById('frameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const frameNum = parseInt(e.target.value);
            loadFrame(frameNum);
        }
    });
    
    // Frame slider
    let sliderTimer = null;
    document.getElementById('frameSlider').addEventListener('input', (e) => {
        const frameNum = parseInt(e.target.value);
        
        // Clear existing timer
        if (sliderTimer) {
            clearTimeout(sliderTimer);
        }
        
        // Update UI immediately
        document.getElementById('currentFrame').textContent = frameNum;
        document.getElementById('currentTime').textContent = (frameNum / videoInfo.fps).toFixed(3);
        
        // Debounce the actual frame load
        sliderTimer = setTimeout(() => {
            loadFrame(frameNum);
        }, 100);
    });
}

function setupAnnotation() {
    // Setup session-based annotation (only when not using data folder videos)
    document.getElementById('markTouchBtn').addEventListener('click', handleMarkTouch);
    document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
}

function handleMarkTouch() {
    // Use live annotation for data folder videos, session annotation for uploads
    if (videoInfo && videoInfo.filename) {
        addLiveAnnotation();
    } else {
        markTouch();
    }
}

async function markTouch() {
    const bodyPart = document.getElementById('bodyPartSelect').value;
    
    try {
        const response = await fetch('/add_annotation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                frame_number: currentFrame,
                body_part: bodyPart
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add annotation');
        }
        
        const result = await response.json();
        
        // Reload annotations list
        loadAnnotations();
        
        // Show success feedback
        const btn = document.getElementById('markTouchBtn');
        btn.classList.remove('btn-success');
        btn.classList.add('btn-info');
        btn.innerHTML = '<i class="fas fa-check me-2"></i>Marked!';
        
        setTimeout(() => {
            btn.classList.remove('btn-info');
            btn.classList.add('btn-success');
            btn.innerHTML = '<i class="fas fa-check-circle me-2"></i>Mark Touch';
        }, 500);
        
        // Highlight frame
        highlightIfAnnotated(currentFrame);
        
    } catch (error) {
        console.error('Error adding annotation:', error);
        showAlert('Error adding annotation', 'danger');
    }
}

async function loadAnnotations() {
    try {
        const response = await fetch('/get_annotations');
        
        if (!response.ok) {
            throw new Error('Failed to load annotations');
        }
        
        const result = await response.json();
        annotations = result.annotations;
        
        displayAnnotations();
        
    } catch (error) {
        console.error('Error loading annotations:', error);
    }
}

function displayAnnotations() {
    const container = document.getElementById('annotationsList');
    const count = document.getElementById('annotationCount');
    const exportBtn = document.getElementById('exportCsvBtn');
    
    count.textContent = annotations.length;
    exportBtn.disabled = annotations.length === 0;
    
    if (annotations.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="fas fa-clipboard-list fa-3x mb-3"></i>
                <p>No annotations yet</p>
                <small>Navigate to a frame and mark touches</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    annotations.forEach(annotation => {
        const div = document.createElement('div');
        div.className = 'annotation-item mb-2 p-2 border rounded';
        div.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <strong>Frame ${annotation.frame_number}</strong>
                    <br>
                    <small class="text-muted">${annotation.time_seconds.toFixed(3)}s</small>
                    <br>
                    <span class="badge bg-primary">${annotation.body_part}</span>
                </div>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-primary" onclick="goToAnnotation(${annotation.frame_number})">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="removeAnnotation(${annotation.frame_number})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

function goToAnnotation(frameNumber) {
    loadFrame(frameNumber);
}

async function removeAnnotation(frameNumber) {
    try {
        const response = await fetch('/remove_annotation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                frame_number: frameNumber
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to remove annotation');
        }
        
        // Reload annotations
        loadAnnotations();
        
        // Update highlight if current frame
        if (frameNumber === currentFrame) {
            highlightIfAnnotated(currentFrame);
        }
        
    } catch (error) {
        console.error('Error removing annotation:', error);
        showAlert('Error removing annotation', 'danger');
    }
}

function highlightIfAnnotated(frameNumber) {
    const isAnnotated = annotations.some(a => a.frame_number === frameNumber);
    const frameDisplay = document.getElementById('frameDisplay');
    
    if (isAnnotated) {
        frameDisplay.style.border = '3px solid #28a745';
    } else {
        frameDisplay.style.border = 'none';
    }
}

async function exportCsv() {
    window.location.href = '/export_csv';
}

function setupKeyboardShortcuts() {
    
    // Handle key release to stop navigation
    document.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            // Stop continuous navigation
            if (continuousNavInterval) {
                clearInterval(continuousNavInterval);
                continuousNavInterval = null;
            }
            
            // Cancel any in-flight requests
            if (abortController) {
                abortController.abort();
                abortController = null;
            }
            
            isLoadingFrame = false;
        }
    });
    
    document.addEventListener('keydown', (e) => {
        // Only work when annotation section is visible
        if (document.getElementById('annotationSection').classList.contains('d-none')) {
            return;
        }
        
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT') {
            return;
        }
        
        switch(e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                
                if (!e.repeat) {
                    // Single tap - move exactly one frame
                    if (continuousNavInterval) {
                        clearInterval(continuousNavInterval);
                        continuousNavInterval = null;
                    }
                    
                    if (currentFrame > 0) {
                        loadFrame(currentFrame - 1);
                    }
                } else {
                    // Key is being held - start continuous navigation
                    if (!continuousNavInterval) {
                        continuousNavInterval = setInterval(async () => {
                            if (currentFrame > 0 && !isLoadingFrame) {
                                await loadFrame(currentFrame - 1);
                            }
                        }, 100); // Navigate every 100ms
                    }
                }
                break;
                
            case 'ArrowRight':
                e.preventDefault();
                
                if (!e.repeat) {
                    // Single tap - move exactly one frame
                    if (continuousNavInterval) {
                        clearInterval(continuousNavInterval);
                        continuousNavInterval = null;
                    }
                    
                    if (currentFrame < videoInfo.total_frames - 1) {
                        loadFrame(currentFrame + 1);
                    }
                } else {
                    // Key is being held - start continuous navigation
                    if (!continuousNavInterval) {
                        continuousNavInterval = setInterval(async () => {
                            if (currentFrame < videoInfo.total_frames - 1 && !isLoadingFrame) {
                                await loadFrame(currentFrame + 1);
                            }
                        }, 100); // Navigate every 100ms
                    }
                }
                break;
            case ' ':
                e.preventDefault();
                handleMarkTouch();
                break;
            case 'Delete':
                e.preventDefault();
                handleDeleteTouch();
                break;
            case '1':
                document.getElementById('bodyPartSelect').selectedIndex = 0;
                break;
            case '2':
                document.getElementById('bodyPartSelect').selectedIndex = 1;
                break;
            case '3':
                document.getElementById('bodyPartSelect').selectedIndex = 2;
                break;
            case '4':
                document.getElementById('bodyPartSelect').selectedIndex = 3;
                break;
            case '5':
                document.getElementById('bodyPartSelect').selectedIndex = 4;
                break;
            case '6':
                document.getElementById('bodyPartSelect').selectedIndex = 5;
                break;
            case '7':
                document.getElementById('bodyPartSelect').selectedIndex = 6;
                break;
            case '8':
                document.getElementById('bodyPartSelect').selectedIndex = 7;
                break;
            case '9':
                document.getElementById('bodyPartSelect').selectedIndex = 8;
                break;
        }
    });
}

function setupClearButton() {
    document.getElementById('clearBtn').addEventListener('click', async () => {
        if (!confirm('Start a new session? All current annotations will be lost if not exported.')) {
            return;
        }
        
        try {
            // Clear local cache first
            clearFrameCache();
            
            await fetch('/clear_session', {
                method: 'POST'
            });
            
            location.reload();
            
        } catch (error) {
            console.error('Error clearing session:', error);
        }
    });
}

function showAlert(message, type) {
    // Create temporary alert
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} position-fixed top-0 start-50 translate-middle-x mt-3`;
    alert.style.zIndex = '9999';
    alert.innerHTML = message;
    
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 3000);
}

function showStatus(message, type) {
    const uploadStatus = document.getElementById('uploadStatus');
    uploadStatus.innerHTML = `
        <div class="alert alert-${type}">
            ${message}
        </div>
    `;
}