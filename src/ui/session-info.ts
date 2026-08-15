/**
 * Optional session metadata (device name + target/scope) captured for the report header and the
 * backend log. This panel does not gate testing: access to the tool is controlled at the edge
 * (basic auth limits it to authorized testers), so no per-run authorization step is imposed.
 */
export interface SessionMeta {
  readonly deviceName?: string;
  readonly target?: string;
}

/** Handle returned by {@link mountSessionInfo} for reading the captured metadata synchronously. */
export interface SessionInfoHandle {
  getMeta(): SessionMeta;
}

/**
 * Build a trimmed metadata object, omitting blank fields.
 *
 * Blank or whitespace-only inputs are dropped so the report/log carry only supplied values
 * (exactOptionalPropertyTypes-safe: absent rather than empty-string).
 */
export function sessionMeta(deviceName: string, target: string): SessionMeta {
  const meta: { deviceName?: string; target?: string } = {};
  const trimmedDevice = deviceName.trim();
  if (trimmedDevice.length > 0) {
    meta.deviceName = trimmedDevice;
  }
  const trimmedTarget = target.trim();
  if (trimmedTarget.length > 0) {
    meta.target = trimmedTarget;
  }
  return meta;
}

function appendLabeledInput(
  root: HTMLElement,
  labelText: string,
  placeholder: string,
): HTMLInputElement {
  const label = document.createElement("label");
  label.classList.add("session-field");
  label.appendChild(document.createTextNode(labelText));
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  label.appendChild(input);
  root.appendChild(label);
  return input;
}

/**
 * Render the session-details panel: optional device-name and target/scope inputs whose current
 * values flow into the report header and the backend log via {@link SessionInfoHandle.getMeta}.
 *
 * @param root Container to render into.
 * @returns Handle exposing `getMeta()`.
 */
export function mountSessionInfo(root: HTMLElement): SessionInfoHandle {
  root.replaceChildren();
  const deviceInput = appendLabeledInput(root, "Device name", "e.g. PMIC-01");
  const targetInput = appendLabeledInput(root, "Target / scope", "e.g. charge state");
  return { getMeta: () => sessionMeta(deviceInput.value, targetInput.value) };
}
