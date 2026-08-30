# Compact Spotify Connect controller

This repository contains a compact, keyboard-driven macOS controller for Spotify Connect. The product is an Electron application with a React renderer; the earlier feasibility work remains under `spikes/` as implementation evidence.

The project is under active development and is not yet distributed as a signed macOS application.

## Requirements

- macOS
- Node.js 22 or newer
- A Spotify Premium account
- A Spotify developer application
- `http://127.0.0.1:43821/callback` registered exactly as a redirect URI in the Spotify Developer Dashboard

## Authentication

The application uses Spotify's Authorization Code flow with PKCE. PKCE is intended for applications, such as desktop clients, that cannot safely contain a client secret. This project never requests or stores a Spotify client secret.

There are two ways to configure authentication.

### Use your own Spotify developer application

This is the simplest option for someone building the project from source:

1. Sign in to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an application. Its name must follow Spotify's [branding guidelines](https://developer.spotify.com/documentation/design).
3. Add `http://127.0.0.1:43821/callback` to the application's redirect URIs.
4. Copy the application's public Client ID.
5. Store the Client ID in macOS Keychain:

   ```sh
   npm install
   npm run probe -- configure
   ```

6. Build and start the desktop application:

   ```sh
   npm run desktop
   ```

7. Select **Authorize Spotify** in the application. Spotify opens in the system browser, displays the requested permissions, and redirects to the temporary local callback after approval.

The application requests only these scopes:

- Read private and collaborative playlists.
- Read playback state and the currently playing item.
- Control playback on Spotify Connect devices.

### Use another developer's application

A developer-mode Spotify application can currently authorize up to five Spotify users. The application owner must add each person's name and Spotify email address in **Developer Dashboard → App → Settings → Users Management**. See Spotify's current [quota-mode documentation](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) for the applicable limits.

An invited user does not need to create a separate developer application. They use the owner's public Client ID but authorize their own Spotify account. Their authorization does not provide access to the owner's Spotify account.

The current repository is a development build and does not yet provide a friendly first-run screen for entering a Client ID. Until packaging is implemented, invited source users configure the supplied Client ID with `npm run probe -- configure`. A future packaged build should either include the owner's public Client ID or provide an equivalent setup screen.

### Credential storage and security

The public Client ID and OAuth refresh token are stored in the user's macOS Keychain under the service `minimal-spotify-client`. Short-lived access tokens remain in Electron's main process. Access and refresh tokens are never passed to the React renderer, written to the repository, or intentionally logged.

During authorization, the application briefly listens on `127.0.0.1:43821` for the OAuth callback. The listener accepts the expected callback path, validates the random OAuth state value, and closes after completion or timeout. Normal application operation does not expose a local HTTP server.

If Spotify reports that authorization is no longer valid, the unusable refresh token is removed and the application offers authorization again. A user can also revoke access from their Spotify account's connected-app settings. To remove the locally stored authorization manually:

```sh
security delete-generic-password \
  -s minimal-spotify-client \
  -a refresh-token
```

The Client ID is public application configuration, not a password. A refresh token or access token must still never be committed or shared.

## Development commands

```sh
npm install
npm test
npm run typecheck
npm run build
npm run desktop
```

The retained command-line feasibility probe is available through `npm run probe -- help`.

## Project structure

- `src/main/` contains the Electron main process and validated IPC handlers.
- `src/preload/` exposes the narrow controller API to the renderer.
- `src/renderer/` contains the React interface and polling model.
- `src/spotify/` contains authorization, Web API transport, normalization, and playback control.
- `test/` contains product tests.
- `spikes/` contains the retained feasibility experiments.

See [Architecture](docs/architecture.md) for the process boundaries, authentication model, and reliability decisions that the product preserves.

## Sharing and distribution

Publishing this source code does not make the maintainer's Spotify account or credentials public. Someone cloning the repository must configure a Spotify Client ID and separately authorize their own Spotify account.

Broader distribution requires additional work, including a final name, Spotify-compliant attribution and links, a privacy policy, a signed and notarized macOS build, and any Spotify approval required for use beyond Development Mode.

## License

This project is available under the [MIT License](LICENSE).
