# 💓 Heart Rate Monitor

A web based heart rate monitor that measures pulse from the fingertip using the phone camera. It works the same way as many camera based heart rate monitor apps, but it works entirely in the browser so nothing needs to be installed on your phone. At the moment it's recomended to use it on Chrome since other browsers don't yet support turning on the torch.

The latest stable version is hosted at [heartrate.netlify.app](https://heartrate.netlify.app)

![Heart Rate Monitor Screenshot](https://raw.githubusercontent.com/richrd/heart-rate-monitor/master/screenshots/screenshot-1.png)

## How to use it

First place your finger on the device so that it covers both the flash and the camera. Then tap the circle to begin the measurement. The flash should turn on during the measurement but currently that only works in Chrome. Try to keep your finger as stable as possible because even small movements will disrupt the measurement. The BPM reading should be accurate when the graph looks stable as shown in the screenshot above.

The app also has usage instructions built in which you can find via the menu.

## Why do this

I wanted a phone based heart rate monitor app, but I didn't feel like installing some random ad infested tracking ridden app from the app store. So I set out to see if I could pull this off with web tech only. I knew there were three things I needed to implement this:

-   Accessing a video stream from the camera of the phone
-   Sampling pixel data from the frames of the video stream
-   Turning on the flash light of the phone to get a consistent brightness level (seems to work on chrome only)

Aa brief web search confirmed that all of that was possible, so I wrote a quick and dirty prototype. The prototype was promising so I polished the code and gave it a nice app-like UI. Since the app is entirely client side I intentionally decided to leave out any frameworks, libraries and build processes. Writing vanilla HTML, CSS and JS was actually very refreshing for a change. As an added benefit deploying it is simply a matter of serving the src directory over HTTP. I will also never face broken dependencies on this project :)

## What's to come

Although the app is fully functional there's a few things I want to improve. First of all it needs an app icon, a manifest and a service worker to make it behave more like a native app when added to the home screen. I want to use the service worker for caching so that the entire app will work in offline mode indefinitely after it's been installed.

Another area of improvement is the measurement. Currently it uses simple zero crossing detection, meaning that it finds the points where the measured value falls below the average and measures the time duration between those points. The BPM is calculated from the average durations.

One way to make the measurement more robust would be to use a Fast Fourier Transform to determine the frequency. I expect using an FFT would allow getting reliable measurements even when the graph is a bit noisy. I haven't got round to trying that out but I hope to find time to learn about FFT at some point.

A list of planned things can be found in the [TODO](TODO.md)
