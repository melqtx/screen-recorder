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

recordButton.addEventListener('click', function() {
    if (recordButton.textContent === 'Start Recording') {
        recordScreen();
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
    const timestamp = new Date().toISOString();
    
    if (selectedFormat === 'webm') {
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `recording_${timestamp}.webm`;
    } else {
        try {
            // Show loading state
            downloadLink.textContent = 'Converting...';
            downloadLink.style.pointerEvents = 'none';
            
            if (!ffmpeg.isLoaded()) {
                console.log('FFmpeg not loaded, loading now...');
                await ffmpeg.load();
            }

            const inputFileName = 'input.webm';
            const outputFileName = `output.${selectedFormat}`;
            
            console.log('Writing input file...');
            ffmpeg.FS('writeFile', inputFileName, await blob.arrayBuffer());
            
            console.log('Starting conversion...');
            if (selectedFormat === 'mp4') {
                await ffmpeg.run(
                    '-i', inputFileName,
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-c:a', 'aac',
                    '-b:a', '128k',
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
            
            console.log('Reading output file...');
            const data = ffmpeg.FS('readFile', outputFileName);
            
            const convertedBlob = new Blob([data.buffer], { 
                type: selectedFormat === 'mp4' ? 'video/mp4' : 'audio/mp3' 
            });
            
            downloadLink.href = URL.createObjectURL(convertedBlob);
            downloadLink.download = `recording_${timestamp}.${selectedFormat}`;
            
            // Clean up files
            ffmpeg.FS('unlink', inputFileName);
            ffmpeg.FS('unlink', outputFileName);
            
            downloadLink.textContent = 'Download Recording';
            downloadLink.style.pointerEvents = 'auto';
            
        } catch (error) {
            console.error('Detailed conversion error:', error);
            alert(`Error converting format: ${error.message}`);
            // Reset button state
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
    const mimeType = 'video/webm';
    shouldStop = false;
    const constraints = {video: {cursor: 'motion'}};
    if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) {
        return window.alert('Screen Record not supported!');
    }
    let stream = null;
    const displayStream = await navigator.mediaDevices.getDisplayMedia(
        {video: {cursor: 'motion'}, audio: {'echoCancellation': true}});
    if (window.confirm('Record audio with screen?')) {
        const audioContext = new AudioContext();
        const voiceStream = await navigator.mediaDevices.getUserMedia(
            {audio: {'echoCancellation': true}, video: false});
        const userAudio = audioContext.createMediaStreamSource(voiceStream);
        const audioDestination = audioContext.createMediaStreamDestination();
        userAudio.connect(audioDestination);

        if (displayStream.getAudioTracks().length > 0) {
            const displayAudio = audioContext.createMediaStreamSource(displayStream);
            displayAudio.connect(audioDestination);
        }

        const tracks = [
            ...displayStream.getVideoTracks(), ...audioDestination.stream.getTracks()
        ];
        stream = new MediaStream(tracks);
    } else {
        stream = displayStream;
    }
    handleRecord({stream, mimeType});
}