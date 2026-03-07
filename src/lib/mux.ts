import Mux from "@mux/mux-node";

// Singleton Mux client
// Uses MUX_TOKEN_ID and MUX_TOKEN_SECRET from env
export const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
});
