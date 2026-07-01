// ============================================================
// Deployment config.
//
// Set DEFAULT_SERVER to your hosted multiplayer server's address and the
// live site will connect players to it automatically — they won't need to
// type anything. Leave it '' to default to solo play.
//
// After deploying the server (see README → "Hosting it online"), paste its
// address here — hostname only is fine, e.g.:
//
//   export const DEFAULT_SERVER = 'stickman-mmo-server.onrender.com';
//
// Notes:
//   • The client auto-secures it to wss:// on the live HTTPS site, so you do
//     NOT need to include a scheme (ws:// / wss://).
//   • A ?server=<host> URL parameter still overrides this (handy for testing
//     against a different server).
//   • If the server is unreachable (e.g. a free instance is asleep), the game
//     falls back to solo automatically — it's always playable.
// ============================================================
export const DEFAULT_SERVER = 'stickman-mmo-server.onrender.com';
