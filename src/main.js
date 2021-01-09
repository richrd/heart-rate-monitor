(function () {
	// Element that displays the measured heart rate
	const BPM_ELEMENT = document.getElementById("bpm-value");

	// The <video> element for streaming the webcam feed into
	const VIDEO_ELEMENT = document.getElementById("camera-feed");

	// Canvas element for sampling image data from the video stream
	const SAMPLING_CANVAS = document.getElementById("sampling-canvas");

	// Sampling canvas 2d context
	const SAMPLING_CONTEXT = SAMPLING_CANVAS.getContext("2d");

	// Canvas element for the graph
	const GRAPH_CANVAS = document.getElementById("graph-canvas");

	// Graph canvas 2d context
	const GRAPH_CONTEXT = GRAPH_CANVAS.getContext("2d");

	// Color of the graph line
	let GRAPH_COLOR;

	// Size of sampling image
	const IMAGE_WIDTH = 30;
	const IMAGE_HEIGHT = 30;

	const SAMPLE_BUFFER = [];
	const MAX_SAMPLES = 60 * 5; // 5 seconds of samples (at 60 samples per second)

	let MONITORING = false;
	let VIDEO_STREAM;

	/*
	 * Functions for obtaining a sample from image pixel data
	 */
	const samplers = {
		basicAvgLightness(canvas, context) {
			// Simple average of all r g b values
			// 1d array of r, g, b, a pixel data values
			const pixelData = context.getImageData(
				0,
				0,
				canvas.width,
				canvas.height
			).data;
			let sum = 0;

			// Sum all the RGB pixel channels and skip the alpha channel
			for (let i = 0; i < pixelData.length; i += 4) {
				sum = sum + pixelData[i] + pixelData[i + 1] + pixelData[i + 2];
			}
			// Since we don't process the alpha channel we scale the data length acordingly
			// 0.75 == 3/4
			const avg = sum / (pixelData.length * 0.75);
			// Scale to 0 ... 1
			return avg / 255;
		},
	};

	const initialize = () => {
		resetBuffer();

		if (!"mediaDevices" in navigator) {
			// TODO: use something nicer than an alert
			alert(
				"Sorry, your browser doesn't support camera access which is required by this app."
			);
			return false;
		}

		// Setup variables
		GRAPH_COLOR = getComputedStyle(
			document.documentElement
		).getPropertyValue("--graph-color");

		// Setup event listeners
		window.addEventListener("resize", handleResize);
		document
			.getElementById("bpm-display-container")
			.addEventListener("click", toggleMonitoring);

		// Set the canvas size to its element size
		handleResize();
	};

	const handleResize = () => {
		console.log("handleResize");
		GRAPH_CANVAS.width = GRAPH_CANVAS.clientWidth;
		GRAPH_CANVAS.height = GRAPH_CANVAS.clientHeight;
	};

	const toggleMonitoring = async () => {
		MONITORING ? stopMonitoring() : startMonitoring();
	};

	const startMonitoring = async () => {
		resetBuffer();

		const devices = await navigator.mediaDevices.enumerateDevices();
		const cameras = devices.filter(
			(device) => device.kind === "videoinput"
		);
		const camera = cameras[cameras.length - 1];
		VIDEO_STREAM = await startCameraStream(camera);

		if (!VIDEO_STREAM) {
			return;
		}

		setTorchStatus(VIDEO_STREAM, true);
		SAMPLING_CANVAS.width = IMAGE_WIDTH;
		SAMPLING_CANVAS.height = IMAGE_HEIGHT;
		VIDEO_ELEMENT.srcObject = VIDEO_STREAM;
		VIDEO_ELEMENT.play();
		MONITORING = true;

		// Short timeout helps stabilaze the camera image before taking samples
		setTimeout(monitorLoop, 50);
	};

	const stopMonitoring = async () => {
		setTorchStatus(VIDEO_STREAM, false);
		VIDEO_ELEMENT.pause();
		VIDEO_ELEMENT.srcObject = null;
		MONITORING = false;
	};

	const monitorLoop = () => {
		processFrame();
		if (MONITORING) {
			window.requestAnimationFrame(monitorLoop);
		}
	};

	const resetBuffer = () => {
		SAMPLE_BUFFER.length = 0;
	};

	const startCameraStream = async (camera) => {
		// At this point the browser asks for permission
		let stream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: {
					deviceId: camera.deviceId,
					facingMode: ["user", "environment"],
					width: { ideal: IMAGE_WIDTH },
					height: { ideal: IMAGE_HEIGHT },
				},
			});
		} catch (error) {
			alert("Failed to access camera!\nError: " + error.message);
			return;
		}

		return stream;
	};

	const setTorchStatus = (stream, status) => {
		// Try to enable flashlight
		try {
			const track = stream.getVideoTracks()[0];
			track.applyConstraints({
				advanced: [{ torch: status }],
			});
		} catch (error) {
			alert("Starting torch failed.\nError: " + error.message);
		}
	};

	const processFrame = () => {
		// Draw the current video frame onto the canvas
		SAMPLING_CONTEXT.drawImage(
			VIDEO_ELEMENT,
			0,
			0,
			IMAGE_WIDTH,
			IMAGE_HEIGHT
		);

		// Get a sample from the canvas pixels
		const value = samplers.basicAvgLightness(
			SAMPLING_CANVAS,
			SAMPLING_CONTEXT
		);
		const time = Date.now();

		SAMPLE_BUFFER.push({ value, time });
		if (SAMPLE_BUFFER.length > MAX_SAMPLES) {
			SAMPLE_BUFFER.shift();
		}

		const dataStats = analyzeData(SAMPLE_BUFFER);
		const bpm = calculateBpm(dataStats.crossings);

		// TODO: Store BPM values in array and display moving average
		if (bpm) {
			BPM_ELEMENT.innerText = Math.round(bpm);
		}
		drawGraph(dataStats);
	};

	const analyzeData = (samples) => {
		// Get the mean average value of the samples
		const average =
			samples.map((sample) => sample.value).reduce((a, c) => a + c) /
			samples.length;

		// Find the lowest and highest sample values in the data
		// Used for both calculating bpm and fitting the graph in the canvas
		let min = samples[0].value;
		let max = samples[0].value;
		samples.forEach((sample) => {
			if (sample.value > max) {
				max = sample.value;
			}
			if (sample.value < min) {
				min = sample.value;
			}
		});

		// The range of the change in values
		// For a good measurement it should be between  ~ 0.002 - 0.02
		const range = max - min;

		const crossings = getAverageCrossings(samples, average);
		return {
			average,
			min,
			max,
			range,
			crossings,
		};
	};

	const getAverageCrossings = (samples, average) => {
		// Get each sample at points where the graph has crossed below the average level
		// These are visible as the rising edges that pass the midpoint of the graph
		const crossingsSamples = [];
		let previousSample = samples[0]; // Avoid if statement in loop

		samples.forEach(function (currentSample) {
			// Check if next sample has gone below average.
			if (
				currentSample.value < average &&
				previousSample.value > average
			) {
				crossingsSamples.push(currentSample);
			}

			previousSample = currentSample;
		});

		return crossingsSamples;
	};

	const calculateBpm = (samples) => {
		if (samples.length < 2) {
			return;
		}

		const averageInterval =
			(samples[samples.length - 1].time - samples[0].time) /
			(samples.length - 1);
		return 60000 / averageInterval;
	};

	const drawGraph = (dataStats) => {
		const samples = SAMPLE_BUFFER;
		const maxSamples = MAX_SAMPLES;
		const ctx = GRAPH_CONTEXT;
		const canvas = GRAPH_CANVAS;
		const color = GRAPH_COLOR;
		const lineWidth = 6;

		// Scaling of sample window to the graph width
		const xScaling = canvas.width / maxSamples;
		// Set offset based on number of samples, so the graph runs from the right edge to the left
		const xOffset = (maxSamples - samples.length) * xScaling;

		ctx.lineWidth = lineWidth;
		ctx.strokeStyle = color;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.beginPath();

		// Avoid drawing too close to the graph edges due to the line thickness getting cut off
		const maxHeight = GRAPH_CANVAS.height - ctx.lineWidth * 2;
		let previousY = 0;
		samples.forEach((sample, i) => {
			const x = xScaling * i + xOffset;
			const y =
				(maxHeight * (sample.value - dataStats.min)) /
					(dataStats.max - dataStats.min) +
				ctx.lineWidth;

			// Skip drawing when the value hasn't changed.
			// This avoids having awkward looking horizontal steps in the graph.
			if (y != previousY) {
				ctx.lineTo(x, y);
			}

			previousY = y;
		});

		ctx.stroke();
	};

	document.addEventListener("DOMContentLoaded", initialize);
})();
