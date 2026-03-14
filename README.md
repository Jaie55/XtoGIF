![XtoGIF](./assets/open-graph.png)

# XtoGIF

**Download images, videos and GIFs from X (Twitter) with one click.**

No sign-in required. No third-party services. Works directly in your browser.

## Fork Scope (Important)

This repository is a fork of the original TwitterMediaHarvest project.

> Important note: this project is not maintained as a direct GitHub fork because release timing and packaging needed to be fully independent. In practice, waiting for upstream releases could delay required changes. The roadmap may also diverge over time with additional features, so this repository is managed as a derived project with its own release cycle.

The fork intentionally changes only these two points:

- It removes all telemetry completely. No analytics, no Sentry events, and no remote telemetry pipeline.
- It adds MP4 to GIF transcoding specifically for X/Twitter GIF posts, so GIF downloads are generated from the MP4 source.

Outside of those two points, behavior is intended to stay aligned with the original project.

## Features

- One-click download of original-size images and videos
- Customize filename format for downloaded files
- Download history to track what you've saved
- Auto-reveal sensitive content (optional)
- Integrates with [Aria2 Explorer](https://chrome.google.com/webstore/detail/aria2-for-chrome/mpkodccbngfoacfalldjimigbofkhgjn) for advanced download management
- Does not rely on any third-party services

## Install

[Chrome extension file (AUN POR PONER)](chrome://blank/)

## License

- [LICENSE](LICENSE)

## Privacy Policy

- [PRIVACY POLICY](PRIVACY_POLICY.md)
