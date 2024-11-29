let shouldStop = false;
let stopped = false;
let mediaRecorder;
let recordedBlob;
let timerInterval;
let startTime;

const videoElement = document.getElementById('vid');
const recordButton = document.getElementById('recordbtn');
const timerElement = document.getElementById('timer');
const themeToggle = document.getElementById('theme-toggle');
const previewContainer = document.getElementById('preview-container');
const downloadLink = document.getElementById('download-btn');
const card = document.getElementById('card');

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

    downloadLink.href = url;
    downloadLink.download = `recording_${new Date().toISOString()}.webm`;
    downloadLink.style.display = 'inline-block';
}

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