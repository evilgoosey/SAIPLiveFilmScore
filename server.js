import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');

const PORT = Number(process.env.PORT || 3000);

const VLC_URL =
  process.env.VLC_URL || 'http://127.0.0.1:8080';

const VLC_PASSWORD =
  process.env.VLC_PASSWORD || 'change-me';

const POLL_MS =
  Number(process.env.POLL_MS || 41);


// ------------------------------------------------------------
// MASTER CLIENT
// ------------------------------------------------------------

let master = null;


// ------------------------------------------------------------
// CURRENT VLC STATE
// ------------------------------------------------------------

let lastState = {
  connectedToVlc: false,

  playing: false,

  // High-resolution calculated movie time.
  // position × length
  time: 0,

  // Raw VLC time, retained for diagnostics.
  vlcTime: 0,

  // VLC's normalized playback position, normally 0–1.
  position: 0,

  // Movie duration in seconds.
  length: 0,

  rate: 1,

  title: ''
};


// ------------------------------------------------------------
// VLC AUTHENTICATION
// ------------------------------------------------------------

function vlcAuth() {
  return 'Basic ' +
    Buffer
      .from(':' + VLC_PASSWORD)
      .toString('base64');
}


// ------------------------------------------------------------
// GET VLC STATUS
// ------------------------------------------------------------

async function vlcStatus() {

  const response = await fetch(
    `${VLC_URL}/requests/status.json`,
    {
      headers: {
        Authorization: vlcAuth()
      },

      signal: AbortSignal.timeout(700)
    }
  );

  if (!response.ok) {
    throw new Error(
      `VLC HTTP ${response.status}`
    );
  }

  return response.json();
}


// ------------------------------------------------------------
// SEND COMMAND TO VLC
// ------------------------------------------------------------

