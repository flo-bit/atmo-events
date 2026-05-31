/**
 * Tab/screen recorder built on getDisplayMedia + MediaRecorder.
 *
 * Returns reactive state and start/stop methods. Caller is responsible for
 * deciding when to start the timeline relative to the recording lead-in.
 */
export function createRecorder() {
	let state = $state<'idle' | 'recording' | 'ready'>('idle');
	let downloadUrl: string | null = $state(null);
	let mediaRecorder: MediaRecorder | null = null;
	let chunks: Blob[] = [];

	async function start() {
		if (state === 'recording') return;
		const stream = await navigator.mediaDevices.getDisplayMedia({
			video: { frameRate: 60 },
			audio: false
		});
		chunks = [];
		const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
			? 'video/webm;codecs=vp9'
			: 'video/webm';
		mediaRecorder = new MediaRecorder(stream, {
			mimeType: mime,
			videoBitsPerSecond: 8_000_000
		});
		mediaRecorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};
		mediaRecorder.onstop = () => {
			const blob = new Blob(chunks, { type: 'video/webm' });
			if (downloadUrl) URL.revokeObjectURL(downloadUrl);
			downloadUrl = URL.createObjectURL(blob);
			stream.getTracks().forEach((t) => t.stop());
			state = 'ready';
		};
		stream.getVideoTracks()[0].addEventListener('ended', () => stop());
		mediaRecorder.start();
		state = 'recording';
	}

	function stop() {
		if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
	}

	return {
		get state() {
			return state;
		},
		get downloadUrl() {
			return downloadUrl;
		},
		start,
		stop
	};
}
