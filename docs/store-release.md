# ChakuChaku store release checklist

This checklist turns the shared static build into App Store and Google Play
releases. Recheck the linked policies before every submission; store rules and
SDK deadlines change independently of this repository.

## Current application identity

- Display name: `ChakuChaku`
- Apple bundle identifier: `com.kivutar.chakuchaku`
- Android application identifier: `com.kivutar.chakuchaku`
- Initial marketing version: `1.0`
- Initial iOS build / Android version code: `1`
- iOS minimum version: 15.0
- Android minimum SDK: 24
- Android target and compile SDK: 36

Google Play requires new phone and tablet submissions to target Android 16
(API 36) from August 31, 2026. New personal developer accounts created after
November 13, 2023 must also complete a closed test with at least 12 opted-in
testers for 14 continuous days before applying for production access.

Sources:

- [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [Google Play personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple required-reason API declarations](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)

## Build inputs

1. Run `npm ci` from a clean checkout.
2. Run `npm test` and `npm run test:voices`.
3. Run `npm run native:sync` and confirm both platforms list all expected
   Capacitor plugins.
4. Confirm the generated native public bundles contain M4A voices and no WAV,
   `.key`, source exercise data, or development cache files.
5. Increment both the visible version and build/version code for every uploaded
   binary. Never reuse a build number already uploaded to either store.

## Android

### Automated APK releases

Publishing a GitHub Release automatically runs
`.github/workflows/android-release.yml` against that release's tag. The job
tests the application, synchronizes the Capacitor project, builds a signed
release APK, verifies its signature, and attaches it to the GitHub Release as
`ChakuChaku-<tag>.apk`. Draft releases do not trigger a build; publishing a
stable release or pre-release does.

Configure these repository Actions secrets once before publishing a release:

- `ANDROID_KEYSTORE_BASE64`: the release keystore encoded as one Base64 line.
- `ANDROID_KEYSTORE_PASSWORD`: the keystore password.
- `ANDROID_KEY_ALIAS`: the release key alias.
- `ANDROID_KEY_PASSWORD`: the release key password.

On Arch Linux, create and upload a private release keystore with:

```sh
keytool -genkeypair -v \
  -keystore chakuchaku-release.jks \
  -alias chakuchaku \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
base64 -w 0 chakuchaku-release.jks > chakuchaku-release.jks.base64
gh secret set ANDROID_KEYSTORE_BASE64 < chakuchaku-release.jks.base64
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS
gh secret set ANDROID_KEY_PASSWORD
```

Keep an offline backup of the keystore and its credentials. Losing the signing
key can prevent future APK updates. Neither the keystore nor the Base64 copy
belongs in Git. Use version tags such as `v1.0.0`; the tag becomes Android's
visible `versionName`, while the workflow run number becomes its monotonically
increasing `versionCode` with a 1000-point offset from the original local
builds.

The generated APK is useful for direct installation and testing. Google Play
requires an Android App Bundle for new store applications, so build an AAB for
the Play upload once the release APK has passed device testing.

### Device and store checks

1. Install the Android API 36 SDK. Android Studio is optional; Gradle and the
   command-line SDK tools are sufficient.
2. Open the project with `npm run android:open` or run a device build with
   `npm run android:run`.
3. Confirm the merged release manifest does **not** contain
   `SCHEDULE_EXACT_ALARM`. Daily reminders are intentionally inexact.
4. Test Android 7/API 24 and current Android, gesture and three-button back,
   notification denial/approval, IME resizing, offline launch, audio playback,
   progress export/import, and process death/relaunch.
5. Confirm the private upload key is backed up and the GitHub Actions secrets
   are configured. Do not commit a keystore or credentials.
6. Build an Android App Bundle with `./gradlew bundleRelease`, upload it to the
   Play internal track, then run the required closed test if the account is in
   scope.

## iOS

1. On a Mac with current Xcode, run `npm run ios:open`.
2. Select the correct Apple developer team and keep automatic signing enabled
   unless release infrastructure provides managed signing.
3. Confirm `PrivacyInfo.xcprivacy` is present in the built app and includes the
   approved UserDefaults (`CA92.1`) and file timestamp (`C617.1`) reasons.
4. Test the oldest supported iOS version and a current iPhone: safe areas,
   light/dark system appearance, notification denial/approval, Japanese and
   English keyboards, offline launch, audio, progress export/import, and app
   relaunch.
5. Archive with the Release configuration, validate the archive, upload it to
   App Store Connect, and distribute it through TestFlight before review.

## Privacy and store forms

The public and in-app policy URL is
`https://kivutar.github.io/jlptn5/privacy.html`. Apple requires a privacy-policy
link both in App Store Connect and inside the app.

Baseline declarations, to be confirmed against the final binary:

- No accounts, analytics, advertising, tracking, contacts, location, camera,
  microphone, or advertising identifier.
- SRS state, answers, and settings remain on the device unless the learner
  explicitly exports a backup.
- Notification permission is optional and requested only when the learner
  enables a daily reminder.
- Optional AI autocorrection sends user-entered answer text and exercise context
  directly to OpenAI using the learner's own key. Disclose this as optional User
  Content used for App Functionality, not linked to an account and not used for
  tracking. Requests set `store: false`; default API abuse-monitoring logs may
  still retain prompts and responses for up to 30 days. Recheck
  [OpenAI's API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
  before submitting the privacy forms.
- The API key is session-only and excluded from progress backups.

## Store assets and review notes

- Export final 1024 px iOS and 512 px Google Play icons from the approved art.
- Capture truthful phone screenshots for Grammar, Kana, Vocabulary, Statistics,
  and the progress backup controls. Do not include placeholder or generated
  content that differs from the submitted binary.
- Suggested subtitle/short description: `Build Japanese steadily, one review at a time.`
- Explain in review notes that the app works offline, has no account, and that
  AI autocorrection and daily reminders are optional. Provide exact steps for
  reviewers to locate both features.
- Use the repository issue tracker as the support URL until a dedicated support
  page or email address is available.

## Rollback and learner safety

- Keep the previous accepted binaries available in the store consoles until the
  new rollout is stable.
- Start Google Play production with a staged rollout.
- Never change SRS or statistics storage versions without a tested migration.
- Before a risky persistence change, ask TestFlight/closed-test users to export
  a progress backup and verify that the previous release can still import it.
