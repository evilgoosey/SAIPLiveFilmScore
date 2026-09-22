# Man with a Movie Camera — Networked Graphic Score

A local web-based synchronized graphic score for live performance of Dziga Vertov's *Man with a Movie Camera* (1929). In particulr, this version 
syncs with the version distributed on Wikipedia's "Man With A Movie Camera" entry:

  https://upload.wikimedia.org/wikipedia/commons/f/f5/%D0%A7%D0%B5%D0%BB%D0%BE%D0%B2%D0%B5%D0%BA_%D1%81_%D0%BA%D0%B8%D0%BD%D0%BE%D0%B0%D0%BF%D0%BF%D0%B0%D1%80%D0%B0%D1%82%D0%BE%D0%BC_%281929%29.webm?utm_source=en.wikipedia.org&utm_campaign=index&utm_content=original

The system displays a large scrolling horizontal graphic score in a web browser and synchronises its position to the playback position of the film in VLC.

It is designed for composers and performers to work with the score on separate devices over a local network.

*Some of this readme is AI generated

---

## Overview

The score uses a single long PNG representing the complete 01:06:59 duration of *Man with a Movie Camera*.

The system uses:

- **VLC** as the film playback master
- **Node.js** as the local server
- **WebSockets** for distributing playback state
- **HTML/CSS/JavaScript** for the score display
- **PNG** for the graphic score

No internet connection is required once the project files and dependencies are installed.

---

## System Architecture

```text
                    ┌─────────────────┐
                    │      VLC        │
                    │  Film playback  │
                    └────────┬────────┘
                             │
                      VLC HTTP API
                             │
                             ▼
                    ┌─────────────────┐
                    │   Node Server   │
                    │                 │
                    │ • Polls VLC     │
                    │ • Tracks time   │
                    │ • Master role   │
                    │ • WebSockets    │
                    └────────┬────────┘
                             │
                       WebSocket
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Player 1 │   │ Player 2 │   │ Player N │
        │ Browser  │   │ Browser  │   │ Browser  │
        └──────────┘   └──────────┘   └──────────┘
```

The browser clients do not communicate directly with VLC.

Only the server communicates with VLC.

---

## Score Geometry

The canonical score image is:

```text
Width:   16076 px
Height:    730 px
```

The film duration is:

```text
4019 seconds
66:59.000
```

The score uses a horizontal scale of:

```text
4 pixels = 1 second
```

Therefore:

```text
4019 × 4 = 16076 pixels
```

A position in the film maps directly to a position on the score:

```text
scoreX = movieTime × 4
```

### Playhead

The playhead is fixed at:

```text
200 px
```

from the left edge of the score viewport.

The score moves underneath it.

```text
                    fixed playhead
                         │
                         ▼
        ┌────────────────┼─────────────────┐
        │                │                 │
 SCORE ──────────────────┼──────────────────────
        │                │                 │
        └────────────────┴─────────────────┘
```

---

## Browser Rendering

The score image is vertically scaled to fit the available score viewport.

The horizontal position is calculated from the film time.

The core relationship is:

```javascript
const scoreX = movieTime * PIXELS_PER_SECOND;

const scale =
  score.naturalHeight > 0
    ? viewport.clientHeight / score.naturalHeight
    : 1;

const imageX =
  PLAYHEAD_X - scoreX * scale;
```

The image is positioned using a GPU-friendly transform:

```javascript
score.style.transform =
  `translate3d(${imageX}px, 0, 0)`;
```

The playhead itself remains stationary.

---

## Timing

VLC provides playback information through its HTTP interface.

The server polls VLC approximately every:

```text
100 ms
```

The server distributes the current playback state to all connected browsers.

The browser then uses `requestAnimationFrame()` to interpolate the displayed position between server updates.

This prevents the score from being visually limited to the approximately 10 updates/second rate of the VLC polling loop.

The browser prediction is based on:

```javascript
state.time +
elapsed * state.rate
```

while VLC is playing.

---

## VLC

VLC must be running with its HTTP interface enabled. 

In VLC go to tools>preferences> show settings = all , and then to Main Interfaces> Tick the "web" box. 
Then go to Main Interfaces>Lua and change Lua Interface to "http" (default is "dummy") and the password to "change-me" or whatever
you have the password set to in server.js.

The server expects VLC at:

```text
http://127.0.0.1:8080
```

by default.

The VLC HTTP interface requires a password.

The password is supplied to the Node server through:

```text
VLC_PASSWORD
```

The VLC URL can also be changed with:

```text
VLC_URL
```

### Example

```bash
VLC_PASSWORD=my-password node server.js
```

Or:

```bash
VLC_URL=http://127.0.0.1:8080 VLC_PASSWORD=my-password node server.js
```

---

## Running the Server

Install dependencies:

```bash
npm install
```

Then start the server:

```bash
node server.js
```

The default server port is:

```text
3000
```

The server listens on:

```text
0.0.0.0
```

so that other devices on the local network can connect.

The console will report:

```text
Score server: http://localhost:3000
Master UI:    http://localhost:3000/?master=1
```

---

## Connecting Devices

