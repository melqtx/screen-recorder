let shouldStop = false;
let stopped = false;
let mediaRecorder;
let recordedBlob;

const videoElement = document.querySelector('.vid');
const previewVideo = document.querySelector('.preview-video');
const downloadLink = document.querySelector('.download-btn');
const stopButton = document.querySelector('.stopbtn');
const recordButton = document.querySelector('.recordbtn');

function startRecord() {
  recordButton.disabled = true;
  stopButton.disabled = false;
  downloadLink.style.display = 'none';
}

function stopRecord() {
  recordButton.disabled = false;
  stopButton.disabled = true;
  downloadLink.style.display = 'inline-block';
}

stopButton.addEventListener('click', function() {
  shouldStop = true;
});

const handleRecord = function({stream, mimeType}) {
  startRecord();
  let recordedChunks = [];
  stopped = false;
  mediaRecorder = new MediaRecorder(stream);

  // Set up live preview
  previewVideo.srcObject = stream;
  previewVideo.play();

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

recordButton.addEventListener('click', recordScreen);
