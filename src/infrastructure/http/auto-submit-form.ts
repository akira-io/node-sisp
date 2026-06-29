export function renderAutoSubmitForm(
  action: string,
  fields: Record<string, string | number>,
  title: string,
): string {
  const inputs = Object.entries(fields)
    .map(
      ([name, value]) =>
        `<input type='hidden' name='${escapeHtml(name)}' value='${escapeHtml(String(value))}'>`,
    )
    .join('');

  return (
    '<!DOCTYPE html>' +
    '<html><head>' +
    `<title>${escapeHtml(title)}</title>` +
    "<meta charset='utf-8'>" +
    '</head>' +
    "<body onload='document.forms[0].submit()'>" +
    `<form action='${escapeHtml(action)}' method='post'>` +
    inputs +
    '</form>' +
    '<noscript><p>JavaScript is disabled. <a href="#" onclick="document.forms[0].submit(); return false;">Click here</a> to continue.</p></noscript>' +
    '</body></html>'
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
