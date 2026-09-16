# Stream audio
Put the local music files for the stream in this directory. At the start of each stream segment, the script randomly shuffles the supported files, plays them in that order, and loops the randomized playlist:

- `.mp3`
- `.wav`
- `.ogg`
- `.flac`
- `.m4a`
- `.aac`

Audio is read directly by FFmpeg, so Chromium/YouTube does not need to create a PulseAudio sink input. Do not commit copyrighted music unless you have permission to stream it.
