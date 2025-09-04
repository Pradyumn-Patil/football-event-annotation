let currentFrame = 0;
let videoInfo = null;
let annotations = [];
let abortController = null;
let frameCache = new Map();
let continuousNavInterval = null;
let isLoadingFrame = false;
let isPreloadingFrames = false;
let preloadProgress = 0;

document.addEventListener('DOMContentLoaded', function() {
    setupUpload();
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
        console.log(`Clearing ${frameCache.size} frames from cache`);
        frameCache.clear();
    }
    
    // Stop any ongoing preloading
    isPreloadingFrames = false;
    hidePreloadProgress();
    
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
    
    // Stop any ongoing preloading
    isPreloadingFrames = false;
    hidePreloadProgress();
    
    // Hide upload section, show annotation section
    document.getElementById('uploadSection').classList.add('d-none');
    document.getElementById('annotationSection').classList.remove('d-none');
    
    // Set video info
    document.getElementById('totalFrames').textContent = videoInfo.total_frames - 1;
    document.getElementById('frameSlider').max = videoInfo.total_frames - 1;
    document.getElementById('frameInput').max = videoInfo.total_frames - 1;
    
    // Load first frame immediately
    loadFrame(0);
    
    // Load existing annotations
    loadAnnotations();
    
    // Start preloading all frames in background
    setTimeout(() => {
        // Show warning for large videos
        if (videoInfo.total_frames > 1000) {
            const proceed = confirm(
                `This video has ${videoInfo.total_frames} frames. Preloading all frames will use approximately ${Math.round(videoInfo.total_frames * 0.5)} MB of memory.\n\nDo you want to preload all frames for instant navigation?`
            );
            if (proceed) {
                preloadAllFrames();
            }
        } else {
            preloadAllFrames();
        }
    }, 100); // Small delay to let first frame load
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
    
    // Check cache first
    if (frameCache.has(frameNumber)) {
        const cachedFrame = frameCache.get(frameNumber);
        document.getElementById('frameDisplay').src = cachedFrame;
        highlightIfAnnotated(frameNumber);
        preloadAdjacentFrames(frameNumber);
        return Promise.resolve(true);
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
            
            // Cache the frame (no size limit - cache all frames)
            frameCache.set(frameNumber, result.frame);
            
            // Display frame
            document.getElementById('frameDisplay').src = result.frame;
            
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

async function preloadAllFrames() {
    if (isPreloadingFrames || !videoInfo) {
        return;
    }
    
    isPreloadingFrames = true;
    const totalFrames = videoInfo.total_frames;
    const maxConcurrent = 8; // Limit concurrent requests
    let completed = 0;
    
    // Show progress
    showPreloadProgress(0, totalFrames);
    
    // Create batches of frames to load
    const frameBatches = [];
    for (let i = 0; i < totalFrames; i += maxConcurrent) {
        frameBatches.push(
            Array.from({length: Math.min(maxConcurrent, totalFrames - i)}, (_, idx) => i + idx)
        );
    }
    
    // Load frames in batches
    for (const batch of frameBatches) {
        if (!isPreloadingFrames) break; // Allow cancellation
        
        const promises = batch.map(async (frameNumber) => {
            if (frameCache.has(frameNumber)) {
                return Promise.resolve(true);
            }
            
            try {
                const response = await fetch(`/get_frame/${frameNumber}`);
                if (response.ok) {
                    const result = await response.json();
                    frameCache.set(frameNumber, result.frame);
                    return true;
                }
            } catch (error) {
                console.warn(`Failed to preload frame ${frameNumber}:`, error);
            }
            return false;
        });
        
        // Wait for current batch to complete
        await Promise.allSettled(promises);
        completed += batch.length;
        
        // Update progress
        showPreloadProgress(completed, totalFrames);
    }
    
    isPreloadingFrames = false;
    hidePreloadProgress();
    console.log(`Preloaded ${frameCache.size} frames into cache`);
}

function showPreloadProgress(current, total) {
    preloadProgress = Math.round((current / total) * 100);
    
    // Update or create progress indicator
    let progressDiv = document.getElementById('preloadProgress');
    if (!progressDiv) {
        progressDiv = document.createElement('div');
        progressDiv.id = 'preloadProgress';
        progressDiv.className = 'alert alert-info position-fixed top-0 start-50 translate-middle-x mt-3';
        progressDiv.style.zIndex = '9999';
        progressDiv.style.minWidth = '300px';
        document.body.appendChild(progressDiv);
    }
    
    progressDiv.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            <div class="flex-grow-1">
                <div>Loading all frames: ${current}/${total}</div>
                <div class="progress mt-1" style="height: 6px;">
                    <div class="progress-bar" style="width: ${preloadProgress}%"></div>
                </div>
            </div>
        </div>
    `;
}

function hidePreloadProgress() {
    const progressDiv = document.getElementById('preloadProgress');
    if (progressDiv) {
        progressDiv.remove();
    }
}

async function preloadAdjacentFrames(frameNumber) {
    // If we're preloading all frames, skip this
    if (isPreloadingFrames) {
        return;
    }
    
    // Pre-load multiple adjacent frames for smoother navigation
    const framesToPreload = [
        frameNumber - 2, frameNumber - 1, 
        frameNumber + 1, frameNumber + 2,
        frameNumber + 3, frameNumber + 4
    ];
    
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
    document.getElementById('markTouchBtn').addEventListener('click', markTouch);
    document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
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
                markTouch();
                break;
            case 'Delete':
                e.preventDefault();
                // Remove current frame annotation if exists
                if (annotations.some(a => a.frame_number === currentFrame)) {
                    removeAnnotation(currentFrame);
                }
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