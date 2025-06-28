let shouldStop = false;
let stopped = false;
let mediaRecorder;
let recordedBlob;
let timerInterval;
let startTime;
let ffmpeg;

const videoElement = document.getElementById('vid');
const recordButton = document.getElementById('recordbtn');
const timerElement = document.getElementById('timer');
const themeToggle = document.getElementById('theme-toggle');
const previewContainer = document.getElementById('preview-container');
const downloadLink = document.getElementById('download-btn');
const card = document.getElementById('card');
const formatSelect = document.getElementById('format-select');

// Custom fetchFile implementation
async function fetchFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    return new Uint8Array(arrayBuffer);
}

// Custom toBlobURL that works with HTTP
async function toBlobURL(url, mimeType) {
    try {
        // Try HTTP version for localhost compatibility
        const httpUrl = url.replace('https://', 'http://');
        const response = await fetch(httpUrl);
        const blob = await response.blob();
        return URL.createObjectURL(new Blob([blob], { type: mimeType }));
    } catch (error) {
        console.warn('HTTP fetch failed, trying HTTPS:', error);
        const response = await fetch(url);
        const blob = await response.blob();
        return URL.createObjectURL(new Blob([blob], { type: mimeType }));
    }
}

// Initialize ffmpeg.wasm properly
async function initFFmpeg() {
    try {
        console.log('🔄 Initializing ffmpeg.wasm...');
        
        // Wait for libraries to load
        let attempts = 0;
        while (attempts < 30) {
            if (window.FFmpegWASM && window.FFmpegUtil) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
            attempts++;
            if (attempts % 5 === 0) {
                console.log(`Waiting for libraries... attempt ${attempts}/30`);
            }
        }
        
        if (!window.FFmpegWASM) {
            console.error('FFmpegWASM not available. Available globals:', Object.keys(window).filter(k => k.includes('FFmpeg') || k.includes('ffmpeg')));
            throw new Error('FFmpegWASM library not loaded');
        }
        
        console.log('📦 Creating FFmpeg instance...');
        
        // Get FFmpeg from the global object
        const { FFmpeg } = window.FFmpegWASM;
        ffmpeg = new FFmpeg();
        
        ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg]', message);
        });
        
        ffmpeg.on('progress', ({ progress }) => {
            console.log(`[FFmpeg] Progress: ${Math.round(progress * 100)}%`);
        });

        console.log('⬇️ Loading FFmpeg core...');
        
        // Use HTTP URLs for localhost compatibility
        const baseURL = 'http://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        console.log('✅ ffmpeg.wasm loaded successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ FFmpeg initialization failed:', error);
        console.log('Debug info:', {
            FFmpegWASM: typeof window.FFmpegWASM,
            FFmpegUtil: typeof window.FFmpegUtil,
            availableKeys: Object.keys(window).filter(k => k.toLowerCase().includes('ffmpeg'))
        });
        return false;
    }
}

// Initialize with proper timing
let ffmpegReady = false;
setTimeout(async () => {
    console.log('🚀 Starting FFmpeg initialization...');
    ffmpegReady = await initFFmpeg();
    if (!ffmpegReady) {
        console.log('🔄 First attempt failed, retrying...');
        setTimeout(async () => {
            ffmpegReady = await initFFmpeg();
            if (!ffmpegReady) {
                console.error('💀 FFmpeg failed to initialize after retries');
            }
        }, 3000);
    }
}, 2000);

themeToggle.addEventListener('change', function() {
    document.body.classList.toggle('dark');
    document.body.classList.toggle('light');
});

function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const hours = String(Math.floor(elapsedTime / 3600000)).padStart(2, '0');
        const minutes = String(Math.floor((elapsedTime % 3600000) / 60000)).padStart(2, '0');
        const seconds = String(Math.floor((elapsedTime % 60000) / 1000)).padStart(2, '0');
        timerElement.textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

function startRecord() {
    recordButton.textContent = 'Stop Recording';
    startTimer();
}

function stopRecord() {
    recordButton.textContent = 'Start Recording';
    stopTimer();
    previewContainer.style.display = 'block';
    card.classList.add('expanded');
}

recordButton.addEventListener('click', async function() {
    if (recordButton.textContent === 'Start Recording') {
        await recordScreen();
    } else {
        shouldStop = true;
    }
});

