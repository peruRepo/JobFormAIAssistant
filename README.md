# Job Form AI Assistant (Chrome/Brave Extension)

This project lives under `JobFormAIAssistant/` and provides a popup-driven browser extension that scans job forms, gathers the field metadata, and uses AI providers (local or hosted) to suggest values based on the resume context you supply.

## Install & Load Unpacked

1. Download/clone this repo; no build step required.
2. Open `chrome://extensions` (or `brave://extensions`) and enable **Developer mode** in the top-right.
3. Click **Load unpacked** and select `JobFormAIAssistant/JobFormAIAssistant`.
4. Pin the extension icon for easier access.

## Daily Workflow

1. Open the job application page you want to fill.
2. Click the extension icon to open the popup.
3. Press **Fetch Fields** to scan the active tab; the popup shows the number of pages and fields captured so far.
4. Paste your resume context (see below) or click **Load Default Resume** if you want the sample template pre-filled in the textarea.
5. Choose an AI provider (Ollama, OpenAI, Gemini) and save the API key when needed.
6. Hit **Process with AI**; check the live log section for request/response status.
7. If the suggestions look reasonable, click **Apply Suggested Values** to update the active tab. If not, tweak the context or try a different provider—nothing is auto-submitted.
8. Use **Download JSON** to export the collected field schema for later reuse, or **Fill From JSON** to load a template back into the workflow.

### Resume Context Guidance

* Use a simple key-value list separated by colons, e.g., `first_name: Ada`, `experience_years: 4`, `preferred_location: Remote`.
* Formatting is flexible—single lines or paragraphs work—as long as each key/value pair stays readable for the AI.
* Include the fields you usually encounter (skills, eligibility, salary expectations, citizenship, etc.) so the AI can map them quickly.
* Copy/paste your custom context directly into the popup textarea; there is no external file to load. The **Load Default Resume** button only injects the bundled sample for inspiration.
* The text persists in `chrome.storage.local` (`resumeContext`), so you only need to paste it once per browser profile.
* For consistent results, keep the context concise but specific; avoid conflicting answers for the same key.

### Field JSON Templates

When you download data via the popup, the JSON structure mirrors what the extension expects if you later use **Fill From JSON**:

```json
{
  "pages": [
    {
      "url": "https://example.com/apply",
      "fields": [
        { "id": "first_name", "label": "First Name", "value": "Ada" }
      ]
    }
  ]
}
```

Keep that structure if you want to hand-edit or version-control templates.

## AI Providers & Configuration

| Provider | Transport | Config location | Token storage |
|----------|-----------|-----------------|---------------|
| Ollama | Local host (`http://localhost:11434/api/generate`) | `config.js` (`CONFIG.OLLAMA`) | none |
| OpenAI | Cloud (`https://api.openai.com/v1/chat/completions`) | `config.js` (`CONFIG.OPENAI`) | saved via `token_manager.js` |
| Gemini | Cloud (`https://generativelanguage.googleapis.com/...`) | `config.js` (`CONFIG.GEMINI`) | saved via `token_manager.js` |

* The popup lets you select any of the available models; if the provider requires a token, paste it into the API-key box right below and hit **Save**—the key is stored locally per provider.
* To change defaults, edit `CONFIG.SELECTED_PROVIDER` or the `MODEL` values inside `config.js`.
* Only these three providers ship today, but you can add more by extending `CONFIG`, creating a matching `askYourProvider` routine in `ai_interaction.js`, wiring it into `getSuggestedValues`, and exposing the provider/token inputs in `popup.html`/`popup.js`.
* API keys are written to `chrome.storage.local` under `providerTokens` and never leave your machine unless you call the corresponding AI API.

## Data Storage & Privacy

* `chrome.storage.local` holds everything: `collectedData`, provider choice, resume context, and provider tokens. Clearing the extension data wipes it.
* No analytics, telemetry, or hidden network calls exist. The only outbound traffic is the explicit request you send to an AI API (Ollama local or remote cloud provider).
* If you choose a hosted provider (OpenAI, Gemini, or any future one you add), your field metadata and resume context go to that API. Double-check provider terms and never include SSNs, DOBs, or other sensitive details unless you accept the risk.
* The code does not send any data to services beyond the selected AI endpoint. Review `ai_interaction.js`, `popup.js`, and `token_manager.js` to verify.

## Limitations & Tips

* Dropdowns, multi-selects, file uploads, and complex widgets are currently unsupported. The tool targets text inputs and textareas only.
* Sites that block content scripts or render forms inside iframes might need a manual refresh or may simply not work—watch the live logs for warnings.
* AI completions can be wrong; if the first attempt fails or fields stay blank, just ignore it, adjust your context, and rerun.
* When using Ollama, keep `ollama serve` running and use a model/lightweight quant that matches your hardware.
* The popup log (bottom section) is the first place to look for errors—network failures, parsing issues, or provider warnings show up there in real time.

## Disclaimer

This is fully open source, provided “as is,” with no warranty, support, or liability. You take full responsibility for any data shared with AI providers, any application submissions, and any consequences of using the suggestions produced by this extension. Always review the filled forms before submission.
