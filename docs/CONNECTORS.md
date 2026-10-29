# Connectors: how Councilwise talks to each website

Every website member is described by a small JSON file. The built-in ones live in `src/main/adapters/sites/`. Your own copies go in the **connector folder** (Members & logins → Connector folder, i.e. `%APPDATA%\Councilwise\adapters`). A file there with the same `id` replaces the built-in one, so you can fix a broken site immediately, without a new release. Click **Reload connectors** afterwards.

## Example

```json
{
  "id": "chatgpt",
  "name": "ChatGPT",
  "maker": "OpenAI",
  "monogram": "GP",
  "url": "https://chatgpt.com/",
  "version": "2026.10.1",
  "selectors": {
    "input": ["#prompt-textarea", "div[contenteditable=\"true\"]"],
    "send": ["button[data-testid=\"send-button\"]"],
    "busy": ["button[data-testid=\"stop-button\"]"],
    "response": ["[data-message-author-role=\"assistant\"]"],
    "fileInput": ["input[type=\"file\"]"],
    "loggedOut": ["button[data-testid=\"login-button\"]"]
  },
  "plan": { "free": ["Upgrade plan"], "pro": ["ChatGPT Plus", "ChatGPT Pro"] },
  "upload": { "supported": true, "maxMB": 50 },
  "pasteLimit": 60000,
  "webAccess": true,
  "privacyUrl": "https://chatgpt.com/#settings/DataControls",
  "api": { "baseUrl": "https://api.openai.com/v1", "model": "gpt-5" }
}
```

| Field | Meaning |
|---|---|
| `selectors.input` | The message box. CSS selectors, tried in order; the last visible match is used. |
| `selectors.send` | The Send button. If none is found or it is disabled, Enter is pressed. |
| `selectors.busy` | Something that is visible only while the model is still writing (usually the Stop button). |
| `selectors.response` | Each answer bubble. The newest one is read when it stops changing. |
| `selectors.fileInput` | The hidden file input used when "Attach the original file" is on. |
| `selectors.loggedOut` | Something visible only when signed out (a "Log in" button). |
| `plan.free` / `plan.pro` | Text that appears on the page for that plan. `plan.fixed` sets a plan outright. |
| `pasteLimit` | Longest single message, in characters. Longer text is sent in parts. |
| `webAccess` | Whether the model can search the web (used to pick the fact-checker). |

## When nothing matches

The engine falls back to generic detection: the widest visible text box, the Enter key, and any new text that appears on the page after sending. That is why a redesign usually slows a member down rather than breaking it.

## Finding new selectors

1. Members & logins → **Open & sign in** on the member.
2. Press `F12` in that member's window to open developer tools (or use the same site in Chrome).
3. Right-click the message box → Inspect, and pick a stable attribute (`data-testid`, `aria-label`, `id`).
4. Update the JSON, bump `version`, reload connectors, and run a small council to test.
5. Please send the fix as a pull request so everyone benefits.
