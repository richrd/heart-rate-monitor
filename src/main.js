"use strict";

const heartRateMonitor = (function () {
	// Size of sampling image
	const IMAGE_WIDTH = 30;
	const IMAGE_HEIGHT = 30;

	// Array of measured samples
	const SAMPLE_BUFFER = [];

	// Max 5 seconds of samples (at 60 samples per second)
	// Measurement isn't dependant on frame rate but the visual speed of the graph is
	const MAX_SAMPLES = 60 * 5;

	// How long to wait in milliseconds for the camera image to stabilize before starting measurement
	const START_DELAY = 1500;

	// Callback for reporting the measured heart rate
	let ON_BPM_CHANGE;

	// The <video> element for streaming the camera feed into
	let VIDEO_ELEMENT;

	// Canvas element for sampling image data from the video stream
	let SAMPLING_CANVAS;

	// Sampling canvas 2d context
	let SAMPLING_CONTEXT;

	// Canvas element for the graph
	let GRAPH_CANVAS;

	// Graph canvas 2d context
	let GRAPH_CONTEXT;

	// Color of the graph line
	let GRAPH_COLOR;

	// Width of the graph line
	let GRAPH_WIDTH;

	// Whether to print debug messages
	let DEBUG = false;

	// Video stream object
	let VIDEO_STREAM;

	let MONITORING = false;

	// Debug logging
	const log = (...args) => {
		if (DEBUG) {
			console.log(...args);
			document.querySelector("#debug-log").innerHTML += args + "<br />";
		}
	};

	// Publicly available methods & variables
	const publicMethods = {};

	// Get an average brightness reading
	const averageBrightness = (canvas, context) => {
		// 1d array of r, g, b, a pixel data values
		const pixelData = context.getImageData(
			0,
			0,
			canvas.width,
			canvas.height
		).data;
		let sum = 0;

		// Only use the red and green channels as that combination gives the best readings
		for (let i = 0; i < pixelData.length; i += 4) {
			sum = sum + pixelData[i] + pixelData[i + 1];
		}

		// Since we only process two channels out of four we scale the data length to half
		const avg = sum / (pixelData.length * 0.5);

		// Scale to 0 ... 1
		return avg / 255;
	};

	publicMethods.initialize = (configuration) => {
		VIDEO_ELEMENT = configuration.videoElement;
		SAMPLING_CANVAS = configuration.samplingCanvas;
		GRAPH_CANVAS = configuration.graphCanvas;
		GRAPH_COLOR = configuration.graphColor;
		GRAPH_WIDTH = configuration.graphWidth;
		ON_BPM_CHANGE = configuration.onBpmChange;
		SAMPLING_CONTEXT = SAMPLING_CANVAS.getContext("2d");
		GRAPH_CONTEXT = GRAPH_CANVAS.getContext("2d");

		if (!"mediaDevices" in navigator) {
			// TODO: use something nicer than an alert
			alert(
				"Sorry, your browser doesn't support camera access which is required by this app."
			);
			return false;
		}

		// Setup event listeners
		window.addEventListener("resize", handleResize);

		// Set the canvas size to its element size
		handleResize();
	};

	const handleResize = () => {
		log(
			"handleResize",
			GRAPH_CANVAS.clientWidth,
			GRAPH_CANVAS.clientHeight
		);
		GRAPH_CANVAS.width = GRAPH_CANVAS.clientWidth;
		GRAPH_CANVAS.height = GRAPH_CANVAS.clientHeight;
	};

	publicMethods.toggleMonitoring = () => {
		MONITORING ? stopMonitoring() : startMonitoring();
	};

	const getCamera = async () => {
		const devices = await navigator.mediaDevices.enumerateDevices();
		const cameras = devices.filter(
			(device) => device.kind === "videoinput"
		);
		return cameras[cameras.length - 1];
	};

	const startMonitoring = async () => {
		resetBuffer();
		handleResize();
		setBpmDisplay("");

		const camera = await getCamera();
		VIDEO_STREAM = await startCameraStream(camera);

		if (!VIDEO_STREAM) {
			throw Error("Unable to start video stream");
		}

		try {
			setTorchStatus(VIDEO_STREAM, true);
		} catch (e) {
			alert("Error:" + e);
		}

		SAMPLING_CANVAS.width = IMAGE_WIDTH;
		SAMPLING_CANVAS.height = IMAGE_HEIGHT;
		VIDEO_ELEMENT.srcObject = VIDEO_STREAM;
		VIDEO_ELEMENT.play();
		MONITORING = true;

		// Waiting helps stabilaze the camera image before taking samples
		log("Waiting before starting mainloop...");
		setTimeout(async () => {
			log("Starting mainloop...");
			monitorLoop();
		}, START_DELAY);
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

					// Experimental:
					whiteBalanceMode: "manual",
					exposureMode: "manual",
					focusMode: "manual",
				},
			});
		} catch (error) {
			alert("Failed to access camera!\nError: " + error.message);
			return;
		}

		return stream;
	};

	const setTorchStatus = async (stream, status) => {
		// Try to enable flashlight
		try {
			const track = stream.getVideoTracks()[0];
			await track.applyConstraints({
				advanced: [{ torch: status }],
			});
		} catch (error) {
			alert("Starting torch failed.\nError: " + error.message);
		}
	};

	const setBpmDisplay = (bpm) => {
		ON_BPM_CHANGE(bpm);
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
		const value = averageBrightness(SAMPLING_CANVAS, SAMPLING_CONTEXT);
		const time = Date.now();

		SAMPLE_BUFFER.push({ value, time });
		if (SAMPLE_BUFFER.length > MAX_SAMPLES) {
			SAMPLE_BUFFER.shift();
		}

		const dataStats = analyzeData(SAMPLE_BUFFER);
		const bpm = calculateBpm(dataStats.crossings);

		// TODO: Store BPM values in array and display moving average
		if (bpm) {
			setBpmDisplay(Math.round(bpm));
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
		// Scaling of sample window to the graph width
		const xScaling = GRAPH_CANVAS.width / MAX_SAMPLES;

		// Set offset based on number of samples, so the graph runs from the right edge to the left
		const xOffset = (MAX_SAMPLES - SAMPLE_BUFFER.length) * xScaling;

		GRAPH_CONTEXT.lineWidth = GRAPH_WIDTH;
		GRAPH_CONTEXT.strokeStyle = GRAPH_COLOR;
		GRAPH_CONTEXT.lineCap = "round";
		GRAPH_CONTEXT.lineJoin = "round";

		GRAPH_CONTEXT.clearRect(0, 0, GRAPH_CANVAS.width, GRAPH_CANVAS.height);
		GRAPH_CONTEXT.beginPath();

		// Avoid drawing too close to the graph edges due to the line thickness getting cut off
		const maxHeight = GRAPH_CANVAS.height - GRAPH_CONTEXT.lineWidth * 2;
		let previousY = 0;
		SAMPLE_BUFFER.forEach((sample, i) => {
			const x = xScaling * i + xOffset;

			let y = GRAPH_CONTEXT.lineWidth;

			if (sample.value !== 0) {
				y =
					(maxHeight * (sample.value - dataStats.min)) /
						(dataStats.max - dataStats.min) +
					GRAPH_CONTEXT.lineWidth;
			}

			if (y != previousY) {
				GRAPH_CONTEXT.lineTo(x, y);
			}

			previousY = y;
		});

		GRAPH_CONTEXT.stroke();
	};

	return publicMethods;
})();
