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
4. Paste your resume context (see below) or click **Load Resume** to pull in the bundled `resume.txt`.
5. Choose an AI provider (Ollama, OpenAI, Gemini) and save the API key when needed.
6. Hit **Process with AI**; check the live log section for request/response status.
7. If the suggestions look reasonable, click **Apply Suggested Values** to update the active tab. If not, tweak the context or try a different provider—nothing is auto-submitted.
8. Use **Download JSON** to export the collected field schema for later reuse, or **Fill From JSON** to load a template back into the workflow.

### Resume Context Guidance

* Plain text is enough—bullets or paragraphs; no need for JSON.
* Include skills, experience snippets, location preference, citizenship, and any standard Q&A you expect to face.
* The text is stored in `chrome.storage.local` (`resumeContext`) so you only paste it once per browser profile.
* For deterministic results, keep the context concise but specific; avoid inconsistent date ranges or job titles.

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

* To switch defaults edit `CONFIG.SELECTED_PROVIDER` or the `MODEL` values inside `config.js`.
* API keys are written to `chrome.storage.local` under the `providerTokens` object. They never leave your machine except when you invoke the corresponding AI request.
* To add a new provider: extend `CONFIG`, implement an `askYourProvider` helper in `ai_interaction.js`, hook it into `getSuggestedValues`, and expose the new option in the popup dropdown + token form.

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
