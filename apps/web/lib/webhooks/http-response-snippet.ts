interface WebhookResponseSnippet {
  characters: number;
  snippet: string;
}

export function appendWebhookResponseSnippet(
  current: WebhookResponseSnippet,
  decoded: string,
): WebhookResponseSnippet {
  if (current.characters >= 500) return current;
  let snippet = current.snippet;
  let characters = current.characters;
  for (const character of decoded) {
    if (characters === 500) break;
    snippet += character === "\0" ? "�" : character;
    characters += 1;
  }
  return { characters, snippet };
}
