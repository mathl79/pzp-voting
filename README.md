 # PZP Voting

A decentralized voting application built with PZP protocol, Electron, and Cordova.

## based on the great decentral protocol PZP 
 https://codeberg.org/pzp/

## Features

- Create and participate in polls
- Real-time vote updates
- Decentralized architecture using PZP protocol
- Cross-platform support (Desktop, Web, Android, iOS)
- Invite system for joining polls
- Connection status monitoring

## Prerequisites

- Node.js 14+
- Cordova CLI (`npm install -g cordova`)
- For Android development:
  - Android Studio
  - Android SDK
- For iOS development:
  - Xcode
  - iOS SDK

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Add platforms:
   ```bash
   cordova platform add browser
   cordova platform add android  # Optional
   cordova platform add ios     # Optional, macOS only
   ```

## Development

- Run in browser:
  ```bash
  npm start
  ```
- Run in Electron:
  ```bash
  npm run electron
  ```
- Run on Android:
  ```bash
  npm run android
  ```
- Run on iOS:
  ```bash
  npm run ios
  ```

## Building

- Build all platforms:
  ```bash
  npm run build
  ```

## Architecture

The application uses:
- Electron for desktop
- Cordova for mobile/web
- PZP protocol for decentralized communication
- Secret-handshake for secure connections
- Pull-streams for data flow

## License

MIT
