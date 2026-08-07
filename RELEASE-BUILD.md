# Building a EverLua download

Run this from PowerShell after finishing a release:

```powershell
.\scripts\build-release.ps1
```

It creates `dist/EverLua-Beta-v<version>.zip`. The ZIP contains an obfuscated
extension build that users can load with Chrome or Edge's **Load unpacked**
button, plus the local bridge launch files.

Obfuscation slows copying but does not make a browser extension impossible to
reverse engineer. Do not include API keys, private URLs, or other secrets in
the extension or bridge.

## Distribution and source visibility

The EverLua source repository is private. Share only the generated ZIP through the official public downloads repository or another official download channel. The release build obfuscates the extension JavaScript to make casual copying harder, but no locally installed browser extension is impossible to reverse engineer. Keep secrets, API keys, and private service credentials out of every client-side file.

Official releases are free to use under the EverLua Beta Proprietary License. Do not distribute the development source or repackage the release ZIP.
