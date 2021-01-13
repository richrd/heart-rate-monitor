# TODO

-   [ ] UI & UX
    -   [x] Disallow scaling the page
    -   [ ] Add app icon (favicon / touch icon)
    -   [x] Bind space bar to start / stop
    -   [ ] Add service worker so that the app can work in offline mode
    -   [ ] Add meta theme-color tag for improved visual look
-   [ ] Heart rate measurement
    -   [x] Decouple heart rate monitoring code from the HTML markup
        -   [x] Pass all necessary arguments as a config object to `initialize`
    -   [x] Determine the best way of sampling the pixel data. At the moment averaging the red and green channels seems to produce best results.
    -   [ ] Ignore BPM measurements that are too high or low
    -   [ ] Display a moving average of the BPM measurement instead of a direct measurement
