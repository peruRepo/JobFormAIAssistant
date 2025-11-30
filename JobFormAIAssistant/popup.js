import { getSuggestedValues } from './ai_interaction.js';
import { getProviderToken, saveProviderToken } from './token_manager.js';

document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('providerSelect');

  const fetchBtn = document.getElementById('fetchBtn');
  const aiProcessBtn = document.getElementById('aiProcessBtn');
  const applyBtn = document.getElementById('applyBtn');
  const resetFormBtn = document.getElementById('resetFormBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearBtn = document.getElementById('clearBtn');
  const fillJsonBtn = document.getElementById('fillJsonBtn');
  const jsonFileInput = document.getElementById('jsonFileInput');

  const pageCountEl = document.getElementById('pageCount');
  const fieldCountEl = document.getElementById('fieldCount');
  const messageArea = document.getElementById('messageArea');
  const postProcessActions = document.getElementById('postProcessActions');
  const logOutput = document.getElementById('logOutput');
  const clearLogBtn = document.getElementById('clearLogBtn');
  const providerSecrets = document.getElementById('providerSecrets');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  const apiKeyStatus = document.getElementById('apiKeyStatus');
  const resumeContextInput = document.getElementById('resumeContextInput');
  const loadResumeBtn = document.getElementById('loadResumeBtn');

  const logBuffer = [];
  const MAX_LOG_LINES = 200;

  window.addEventListener('ai-log', (event) => {
    appendLog(event.detail);
  });

  clearLogBtn.addEventListener('click', () => {
    logBuffer.length = 0;
    renderLogs();
  });

  fillJsonBtn.addEventListener('click', () => {
    jsonFileInput.value = '';
    jsonFileInput.click();
  });

  jsonFileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await applyJsonTemplate(data);
    } catch (err) {
      console.error(err);
      showMessage('Invalid JSON file selected.', 'error');
      appendLog({ level: 'error', message: `Failed to parse uploaded JSON: ${err.message}` });
    }
  });

  // Load state
  chrome.storage.local.get(['collectedData', 'provider', 'resumeContext'], (result) => {
    if (result.collectedData) updateStats(result.collectedData);

    const provider = (result.provider || 'OLLAMA').toUpperCase();
    providerSelect.value = provider;
    chrome.storage.local.set({ provider });
    refreshProviderTokenUI(provider);

    if (resumeContextInput) {
      const savedResume = (result.resumeContext || '').trim();
      if (savedResume) {
        resumeContextInput.value = savedResume;
      } else {
        loadResumeContextFromFile()
          .then(defaultResume => {
            if (resumeContextInput && defaultResume) {
              resumeContextInput.value = defaultResume.trim();
              chrome.storage.local.set({ resumeContext: resumeContextInput.value });
            }
          })
          .catch(err => {
            console.warn('Could not load packaged resume:', err);
          });
      }
    }
  });

  providerSelect.addEventListener('change', (e) => {
    const provider = e.target.value.toUpperCase();
    chrome.storage.local.set({ provider });
    appendLog({ level: 'info', message: `Switched AI provider to ${provider}.` });
    refreshProviderTokenUI(provider);
  });

  if (resumeContextInput) {
    resumeContextInput.addEventListener('input', (e) => {
      chrome.storage.local.set({ resumeContext: e.target.value });
    });
  }

  if (loadResumeBtn) {
    loadResumeBtn.addEventListener('click', async () => {
      try {
        const defaultContext = await loadResumeContextFromFile();
        if (resumeContextInput) {
          resumeContextInput.value = defaultContext.trim();
        }
        await chrome.storage.local.set({ resumeContext: defaultContext.trim() });
        showMessage('Default resume context loaded.', 'success');
      } catch (err) {
        console.error(err);
        showMessage('Could not load bundled resume context.', 'error');
      }
    });
  }

  if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', async () => {
      const provider = providerSelect.value.toUpperCase();
      const token = (apiKeyInput?.value || '').trim();
      await saveProviderToken(provider, token);
      await refreshProviderTokenUI(provider);
      showMessage(`${provider} API key ${token ? 'saved locally.' : 'cleared.'}`, 'success');
      appendLog({ level: 'info', message: `${provider} token ${token ? 'stored' : 'removed'} from browser storage.` });
    });
  }

  // Fetch Fields
  fetchBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return showMessage('No active tab found', 'error');

    try {
      await ensureContentScript(tab.id);
      chrome.tabs.sendMessage(tab.id, { action: 'scan_forms' }, (response) => {
        if (chrome.runtime.lastError) {
          showMessage('Error connecting to page. Refresh and try again.', 'error');
          return;
        }

        if (response && response.fields) {
          handleNewData(tab.url, response.fields);
          showMessage(`Found ${response.fields.length} fields!`, 'success');
          appendLog({ level: 'info', message: `Fetched ${response.fields.length} fields from ${tab.url}` });
        } else {
          showMessage('No fields found.', 'error');
        }
      });
    } catch (err) {
      showMessage('Cannot access this page.', 'error');
      appendLog({ level: 'error', message: `Fetch failed: ${err.message}` });
    }
  });

  // AI Process (Generate Values Only)
  aiProcessBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return showMessage('No active tab found', 'error');

    // 1. Load Context
    let userContext = "";
    try {
      userContext = await getResumeContext();
    } catch (e) {
      console.error(e);
      return showMessage('Error: Could not load resume context.', 'error');
    }

    try {
      await ensureContentScript(tab.id);
      setProcessingState(true);

      chrome.tabs.sendMessage(tab.id, { action: 'scan_forms' }, async (response) => {
        try {
          if (chrome.runtime.lastError || !response || !response.fields) {
            showMessage('Could not scan page.', 'error');
            return;
          }

          const fields = response.fields;
          const startMsg = `Processing ${fields.length} fields with AI...`;
          showMessage(startMsg, 'success');
          appendLog({ level: 'info', message: startMsg });

          let filledCount = 0;
          let skippedCount = 0;
          let failedCount = 0;
          let missingIdCount = 0;

          // Get current data
          const storageResult = await chrome.storage.local.get(['collectedData']);
          let allData = storageResult.collectedData || [];

          const pageIndex = allData.findIndex(p => p.url === tab.url);

          if (pageIndex === -1) {
            allData.push({
              url: tab.url,
              timestamp: new Date().toISOString(),
              fields: fields
            });
          }

          const currentFields = (pageIndex !== -1) ? allData[pageIndex].fields : fields;

          const fillTargets = [];
          for (let i = 0; i < currentFields.length; i++) {
            const field = currentFields[i];
            if (field.value) {
              appendLog({ level: 'info', message: `Skipping field '${field.name || field.id}' because it already has a value.` });
              skippedCount++;
              continue;
            }
            if (!field.id) {
              appendLog({ level: 'warn', message: `Cannot fill field '${field.name || field.label}' because it lacks an id attribute.` });
              missingIdCount++;
              continue;
            }
            fillTargets.push(field);
          }

          if (!fillTargets.length) {
            let msg = 'No empty fields detected that can be filled automatically.';
            if (missingIdCount > 0) {
              msg += ' Some fields were skipped because they lacked ids.';
            }
            showMessage(msg, 'error');
            appendLog({ level: 'warn', message: msg });
            return;
          }

          const provider = providerSelect.value;
          appendLog({ level: 'info', message: `Requesting AI suggestions from ${provider} for ${fillTargets.length} fields.` });
          const suggestions = await getSuggestedValues(fillTargets, userContext, provider);

          fillTargets.forEach(field => {
            const suggestion = suggestions[field.id];
            if (typeof suggestion === 'string' && suggestion.trim() !== '') {
              field.value = suggestion;
              field.ai_filled = true;
              filledCount++;
            } else {
              appendLog({ level: 'warn', message: `AI did not provide a usable value for field '${field.name || field.id}'.` });
              failedCount++;
            }
          });

          // Save back
          if (pageIndex !== -1) {
            allData[pageIndex].fields = currentFields;
          } else {
            allData[allData.length - 1].fields = currentFields;
          }

          await chrome.storage.local.set({ collectedData: allData });
          updateStats(allData);

          // Show Post-Process Actions
          postProcessActions.classList.remove('hidden');

          let msg = `AI generated ${filledCount} values!`;
          if (skippedCount > 0) msg += ` (Skipped ${skippedCount} existing)`;
          if (failedCount > 0) msg += ` (Failed ${failedCount})`;
          if (missingIdCount > 0) msg += ` (Missing IDs ${missingIdCount})`;

          if (filledCount === 0 && failedCount > 0) {
            const errMsg = msg + ". Check logs for errors.";
            showMessage(errMsg, 'error');
            appendLog({ level: 'error', message: errMsg });
          } else {
            showMessage(msg + " Choose an action below.", 'success');
            appendLog({ level: 'info', message: msg });
          }
        } catch (err) {
          console.error(err);
          showMessage(`Error: ${err.message}`, 'error');
          appendLog({ level: 'error', message: `AI process failed: ${err.message}` });
        } finally {
          setProcessingState(false);
        }
      });
    } catch (err) {
      console.error(err);
      showMessage(`Error: ${err.message}`, 'error');
      appendLog({ level: 'error', message: `AI process failed: ${err.message}` });
      setProcessingState(false);
    }
  });

  // Apply to Page (Actually Fill)
  applyBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    const storageResult = await chrome.storage.local.get(['collectedData']);
    const allData = storageResult.collectedData || [];
    const pageData = allData.find(p => p.url === tab.url);

    if (!pageData || !pageData.fields) {
      return showMessage('No data found for this page. Run AI Process first.', 'error');
    }

    let appliedCount = 0;
    for (const field of pageData.fields) {
      if (field.value) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'fill_field',
          id: field.id,
          value: field.value
        });
        appliedCount++;
      }
    }
    const appliedMsg = `Applied ${appliedCount} values to the form.`;
    showMessage(appliedMsg, 'success');
    appendLog({ level: 'info', message: appliedMsg });
  });

  // Reset Form
  resetFormBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    chrome.tabs.sendMessage(tab.id, { action: 'reset_forms' }, (response) => {
      showMessage('Form fields cleared.', 'success');
      appendLog({ level: 'info', message: 'Requested form fields reset on active tab.' });
    });
  });

  // Download JSON
  downloadBtn.addEventListener('click', () => {
    chrome.storage.local.get(['collectedData'], (result) => {
      const data = result.collectedData || [];
      if (data.length === 0) {
        showMessage('No data to download.', 'error');
        return;
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      chrome.downloads.download({
        url: url,
        filename: 'form_data.json',
        saveAs: true
      }, () => {
        URL.revokeObjectURL(url);
      });
      appendLog({ level: 'info', message: 'Triggered download for form_data.json' });
    });
  });

  // Clear Data
  clearBtn.addEventListener('click', () => {
    chrome.storage.local.set({ collectedData: [] }, () => {
      updateStats([]);
      showMessage('All data cleared.', 'success');
      appendLog({ level: 'info', message: 'Cleared collected data from storage.' });
    });
  });

  // Helpers
  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function ensureContentScript(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
  }

  function handleNewData(url, newFields) {
    chrome.storage.local.get(['collectedData'], (result) => {
      let data = result.collectedData || [];
      const existingIndex = data.findIndex(p => p.url === url);

      const pageEntry = {
        url: url,
        timestamp: new Date().toISOString(),
        fields: newFields
      };

      if (existingIndex >= 0) {
        data[existingIndex] = pageEntry;
      } else {
        data.push(pageEntry);
      }

      chrome.storage.local.set({ collectedData: data }, () => {
        updateStats(data);
      });
    });
  }

  function updateStats(data) {
    const pages = data.length;
    const fields = data.reduce((acc, page) => acc + page.fields.length, 0);

    pageCountEl.textContent = pages;
    fieldCountEl.textContent = fields;

    downloadBtn.disabled = pages === 0;
  }

  function showMessage(text, type) {
    messageArea.textContent = text;
    messageArea.className = `message ${type}`;
    messageArea.classList.remove('hidden');
    setTimeout(() => {
      messageArea.classList.add('hidden');
    }, 4000);
  }

  async function refreshProviderTokenUI(provider) {
    if (!providerSecrets || !apiKeyInput || !apiKeyStatus) return;
    const normalized = (provider || '').toUpperCase();
    const requiresToken = normalized !== 'OLLAMA';
    providerSecrets.classList.toggle('hidden', !requiresToken);
    if (saveApiKeyBtn) {
      saveApiKeyBtn.disabled = !requiresToken;
    }

    if (!requiresToken) {
      apiKeyInput.value = '';
      apiKeyInput.placeholder = 'Token not required for Ollama';
      apiKeyStatus.textContent = 'Local models do not require API keys.';
      return;
    }

    apiKeyInput.placeholder = `${normalized} API key`;
    const token = await getProviderToken(normalized);
    apiKeyInput.value = token;
    apiKeyStatus.textContent = token
      ? 'Stored securely in browser storage.'
      : 'No key saved yet.';
  }

  async function applyJsonTemplate(jsonData) {
    const payload = normalizeJsonPayload(jsonData);
    if (!payload) {
      showMessage('JSON missing fields array.', 'error');
      appendLog({ level: 'error', message: 'Uploaded JSON did not contain a fields array.' });
      return;
    }

    const tab = await getActiveTab();
    if (!tab) {
      showMessage('No active tab found.', 'error');
      return;
    }

    try {
      await ensureContentScript(tab.id);
    } catch (err) {
      showMessage('Cannot access this page.', 'error');
      appendLog({ level: 'error', message: `Failed to inject content script: ${err.message}` });
      return;
    }

    const targetFields = payload.fields.filter(field => field && field.id && typeof field.value !== 'undefined');
    if (!targetFields.length) {
      showMessage('No fillable entries detected in JSON.', 'error');
      appendLog({ level: 'warn', message: 'Uploaded JSON contained no values with both id and value.' });
      return;
    }

    let appliedCount = 0;
    for (const field of targetFields) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'fill_field',
        id: field.id,
        value: field.value
      });
      appliedCount++;
    }

    await synchronizeJsonValues(tab.url, targetFields);

    const successMsg = `Filled ${appliedCount} values from JSON.`;
    showMessage(successMsg, 'success');
    appendLog({ level: 'info', message: `${successMsg} (Source: ${payload.templateName || 'unknown'})` });
  }

  async function synchronizeJsonValues(url, jsonFields) {
    const storageResult = await chrome.storage.local.get(['collectedData']);
    const allData = storageResult.collectedData || [];
    const pageIndex = allData.findIndex(p => p.url === url);
    if (pageIndex === -1) return;

    const updatedFields = allData[pageIndex].fields.map(field => {
      const matching = jsonFields.find(jsonField => jsonField.id === field.id);
      if (matching && typeof matching.value !== 'undefined') {
        return { ...field, value: matching.value, json_filled: true };
      }
      return field;
    });

    allData[pageIndex].fields = updatedFields;
    await chrome.storage.local.set({ collectedData: allData });
    updateStats(allData);
  }

  function normalizeJsonPayload(data) {
    if (!data) return null;
    if (Array.isArray(data)) {
      const first = data[0];
      if (first && Array.isArray(first.fields)) return first;
      return null;
    }
    if (Array.isArray(data.fields)) return data;
    return null;
  }

  function setProcessingState(isProcessing) {
    const buttons = [fetchBtn, aiProcessBtn, applyBtn, resetFormBtn, downloadBtn, clearBtn, fillJsonBtn];
    buttons.forEach(btn => {
      if (!btn) return;
      btn.disabled = isProcessing;
    });
    if (providerSelect) {
      providerSelect.disabled = isProcessing;
    }

    if (!aiProcessBtn.dataset.originalContent) {
      aiProcessBtn.dataset.originalContent = aiProcessBtn.innerHTML;
    }

    if (isProcessing) {
      aiProcessBtn.innerHTML = '<span class="icon">⏳</span> Waiting on AI...';
      appendLog({ level: 'info', message: 'Waiting for AI response. This may take a few moments.' });
    } else {
      aiProcessBtn.innerHTML = aiProcessBtn.dataset.originalContent;
    }
  }

  async function getResumeContext() {
    const storageResult = await chrome.storage.local.get(['resumeContext']);
    const stored = (storageResult.resumeContext || '').trim();
    if (stored) return stored;
    return (await loadResumeContextFromFile()).trim();
  }

  async function loadResumeContextFromFile() {
    const url = chrome.runtime.getURL('resume.txt');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('resume.txt not found');
    }
    return await response.text();
  }

  function appendLog(detail = {}) {
    if (!logOutput) return;
    const { level = 'log', message = '', timestamp } = detail;
    const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    logBuffer.push(`[${timeStr}] [${level.toUpperCase()}] ${message}`);
    if (logBuffer.length > MAX_LOG_LINES) {
      logBuffer.shift();
    }
    renderLogs();
  }

  function renderLogs() {
    if (!logOutput) return;
    if (logBuffer.length === 0) {
      logOutput.textContent = 'Waiting for activity...';
    } else {
      logOutput.textContent = logBuffer.join('\n');
    }
  }
});
