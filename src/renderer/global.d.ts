import type { SpotifyControllerApi } from '../spotify/types.js';

declare global {
  interface Window {
    spotifyController: SpotifyControllerApi;
  }
}

export {};