The computer running the server acts as the host.

Other computers, tablets or phones on the same local network can open:

```text
http://HOST-IP:3000
```

For example:

```text
http://192.168.1.100:3000
```

The browser does not need to be on the same computer as VLC.

It only needs network access to the Node server.

---

## Master and Player Roles

There is one master client.

The master is opened with:

```text
/?master=1
```

For example:

```text
http://192.168.1.100:3000/?master=1
```

All other clients are ordinary players:

```text
http://192.168.1.100:3000
```

### Master

The master can:

- Play
- Pause
- Stop
- Seek
- Control the VLC playback position

### Players

Players:

- Receive playback state
- Display the synchronized score
- Cannot control VLC
- Cannot seek the master playback

If a second client attempts to connect as master while another master is already connected, it remains a player and receives an error message indicating that the master role is occupied.

---

## Seeking

The master interface includes a timeline slider.

The slider represents **absolute film time in seconds**.

For example:

```text
0       = 00:00
600     = 10:00
1200    = 20:00
2000    = 33:20
4019    = 66:59
```

The slider uses whole-second increments.

This is intentional because VLC's HTTP seek interface expects the value to be interpreted as a time value, and fractional slider values produced unreliable seeking behaviour.

When the slider is released:

1. The master pauses playback if necessary.
2. The requested time is sent to the server.
3. The server sends the seek command to VLC.
4. VLC changes position.
5. The resulting VLC state is distributed to all clients.

---

## File Structure

A minimal project looks like:

```text
project/
│
├── server.js
├── package.json
├── package-lock.json
├── README.md
│
└── public/
    ├── index.html
    └── score.png
```

Additional assets can be placed in `public/` as required.

---

## Score Image

The score image should retain its canonical dimensions:

```text
16076 × 730 px
```

Do not resize the score image to fit the browser window.

The browser performs the vertical scaling automatically.

The horizontal coordinate system remains based on:

```text
4 px / second
```

Changing the physical dimensions of the source image will therefore change the relationship between the score and the film.

---

## Timing Grid

A timing grid can be incorporated into the score image or maintained as a separate layer during score creation.

The canonical grid is:

### 10-second markers

```text
40 px
```

### 1-minute markers

```text
240 px
```

### 10-minute markers

```text
2400 px
```

Major labels occur at:

```text
00:00
10:00
20:00
30:00
40:00
50:00
60:00
```

The final film position is:

```text
66:59
```

at:

```text
x = 16076 px
```

---

## Designing New Scores

The system deliberately keeps the score representation simple.

A composer can work directly with the full-resolution PNG.

The important constraint is that horizontal position corresponds to film time:

```text
1 second   = 4 px
10 seconds = 40 px
1 minute   = 240 px
10 minutes = 2400 px
```

This makes it possible to work visually with precise points in the film without requiring a conventional musical timeline.

A timing grid can be added to the top of the score during composition and removed or hidden for performance if required.

---

## Synchronization Model

The film itself remains the authoritative clock.

The server does not attempt to create a separate master clock.

Instead:

```text
VLC
 ↓
current playback state
 ↓
Node server
 ↓
WebSocket
 ↓
browser clients
```

This means that if VLC is paused, the score stops.

If VLC is moved to another position, the score follows.

If VLC is playing, the browser score advances continuously.

---

## Network Requirements

The system is intended for a local network.

All participating devices need to be able to reach the computer running the Node server on the configured port.

For the default configuration:

```text
TCP port 3000
```

The server itself does not require internet access.

A wired Ethernet network is also possible if the participating devices and network infrastructure support it.

---

## Current Limitations

This is a prototype system.

Known characteristics include:

- VLC must be running separately.
- VLC must have its HTTP interface enabled.
- The score is currently a raster image rather than a vector or dynamically generated score.
- The system currently assumes a single film and corresponding score geometry.
- There is one master client.
- Player clients are read-only.
- Synchronization depends on network latency and VLC polling.
- Very large score images may place a significant rendering load on some mobile browsers.

The browser renderer uses `requestAnimationFrame()` for smooth motion, but the perceived smoothness can still depend on the device's ability to continuously render and transform the large score image.

---

## Development Notes

The system intentionally avoids unnecessary dependencies.

The server provides:

- Static file serving
- VLC communication
- WebSocket communication
- Master/client management

The browser provides:

- Score rendering
- Playback display
- Master controls
- Timeline interaction

This keeps the architecture relatively small and makes the system easy to modify for future performances.

---

## Possible Future Development

Potential extensions include:

- Multiple independent score layers
- Per-player visualisation
- Dynamic annotations
- Cue markers
- Section labels
- OSC output
- MIDI output
- Audio-event triggers
- Per-device score variants
- Multiple simultaneous masters/sessions
- Persistent score annotations
- Automatic VLC playlist management
- More precise network clock synchronisation

These are not currently required for the basic prototype.

---

## Credits

Developed as a research/performance tool for work with Dziga Vertov's *Man with a Movie Camera* (1929).

The system is intended to support experimental approaches to film scoring in which musical structure, visual montage and temporal relationships can be represented directly within a shared graphical timeline.
