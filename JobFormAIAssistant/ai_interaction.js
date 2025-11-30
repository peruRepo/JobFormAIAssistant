import CONFIG from './config.js';
import { getProviderToken } from './token_manager.js';

/**
 * Requests AI suggestions for multiple fields at once.
 */
export async function getSuggestedValues(fields, userContext, providerOverride) {
    if (!Array.isArray(fields) || fields.length === 0) {
        logWarn("getSuggestedValues called with no fields.");
        return {};
    }

    try {
        const provider = (providerOverride || CONFIG.SELECTED_PROVIDER || "OLLAMA").toUpperCase();
        logInfo(`Asking AI (${provider}) for ${fields.length} fields...`);

        let response;
        if (provider === "OLLAMA") {
            response = await askOllama(fields, userContext);
        } else if (provider === "OPENAI") {
            response = await askOpenAI(fields, userContext);
        } else if (provider === "GEMINI") {
            response = await askGemini(fields, userContext);
        } else {
            throw new Error(`Unknown provider selected: ${provider}`);
        }

        return normalizeAiResponse(response, fields);
    } catch (error) {
        console.error("Error in AI pipeline:", error);
        return {};
    }
}

// --- PROMPT GENERATOR ---
function generateBatchPrompt(fields, context) {
    const contextText = (context || '').trim() || 'No resume context was provided.';
    const fieldsJson = JSON.stringify(prepareFieldsForPrompt(fields), null, 2);
    return `You are a form filling assistant.

User context pulled from resume context:
${contextText}

You are given the following JSON describing form fields that need values:
${fieldsJson}

Task:
1. Use the context and field metadata to determine the best value for each field.
2. Respond ONLY with JSON that follows this exact structure:
{
  "fields": [
    { "id": "FIELD_ID", "value": "FINAL VALUE" }
  ]
}
3. Always copy the provided id for each field. If the id is missing, reuse the "name" value.
4. Return empty strings when the answer is truly unknown.
5. Do not include explanations or extra keys.
`;
}

function prepareFieldsForPrompt(fields) {
    return fields.map(field => ({
        id: field.id || field.name || '',
        name: field.name || '',
        label: field.label || '',
        placeholder: field.placeholder || '',
        type: field.type || 'text',
        required: !!field.required
    }));
}

// --- PROVIDER: OLLAMA ---
async function askOllama(fields, context) {
    const prompt = generateBatchPrompt(fields, context);

    // --- AI API CALL START (OLLAMA) ---
    logDebug("Sending prompt to Ollama:", prompt);
    let response;
    try {
        response = await fetch(CONFIG.OLLAMA.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cleanUndefined({
                model: CONFIG.OLLAMA.MODEL,
                prompt: prompt,
                stream: false,
                format: "json"
            }))
        });
    } catch (networkError) {
        logError("Network Error (Ollama):", networkError);
        throw new Error("Failed to connect to Ollama. Is it running? (Run 'ollama serve')");
    }
    // --- AI API CALL END ---

    if (!response.ok) return handleApiError("Ollama", response);
    const data = await response.json();
    logDebug("Raw AI Response:", data.response);
    return parseBatchJSON(data.response);
}

// --- PROVIDER: OPENAI ---
async function askOpenAI(fields, context) {
    const prompt = generateBatchPrompt(fields, context);
    const apiKey = await getProviderToken('OPENAI');
    if (!apiKey) {
        throw new Error("OpenAI API key missing. Set it in the extension popup.");
    }

    // --- AI API CALL START (OPENAI) ---
    logDebug("Sending prompt to OpenAI:", prompt);
    const response = await fetch(CONFIG.OPENAI.API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: CONFIG.OPENAI.MODEL,
            messages: [
                { role: "system", content: "You are a helpful assistant that outputs only JSON." },
                { role: "user", content: prompt }
            ],
            temperature: 0.1
        })
    });
    // --- AI API CALL END ---

    if (!response.ok) return handleApiError("OpenAI", response);
    const data = await response.json();
    const content = data.choices[0].message.content;
    return parseBatchJSON(content);
}

// --- PROVIDER: GEMINI ---
async function askGemini(fields, context) {
    const prompt = generateBatchPrompt(fields, context);
    const apiKey = await getProviderToken('GEMINI');
    if (!apiKey) {
        throw new Error("Gemini API key missing. Set it in the extension popup.");
    }
    const url = `${CONFIG.GEMINI.API_URL}?key=${apiKey}`;

    // --- AI API CALL START (GEMINI) ---
    logDebug("Sending prompt to Gemini:", prompt);
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }]
        })
    });
    // --- AI API CALL END ---

    if (!response.ok) return handleApiError("Gemini", response);
    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return parseBatchJSON(content);
}

// --- HELPER: JSON PARSER ---
function parseBatchJSON(text) {
    try {
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}') + 1;
        if (jsonStart === -1 || jsonEnd === -1) {
            logWarn("No JSON found in response:", text);
            return [];
        }

        const jsonStr = text.substring(jsonStart, jsonEnd);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed.fields)) {
            return parsed.fields;
        }
        if (Array.isArray(parsed)) {
            return parsed;
        }
        logWarn("JSON response missing 'fields' array:", parsed);
        return [];
    } catch (e) {
        logWarn("Failed to parse JSON from AI response:", text, e);
        return [];
    }
}

function normalizeAiResponse(aiResponse, referenceFields) {
    if (!Array.isArray(aiResponse)) {
        return {};
    }

    return aiResponse.reduce((acc, entry, index) => {
        if (!entry) return acc;
        const ref = referenceFields[index];
        const targetId = entry.id || (ref && ref.id) || (ref && ref.name);
        if (!targetId) return acc;
        const value = typeof entry.value === 'string'
            ? entry.value
            : (typeof entry.answer === 'string' ? entry.answer : '');
        acc[targetId] = value;
        return acc;
    }, {});
}

// --- HELPER: Error logging ---
async function handleApiError(provider, response) {
    const body = await response.text().catch(() => "<unable to read body>");
    logError(`${provider} API Error (${response.status} ${response.statusText}):`, body);
    throw new Error(`${provider} API Error: ${response.statusText}`);
}

function logDebug(...args) {
    emitLog('log', ...args);
}

function logInfo(...args) {
    emitLog('info', ...args);
}

function logWarn(...args) {
    emitLog('warn', ...args);
}

function logError(...args) {
    emitLog('error', ...args);
}

function emitLog(level, ...args) {
    const ts = new Date().toISOString();
    if (console[level]) {
        console[level](...args);
    } else {
        console.log(...args);
    }

    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
        return;
    }

    const message = args.map(safeStringify).join(' ');
    window.dispatchEvent(new CustomEvent('ai-log', {
        detail: {
            level,
            message,
            timestamp: ts
        }
    }));
}

function safeStringify(value) {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch (e) {
        return String(value);
    }
}

function cleanUndefined(obj) {
    const cleaned = {};
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined) {
            cleaned[key] = obj[key];
        }
    });
    return cleaned;
}
