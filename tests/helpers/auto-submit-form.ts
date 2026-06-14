export interface ExtractedForm {
  action: string;
  fields: Record<string, string>;
}

export function extractForm(html: string): ExtractedForm {
  const actionMatch = html.match(/form action='([^']+)'/);
  const fields: Record<string, string> = {};

  for (const input of html.matchAll(/name='([^']+)' value='([^']*)'/g)) {
    fields[unescapeHtml(input[1] as string)] = unescapeHtml(input[2] as string);
  }

  return { action: unescapeHtml(actionMatch?.[1] ?? ''), fields };
}

export function unescapeHtml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&amp;', '&');
}
