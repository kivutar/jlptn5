# ChakuChaku mobile and PWA plan

This document is the implementation roadmap for shipping ChakuChaku as a
Progressive Web App and as native iOS and Android store applications from one
shared codebase.

## Architecture

The existing static build remains the source of truth:

```text
HTML, CSS, JavaScript, lesson data, and voices
└── dist/
    ├── PWA hosted on the web
    ├── Capacitor iOS application
    └── Capacitor Android application
```

Native applications bundle `dist/`; they do not load the hosted site. Core
study features therefore work offline and store releases contain a reviewed,
fixed version of the application. The PWA service worker is registered only in
a browser build, because native applications already bundle their assets.

Shared platform features are accessed through small application-owned adapters.
The web implementation uses browser APIs and the native implementation uses
Capacitor plugins. Study and SRS modules must not depend directly on Capacitor.

## Decisions

- Use Capacitor 8 for iOS and Android.
- Keep `dist/` as Capacitor's `webDir`.
- Ship one audio collection: mono AAC-LC in M4A containers.
- Keep WAV files only as generation masters when they are useful; do not include
  them in web or native release bundles.
- Target Android API 36 and support Android API 24 and later.
- Treat the current browser storage as migration input, not durable mobile
  storage.
- Use native Preferences for the current lightweight SRS/settings payload and
  retain a storage boundary that can move to SQLite if the data model grows.
- Add explicit progress export/import before release because the installed app
  cannot read the hosted site's browser storage.
- Avoid unnecessary device permissions, analytics, advertising SDKs, and remote
  executable content.
- Gate optional OpenAI correction behind an explicit disclosure and user action;
  never bundle an API secret.

## Seven implementation stages

### 1. Record the architecture and release constraints

- [x] Save the cross-platform architecture and decisions in the repository.
- [x] Record Android, iOS, PWA, storage, audio, and privacy constraints.
- [x] Keep the operational publishing checklist current as store requirements
  change.

Acceptance: contributors can determine how every release target is produced
without relying on conversation history.

### 2. Compress and harden audio

- [x] Convert committed WAV voices to mono AAC-LC M4A files.
- [x] Update generated lesson data and browser loading to use `.m4a`.
- [x] Keep the existing WAV duration/silence validation before conversion.
- [x] Validate each encoded file with a decoder and reject empty output.
- [x] Update voice generation, static builds, tests, and documentation.
- [x] Ensure release bundles contain M4A files and no WAV files.

Acceptance: all existing narration still plays, generated audio remains guarded
against long silence, and the release audio footprint is materially smaller.

### 3. Make progress durable and transferable

- [x] Introduce a persistence adapter used by SRS, learning statistics, and
  settings.
- [x] Use browser storage on the web and Capacitor Preferences on native builds.
- [x] Migrate existing browser keys without losing progress.
- [x] Add versioned JSON export/import with validation.
- [x] Add user-facing backup, restore, and reset controls.

Acceptance: a learner can upgrade without data loss, restart a native app
without losing progress, and manually transfer progress between installations.

### 4. Add the Progressive Web App

- [x] Add a web app manifest, install icons, theme colors, and mobile metadata.
- [x] Add a versioned service worker for the application shell and lesson data.
- [x] Cache voices on demand rather than pre-caching the complete collection.
- [x] Provide an offline fallback and safe update behavior.
- [x] Do not register the service worker inside Capacitor.

Acceptance: the hosted application is installable and all core study flows work
after a successful initial load without a network connection.

### 5. Add native projects

- [x] Add Capacitor configuration with `dist` as `webDir`.
- [x] Generate and configure the Android project for target API 36/minimum API
  24.
- [x] Generate and configure the iOS project for the currently supported Xcode
  and iOS versions.
- [x] Use stable package and bundle identifiers before any store upload.
- [x] Document build and synchronization commands.

Acceptance: Android debug builds run from the bundled static output, and the iOS
project is ready to open, sign, and test on macOS.

### 6. Add native-quality behavior

- [x] Generate iOS icons and Android adaptive/monochrome icons from the approved
  brand artwork.
- [x] Coordinate native and HTML splash screens without showing two loaders.
- [x] Add haptic answer feedback with a no-op web fallback.
- [x] Add optional daily local review reminders and request permission in context.
- [x] Handle Android back navigation, edge-to-edge system bars, safe areas, and
  mobile keyboard resizing.
- [x] Verify external links open safely outside the application.

Acceptance: both native applications feel intentional and require only the
permissions needed for user-selected functionality.

### 7. Verify and prepare distribution

- [ ] Run unit, static-build, PWA, offline, and native smoke tests.
- [ ] Test supported phone sizes, dark mode, reduced motion, and screen readers.
- [ ] Publish the public privacy policy and verify its in-app link after deployment.
- [ ] Complete Apple privacy declarations and Google Play Data Safety answers.
- [ ] Prepare store icons, screenshots, descriptions, content ratings, and review
  notes.
- [ ] Distribute Android through an internal/closed Play test and iOS through
  TestFlight before production review.

Acceptance: signed release candidates and their store metadata are ready for
review, with a documented rollback and progress-backup procedure.

## Environment notes

The current Linux workspace has Node.js 22 and FFmpeg. Android builds additionally
need Android Studio 2025.2.1 or newer and an Android API 36 SDK; those tools are
not installed yet. Android can be built and signed on Linux. Final iOS building,
signing, device testing, and App Store upload require current Xcode on macOS.

Useful commands:

```sh
npm run native:sync  # rebuild dist and copy it into both native projects
npm run android:run  # build and launch on a connected device/emulator
npm run android:open # open the Android project in Android Studio
npm run ios:open     # open the iOS project in Xcode (macOS only)
```

For a new personal Google Play developer account, schedule the required closed
test before the desired launch date. Store requirements are external and must be
rechecked immediately before submission.
