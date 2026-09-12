import { escapeHtml } from './auto-submit-form';

interface SandboxChooserOutcome {
  status: string;
  label: string;
  hint: string;
}

const SANDBOX_OUTCOMES: readonly SandboxChooserOutcome[] = Object.freeze([
  { status: 'success', label: 'Approve', hint: 'Signed purchase callback (messageType 8).' },
  { status: 'failed', label: 'Decline', hint: 'Signed error callback (messageType 6).' },
  {
    status: 'cancelled',
    label: 'Cancel',
    hint: 'UserCancelled post, with no message type and no fingerprint.',
  },
  { status: 'tampered', label: 'Tamper', hint: 'Purchase callback with an invalid fingerprint.' },
]);

export function renderSandboxChooser(
  action: string,
  carried: Record<string, string | number>,
  declineDefaults: Record<string, string>,
): string {
  return (
    '<!DOCTYPE html>' +
    '<html><head>' +
    '<title>SISP Sandbox - Choose an outcome</title>' +
    "<meta charset='utf-8'>" +
    '</head>' +
    '<body>' +
    '<h1>SISP Sandbox</h1>' +
    summary(carried) +
    `<form action='${escapeHtml(action)}' method='post'>` +
    hiddenFields(carried) +
    buttons() +
    declineFieldset(declineDefaults) +
    '</form>' +
    '</body></html>'
  );
}

function summary(carried: Record<string, string | number>): string {
  const rows = ['merchantRef', 'merchantSession', 'amount']
    .map((name) => `<dt>${name}</dt><dd>${escapeHtml(String(carried[name] ?? ''))}</dd>`)
    .join('');

  return `<dl>${rows}</dl>`;
}

function hiddenFields(carried: Record<string, string | number>): string {
  return Object.entries(carried)
    .map(
      ([name, value]) =>
        `<input type='hidden' name='${escapeHtml(name)}' value='${escapeHtml(String(value))}'>`,
    )
    .join('');
}

function buttons(): string {
  return SANDBOX_OUTCOMES.map(
    (outcome) =>
      `<p><button type='submit' name='status' value='${escapeHtml(outcome.status)}'>${escapeHtml(outcome.label)}</button> <span>${escapeHtml(outcome.hint)}</span></p>`,
  ).join('');
}

function declineFieldset(defaults: Record<string, string>): string {
  const inputs = Object.entries(defaults)
    .map(
      ([name, value]) =>
        `<p><label>${escapeHtml(name)} <input type='text' name='${escapeHtml(name)}' value='${escapeHtml(value)}'></label></p>`,
    )
    .join('');

  return `<fieldset><legend>Decline fields</legend>${inputs}</fieldset>`;
}
