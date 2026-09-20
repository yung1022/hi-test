# Stream audio
The stream script downloads enabled YouTube tracks from `config/stream-config.json` with `yt-dlp`, then passes the resulting audio playlist directly to FFmpeg. You can also put local music files in this directory; at the start of each stream segment, the script randomly shuffles all supported files, plays them in that order, and loops the randomized playlist:

- `.mp3`
- `.wav`
- `.ogg`
- `.flac`
- `.m4a`
- `.aac`

Audio is read directly by FFmpeg, so Chromium/YouTube does not need to create a PulseAudio sink input. The runner requires `yt-dlp` when enabled YouTube URLs are configured. Do not stream or download copyrighted music unless you have permission.
