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
Width:   64304 px
Height:    730 px
```

The film duration is:

```text
4019 seconds
1:06:59.000
```

The score uses a horizontal scale of:

```text
16 pixels = 1 second
```

### Playhead

The playhead is fixed at:

```text
200 px
```

from the left edge of the score viewport.


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
42 ms (~24fps)
```

The server distributes the current playback state to all connected browsers.

The browser then uses `requestAnimationFrame()` to interpolate the displayed position between server updates.

## VLC

VLC must be running with its HTTP interface enabled. 

   In VLC go to tools>preferences> show settings = all , and then to Main Interfaces> Tick the "web" box abd "Lua" box. 
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
localhost
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

There is one master client who has play stop scrub controls:

```text
http://192.168.1.100:3000/?master=1
```

All other clients are ordinary players:

```text
http://192.168.1.100:3000
```

Non-Master Players:

- Receive playback state
- Display the synchronized score
- Cannot control VLC
- Cannot seek/scrub the master playback

If a second client attempts to connect as master while another master is already connected, it remains a player and receives an error message indicating that the master role is occupied.

---

When the slider is pressed:

1. The master pauses playback if playing.

When the slider is released:

2. The requested time is sent to the server.
3. The server sends the seek command to VLC.
4. VLC changes position and plays
5. The resulting VLC state is distributed to all clients.

---



## Score Image

The score image MUST retain its canonical dimensions when altered or added to:

```text
64304 × 730 px
```

Changing the physical dimensions of the source image will therefore change the relationship between the score and the film.

---

## Timing Grid

A timing grid can be incorporated into the score image or maintained as a separate layer during score creation.

The canonical grid is:

### 10-second markers

```text
160 px
```

### 1-minute markers

```text
960 px
```

### 10-minute markers and numbering:

```text
9600 px
```

---

## Designing New Scores

The system deliberately keeps the score representation simple.

A composer can work directly with the full-resolution PNG.

The important constraint is that horizontal position corresponds to film time:

This makes it possible to work visually with precise points in the film without requiring a conventional musical timeline.

---

## Network Requirements

The system is intended for a local network. Be sure to allow ports through any firewall.

All participating devices need to be able to reach the computer running the Node server on the configured port.

For the default configuration:

```text
TCP port 3000
```

The server itself does not require internet access.

A wired Ethernet network is also possible if the participating devices and network infrastructure support it.