const handleRecord = function({stream, mimeType}) {
    startRecord();
    let recordedChunks = [];
    stopped = false;
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = function(e) {
        if (e.data.size > 0) {
            recordedChunks.push(e.data);
        }

        if (shouldStop === true && stopped === false) {
            mediaRecorder.stop();
            stopped = true;
        }
    };

    mediaRecorder.onstop = function() {
        recordedBlob = new Blob(recordedChunks, {type: mimeType});
        recordedChunks = [];
        stopRecord();
        previewRecording(recordedBlob);
        stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start(200);
};

function previewRecording(blob) {
    const url = URL.createObjectURL(blob);
    videoElement.src = url;
    videoElement.controls = true;
    videoElement.play();

    updateDownloadLink(blob);
    downloadLink.style.display = 'inline-block';
}

async function updateDownloadLink(blob) {
    const selectedFormat = formatSelect.value;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (selectedFormat === 'webm') {
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `recording_${timestamp}.webm`;
        downloadLink.textContent = 'Download Recording';
    } else {
        try {
            downloadLink.textContent = 'Converting...';
            downloadLink.style.pointerEvents = 'none';
            
            if (!ffmpegReady || !ffmpeg) {
                throw new Error('FFmpeg not ready. Please wait or refresh the page.');
            }
            
            if (!ffmpeg.loaded) {
                throw new Error('FFmpeg core not loaded. Please refresh the page.');
            }

            const inputFileName = 'input.webm';
            const outputFileName = `output.${selectedFormat}`;
            
            console.log('📝 Writing input file...');
            await ffmpeg.writeFile(inputFileName, await fetchFile(blob));
            
            console.log(`🔄 Converting to ${selectedFormat}...`);
            
            if (selectedFormat === 'mp4') {
                await ffmpeg.exec([
                    '-i', inputFileName,
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '23',
                    '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-movflags', 'faststart',
                    outputFileName
                ]);
            } else if (selectedFormat === 'mp3') {
                await ffmpeg.exec([
                    '-i', inputFileName,
                    '-vn',
                    '-acodec', 'libmp3lame',
                    '-q:a', '2',
                    outputFileName
                ]);
            }
            
            console.log('📖 Reading output file...');
            const data = await ffmpeg.readFile(outputFileName);
            
            const convertedBlob = new Blob([data], { 
                type: selectedFormat === 'mp4' ? 'video/mp4' : 'audio/mp3' 
            });
            
            downloadLink.href = URL.createObjectURL(convertedBlob);
            downloadLink.download = `recording_${timestamp}.${selectedFormat}`;
            
            console.log('🧹 Cleaning up...');
            await ffmpeg.deleteFile(inputFileName);
            await ffmpeg.deleteFile(outputFileName);
            
            console.log('🎉 Conversion completed successfully!');
            
        } catch (error) {
            console.error('❌ Conversion failed:', error);
            alert(`Conversion failed: ${error.message}`);
        } finally {
            downloadLink.textContent = 'Download Recording';
            downloadLink.style.pointerEvents = 'auto';
        }
    }
}

formatSelect.addEventListener('change', function() {
    if (recordedBlob) {
        updateDownloadLink(recordedBlob);
    }
});

async function recordScreen() {
    try {
        const mimeType = 'video/webm';
        shouldStop = false;

        if (!navigator.mediaDevices?.getDisplayMedia) {
            throw new Error('Screen recording is not supported in your browser');
        }

        const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'motion' },
            audio: { echoCancellation: true }
        });

        let stream = displayStream;

        if (window.confirm('Record audio with screen?')) {
            const audioStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true },
                video: false
            });

            const audioContext = new AudioContext();
            const audioDestination = audioContext.createMediaStreamDestination();
            
            if (displayStream.getAudioTracks().length > 0) {
                const displayAudio = audioContext.createMediaStreamSource(displayStream);
                displayAudio.connect(audioDestination);
            }

            const userAudio = audioContext.createMediaStreamSource(audioStream);
            userAudio.connect(audioDestination);

            stream = new MediaStream([
                ...displayStream.getVideoTracks(),
                ...audioDestination.stream.getTracks()
            ]);
        }

        handleRecord({ stream, mimeType });
    } catch (error) {
        console.error('Error starting recording:', error);
        alert(`Cannot start recording: ${error.message}`);
        recordButton.textContent = 'Start Recording';
    }
}