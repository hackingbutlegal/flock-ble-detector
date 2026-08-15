# flock-ble-detector

An Android-Chrome **Web Bluetooth** tool that identifies **Flock Safety** BLE hardware — the
external battery / power-management IC (PMIC) and the **Raven** acoustic sensor — and, for
**authorized** security testing, verifies the BLE/DFU security controls on a target device. All
Bluetooth logic runs client-side in the browser; no app install, no root.

> ### ⚠️ Authorized use only
>
> The identification features (survey, chooser filter, Raven telemetry read) are passive and
> read-only. The **verification checks** (F1/CH-1/F4/F5/F2) actively probe and, for two of them,
> write to the device. Run the checks **only against a device you are explicitly engaged and
> authorized to assess.** This is a defensive / counter-surveillance and security-research tool.

---

## What it detects

| Target                            | Signals                                                                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flock external battery (PMIC)** | XUNTONG manufacturer id `0x09C8`, `Penguin-` / `FS Ext` GAP names, and the ASCII serial carried in the scan response.                                                        |
| **Flock Raven (acoustic sensor)** | Custom GATT services `0x3100`–`0x3500`. After connect, the tool reads the Raven's **read-only telemetry** — battery/PMIC power, GPS, LTE, upload counters, failure counters. |
| **DFU-capable devices**           | Nordic Secure DFU (`0xFE59`) and MCUmgr SMP (MCUboot DFU-over-BLE) as weaker, not-Flock-specific "firmware-updatable" signals.                                               |

**On identification confidence** (precision over recall — a false Flock is worse than a missed
one): a Flock-specific tell (`0x09C8` or a `Penguin`/`FS Ext` name) reads as **Confirmed**; a bare
DFU service reads only as **Likely (DFU-capable)**.

---

## How it works

### 1. Identification (passive, read-only)

- **Device chooser filter** narrows the Chrome device picker to units advertising `0x09C8`, a
  `Penguin`/`FS Ext` name, the Nordic DFU service, or the MCUmgr SMP service. Works today, no setup.
- **Survey nearby devices** passively profiles advertisements in range and ranks them by confidence
  then proximity. Uses Chrome's experimental scanning API — enable
  `chrome://flags/#enable-experimental-web-platform-features` if the survey button shows help text.

**The MAC is never visible.** Web Bluetooth exposes only `device.name` and advertised fields;
`device.id` is an opaque per-origin token, not the hardware MAC. The Flock battery also **randomizes**
its BLE address (a random static address, not an IEEE OUI), so there is no stable MAC/OUI to match —
identify a unit by **name**, **`0x09C8` company id**, and the decoded **serial** (the only durable
per-unit id).

### 2. Raven telemetry (read-only)