async function vlcCommand(
  command,
  params = {}
) {

  const query = new URLSearchParams({
    command,
    ...params
  });

  const response = await fetch(
    `${VLC_URL}/requests/status.json?${query}`,
    {
      headers: {
        Authorization: vlcAuth()
      },

      signal: AbortSignal.timeout(1000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `VLC HTTP ${response.status}`
    );
  }

  return response.json();
}


// ------------------------------------------------------------
// NORMALISE VLC STATUS
// ------------------------------------------------------------

function normaliseStatus(s) {

  const vlcTime =
    Number(s.time || 0);

  const length =
    Number(s.length || 0);

  const position =
    Number(s.position || 0);

  let preciseTime;

  /*
   * VLC's "time" value may be reported as whole seconds.
   *
   * VLC also provides "position", a normalized floating-point
   * value between 0 and 1.
   *
   * We therefore reconstruct the movie time using:
   *
   *     position × length
   *
   * This gives us substantially finer timing than using the
   * integer "time" field alone.
   */

  if (
    length > 0 &&
    Number.isFinite(position)
  ) {

    preciseTime =
      position * length;

  } else {

    preciseTime =
      vlcTime;
  }


  // Keep the calculated time inside the movie.
  if (length > 0) {

    preciseTime =
      Math.max(
        0,
        Math.min(length, preciseTime)
      );
  }


  return {

    connectedToVlc: true,

    playing:
      s.state === 'playing',

    // High-resolution calculated time.
    time:
      preciseTime,

    // Raw VLC value for diagnostics.
    vlcTime:

      Number.isFinite(vlcTime)
        ? vlcTime
        : 0,

    // Normalized VLC position.
    position:

      Number.isFinite(position)
        ? position
        : 0,

    // Duration in seconds.
    length:

      Number.isFinite(length)
        ? length
        : 0,

    rate:

      Number(s.rate || 1),

    title:

      s.information?.category?.meta?.filename ||
      s.information?.category?.meta?.title ||
      ''
  };
}


// ------------------------------------------------------------
// BROADCAST STATE TO ALL CLIENTS
// ------------------------------------------------------------

function broadcast(payload) {

  const message =
    JSON.stringify(payload);

  for (const client of wss.clients) {

    if (client.readyState === 1) {

      client.send(message);
    }
  }
}


// ------------------------------------------------------------
// POLL VLC
// ------------------------------------------------------------

async function pollVlc() {

  try {

    const vlcState =
      await vlcStatus();

    const state =
      normaliseStatus(vlcState);

    /*
 * Only broadcast when the VLC timing state
 * has actually changed.
 */

const changed =
  state.time !== lastState.time ||
  state.playing !== lastState.playing ||
  state.length !== lastState.length ||
  state.rate !== lastState.rate ||
  state.title !== lastState.title ||
  state.connectedToVlc !== lastState.connectedToVlc;


lastState =
  state;


if (changed) {

  broadcast({

    type: 'state',

    ...state,

    masterConnected:
      Boolean(master)
  });
}

  } catch (err) {

    lastState = {

      ...lastState,

      connectedToVlc: false
    };

    broadcast({

      type: 'state',

      ...lastState,

      masterConnected:
        Boolean(master)
    });
  }
}


// ------------------------------------------------------------
// HTTP SERVER
// ------------------------------------------------------------

const server =
  http.createServer((req, res) => {

    const url =
      new URL(
        req.url,
        `http://${req.headers.host}`
      );


    let file =
      url.pathname === '/'
        ? 'index.html'
        : url.pathname.slice(1);


    // Prevent directory traversal.
    file =
      path
        .normalize(file)
        .replace(
          /^\.\.(?:[\\/]|$)/,
          ''
        );


    const full =
      path.join(
        PUBLIC,
        file
      );


    if (!full.startsWith(PUBLIC)) {

      res.writeHead(403);
      res.end('Forbidden');

      return;
    }


    fs.readFile(
      full,
      (err, data) => {

        if (err) {

          res.writeHead(404);
          res.end('Not found');

          return;
        }


        const ext =
          path.extname(full);


        const types = {

          '.html':
            'text/html; charset=utf-8',

          '.js':
            'text/javascript; charset=utf-8',

          '.css':
            'text/css; charset=utf-8',

          '.png':
            'image/png',

          '.jpg':
            'image/jpeg',

          '.jpeg':
            'image/jpeg',

          '.svg':
            'image/svg+xml'
        };


        res.writeHead(
          200,
          {
            'Content-Type':
              types[ext] ||
              'application/octet-stream',

            'Cache-Control':
              'no-store'
          }
        );


        res.end(data);
      }
    );
  });


// ------------------------------------------------------------
// WEBSOCKET SERVER
// ------------------------------------------------------------

const wss =
  new WebSocketServer({
    server
  });


wss.on(
  'connection',
  (ws, req) => {

    const url =
      new URL(
        req.url,
        `http://${req.headers.host}`
      );


    const wantsMaster =
      url.searchParams.get('master') === '1';


    /*
     * Only one Master is permitted.
     */

    const isMaster =
      wantsMaster &&
      master === null;


    if (isMaster) {

      master =
        ws;
    }


    // Tell the new client its role
    // and the current VLC state.

    ws.send(
      JSON.stringify({

        type: 'hello',

        role:
          isMaster
            ? 'master'
            : 'player',

        ...lastState,

        masterConnected:
          Boolean(master)
      })
    );


    // Someone requested Master but
    // another Master already exists.

    if (
      wantsMaster &&
      !isMaster
    ) {

      ws.send(
        JSON.stringify({

          type: 'error',

          message:
            'A master is already connected.'
        })
      );
    }


    // --------------------------------------------------------
    // COMMANDS
    // --------------------------------------------------------

    ws.on(
      'message',
      async raw => {

        /*
         * Players cannot send commands.
         */

        if (ws !== master) {
          return;
        }


        let msg;


        try {

          msg =
            JSON.parse(
              raw.toString()
            );

        } catch {

          return;
        }


        try {

          // --------------------------------------------------
          // PLAY
          // --------------------------------------------------

          if (
            msg.type === 'play'
          ) {

            await vlcCommand(
              'pl_play'
            );
          }


          // --------------------------------------------------
          // PAUSE
          // --------------------------------------------------

          if (
            msg.type === 'pause'
          ) {

            await vlcCommand(
              'pl_pause'
            );
          }


          // --------------------------------------------------
          // STOP
          // --------------------------------------------------

          if (
            msg.type === 'stop'
          ) {

            await vlcCommand(
              'pl_stop'
            );
          }


          // --------------------------------------------------
          // SEEK
          // --------------------------------------------------

          if (
            msg.type === 'seek'
          ) {

            const requestedTime =
              Math.round(Number(msg.time));

                        
            if (
              !Number.isFinite(
                requestedTime
              )
            ) {

              return;
            }


            const duration =
              Number(
                lastState.length || 0
              );


            let seconds =
              Math.max(
                0,
                requestedTime
              );


            // Don't seek beyond the movie.

            if (duration > 0) {

              seconds =
                Math.min(
                  seconds,
                  duration
                );
            }


            await vlcCommand(
              'seek',
              {
                val:
                  `${seconds}s`
              }
            );
          }

        } catch (err) {

          ws.send(
            JSON.stringify({

              type: 'error',

              message:
                err.message
            })
          );
        }
      }
    );


    // --------------------------------------------------------
    // CLIENT DISCONNECT
    // --------------------------------------------------------

    ws.on(
      'close',
      () => {

        if (
          master === ws
        ) {

          master = null;


          broadcast({

            type: 'master',

            connected: false
          });
        }
      }
    );
  }
);


// ------------------------------------------------------------
// START SERVER
// ------------------------------------------------------------

server.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log(
      `Score server: http://localhost:${PORT}`
    );

    console.log(
      `Master UI:    http://localhost:${PORT}/?master=1`
    );

    console.log(
      `VLC API:      ${VLC_URL}`
    );

    console.log(
      `VLC polling:  ${POLL_MS} ms`
    );
  }
);


// ------------------------------------------------------------
// START VLC POLLING
// ------------------------------------------------------------

setInterval(
  pollVlc,
  POLL_MS
);


// Get an initial state immediately.

pollVlc();