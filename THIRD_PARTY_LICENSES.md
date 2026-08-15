# Third-party licenses and attributions

## colonelpanichacks/flock-you (MIT)

The read-only Raven telemetry decoder (`src/ble/raven.ts`) derives its service and characteristic
map from `datasets/raven_configurations.json` in
<https://github.com/colonelpanichacks/flock-you>. That project is distributed under the MIT License:

```
MIT License

Copyright (c) 2026 colonelpanichacks

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Research sources (facts, not code)

The Flock external-battery identification signals are reimplemented from published research; no code
was copied from these sources:

- **FlipDeFlock** — counter-surveillance research on Flock BLE identification signals and the
  precision-over-recall confidence model.
- **ryanohoro, "Spotting Flock Safety's Falcon Cameras"** — the XUNTONG `0x09C8` manufacturer id, the
  `Penguin-` / `FS Ext Battery` GAP names, and the ASCII serial in the advertisement.
- **Anonymous Researcher** — a private BLE/DFU proof-of-concept and vulnerability findings that
  informed the verification-check methodology (pairing authentication, DFU signature enforcement,
  privileged-write gating, credential handling). No code or exploit detail from this source is
  included in this repository.