When a connected device exposes the Raven custom services, the tool reads the recognized
characteristics and shows them in the Device panel and the exported report. The Raven publishes each
value as a human-readable UTF-8 string, so reading is a plain GATT read + decode — no writes. The
power/PMIC group (Board Temperature, Battery Voltage, Charge/Discharge Current, 10 W Solar Voltage,
Battery State) is read first, then GPS, LTE/network, uploads, and failure counters. The Raven
service/characteristic map is derived from [`colonelpanichacks/flock-you`](https://github.com/colonelpanichacks/flock-you)
(see [Acknowledgements](#acknowledgements)).

### 3. Verification checks (authorized DFU assessment)

For an authorized engagement, the tool confirms whether a target enforces standard BLE/DFU security
controls. The checks assume a **Nordic Secure DFU** target and are non-destructive by default.

| Check    | Control tested                       | Type           | Notes                                                                                                                                   |
| -------- | ------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **F1**   | Just-Works (unauthenticated) pairing | Passive read   | Reads a protected characteristic as a probe; you classify from the Android pairing prompt you observe.                                  |
| **CH-1** | DFU reachable from a bare bond       | Passive        | Classifies the discovered DFU path; probes the buttonless characteristic only when it is the sole DFU surface. Does not flash firmware. |
| **F4**   | Unpaired privileged-write gate       | Active / write | Attempts a privileged write over the current link, then reads back.                                                                     |
| **F5**   | Plaintext passphrase logging         | Active / write | Submits a benign marker to the passphrase characteristic, then scans the log characteristic for it in cleartext.                        |
| **F2**   | DFU signature enforcement            | Active / write | Transfers the init (command) object and reads the command-Execute response — the discriminator for signature enforcement.               |

**Non-destructive by default.** F2 runs **abort-safe** (`commitBenignImage=false`): it stops after
the command-object Execute and never transfers image data. To exercise a full transfer you supply
your own benign, application-only DFU package (`manifest.json` + `.dat` + `.bin`); the harness ships
no image and has no arbitrary-image upload path. **Auto-run** (F1 → CH-1 → F4 → F5 → F2) never fires
the two irreversible actions: CH-1's buttonless reboot ENTER is skipped (send it manually), and F2
never flashes.

**Safety interlocks:**

- **Single writer for the charge path** — only `setChargeState()` writes a privileged/charge
  characteristic: it reads current, skips if already equal, writes, reads back, and throws unless the
  read-back is byte-identical.
- **Collision guard** — if the passphrase characteristic is configured to the same UUID as the charge
  characteristic, F4 and F5 abort rather than let a raw probe bypass the interlock.

> The survey/chooser identify the Flock battery, but its DFU mechanism is **not confirmed to be
> nRF-based**. On a non-Nordic-DFU device these checks may not map, and an `inconclusive` there
> reflects a **model mismatch, not a secure device**. Validate the DFU surface against the target's
> real GATT responses first.

---

## Quick start (local dev)

Requires **Node 22** and **pnpm**. Bluetooth needs a secure context — `http://localhost` counts, so
you can load and drive the UI against the built-in mock with no device.

```bash
corepack enable && pnpm install --frozen-lockfile
pnpm run dev      # serves http://localhost:<port>
```

For phone testing, build the static site and serve `public/` over **HTTPS** from any host (Web
Bluetooth requires HTTPS or localhost). Put it behind authentication if you expose it publicly.

```bash
pnpm run build    # bundles the client into public/assets/ and the logger into server/dist/
```

An optional Node logger (`server/`) records the verification results and GATT log to a server-side
audit file when you deploy it behind the site's `/api/` path. The bystander **survey is never
logged** — it profiles third-party devices and stays entirely client-side.

### Developing

```bash
pnpm run check    # oxfmt --check, oxlint, tsc (client + server), vitest
pnpm test         # vitest only
```

Stack: TypeScript (strict, ESM) · esbuild · vitest · oxlint / oxfmt.

---

## Reading results

Each check yields a **verdict**: `confirmed` (the weakness reproduced), `refuted` (the control was
enforced), or `inconclusive` (missing input or ambiguous response — the `limits` line says why; it is
**not** a pass). Export with **Copy results (Markdown / JSON)** or download the report.

---

## Acknowledgements

This tool builds on prior research into identifying and assessing Flock Safety infrastructure:

- **[colonelpanichacks/flock-you](https://github.com/colonelpanichacks/flock-you)** (MIT) — the
  Raven GATT service/characteristic map (`datasets/raven_configurations.json`) that drives this
  tool's read-only Raven telemetry decoder. flock-you is a promiscuous-mode 2.4 GHz WiFi detector for
  Flock infrastructure; this project reuses its BLE Raven map only.
- **[FlipDeFlock](https://github.com/ReconGrunt/FlipDeFlock)** — counter-surveillance research
  corroborating the Flock external-battery BLE identification signals and the precision-over-recall
  confidence model.
- **ryanohoro, "[Spotting Flock Safety's Falcon Cameras](https://www.ryanohoro.com/post/spotting-flock-safety-s-falcon-cameras)"**
  — primary source for the XUNTONG `0x09C8` manufacturer id, the `Penguin-` / `FS Ext Battery` GAP
  names, and the ASCII serial in the advertisement.
- **Anonymous Researcher** — BLE/DFU proof-of-concept work and vulnerability findings (nRF52 Secure
  DFU pairing, firmware-signature enforcement, unpaired privileged-write, and credential handling)
  that informed the design of this tool's verification checks (F1 / CH-1 / F4 / F5 / F2).

Third-party license notices are in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

## License

[MIT](LICENSE).
