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

// Initialize FFmpeg for browser environment
async function initFFmpeg() {
    try {
        ffmpeg = createFFmpeg({
            log: true,
            corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
        });
        await ffmpeg.load();
        console.log('FFmpeg loaded successfully');
    } catch (error) {
        console.error('Error loading FFmpeg:', error);
    }
}

initFFmpeg().catch(console.error);

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
        stream.getTracks().forEach(track => track.stop()); // Stop all tracks when recording ends
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
    } else {
        try {
            downloadLink.textContent = 'Converting...';
            downloadLink.style.pointerEvents = 'none';
            
            if (!ffmpeg.isLoaded()) {
                await ffmpeg.load();
            }

            const inputFileName = 'input.webm';
            const outputFileName = `output.${selectedFormat}`;
            
            ffmpeg.FS('writeFile', inputFileName, await fetchFile(blob));
            
            if (selectedFormat === 'mp4') {
                await ffmpeg.run(
                    '-i', inputFileName,
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-c:a', 'aac',
                    '-strict', 'experimental',
                    outputFileName
                );
            } else if (selectedFormat === 'mp3') {
                await ffmpeg.run(
                    '-i', inputFileName,
                    '-vn',
                    '-acodec', 'libmp3lame',
                    '-q:a', '2',
                    outputFileName
                );
            }
            
            const data = ffmpeg.FS('readFile', outputFileName);
            const convertedBlob = new Blob([data.buffer], { 
                type: selectedFormat === 'mp4' ? 'video/mp4' : 'audio/mp3' 
            });
            
            downloadLink.href = URL.createObjectURL(convertedBlob);
            downloadLink.download = `recording_${timestamp}.${selectedFormat}`;
            
            ffmpeg.FS('unlink', inputFileName);
            ffmpeg.FS('unlink', outputFileName);
            
        } catch (error) {
            console.error('Conversion error:', error);
            alert('Error converting file. Please try again or choose a different format.');
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
            
            // Mix display audio if available
            if (displayStream.getAudioTracks().length > 0) {
                const displayAudio = audioContext.createMediaStreamSource(displayStream);
                displayAudio.connect(audioDestination);
            }

            // Add user audio
            const userAudio = audioContext.createMediaStreamSource(audioStream);
            userAudio.connect(audioDestination);

            // Combine video and audio tracks
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