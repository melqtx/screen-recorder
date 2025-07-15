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

// Initialize FFmpeg using the modern 0.12.x API
async function initFFmpeg() {
    try {
        console.log('🔄 Initializing FFmpeg...');

        // Wait for the FFmpeg library to load
        let attempts = 0;
        while (attempts < 30) {
            if (typeof FFmpeg !== 'undefined') {
                console.log('✅ FFmpeg found!');
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
            attempts++;
        }

        if (typeof FFmpeg === 'undefined') {
            throw new Error('FFmpeg not found - library failed to load');
        }

        console.log('📦 Creating FFmpeg instance...');
        ffmpeg = new FFmpeg();

        ffmpeg.on('log', ({ message }) => {
            console.log('FFmpeg:', message);
        });

        ffmpeg.on('progress', ({ progress, time }) => {
            console.log(`Progress: ${Math.round(progress * 100)}%`);
        });

        console.log('⬇️ Loading FFmpeg core...');
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        console.log('✅ FFmpeg loaded and ready for MP4 conversion!');
        return true;

    } catch (error) {
        console.error('❌ FFmpeg initialization failed:', error);
        return false;
    }
}

// toBlobURL helper function
async function toBlobURL(url, mimeType) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
}

// Initialize FFmpeg when page loads
let ffmpegReady = false;
window.addEventListener('load', async () => {
    console.log('🚀 Starting FFmpeg initialization...');
    ffmpegReady = await initFFmpeg();
    if (!ffmpegReady) {
        console.error('💀 FFmpeg failed to initialize');
        console.log('💡 The MP4 conversion feature is unavailable. You can still download as WebM.');
    }
});

themeToggle.addEventListener('change', function () {
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

recordButton.addEventListener('click', async function () {
    if (recordButton.textContent === 'Start Recording') {
        await recordScreen();
    } else {
        shouldStop = true;
    }
});

const handleRecord = function ({ stream, mimeType }) {
    startRecord();
    let recordedChunks = [];
    stopped = false;
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = function (e) {
        if (e.data.size > 0) {
            recordedChunks.push(e.data);
        }

        if (shouldStop === true && stopped === false) {
            mediaRecorder.stop();
            stopped = true;
        }
    };

    mediaRecorder.onstop = function () {
        recordedBlob = new Blob(recordedChunks, { type: mimeType });
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
                throw new Error('FFmpeg not ready. Try refreshing the page or download as WebM instead.');
            }

            const inputFileName = 'input.webm';
            const outputFileName = `output.${selectedFormat}`;

            console.log('📝 Converting blob to Uint8Array...');
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            console.log('💾 Writing input file to FFmpeg filesystem...');
            await ffmpeg.writeFile(inputFileName, uint8Array);

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

            console.log('🎉 MP4 conversion completed successfully!');

        } catch (error) {
            console.error('❌ Conversion failed:', error);
            alert(`Conversion failed: ${error.message}. You can download as WebM instead.`);
        } finally {
            downloadLink.textContent = 'Download Recording';
            downloadLink.style.pointerEvents = 'auto';
        }
    }
}

formatSelect.addEventListener('change', function () {
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