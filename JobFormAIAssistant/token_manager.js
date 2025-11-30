const TOKEN_STORAGE_KEY = 'providerTokens';

/**
 * Persists an API token for the given provider in chrome.storage.local.
 * Passing an empty token removes the stored value.
 */
export async function saveProviderToken(provider, token) {
    const normalizedProvider = normalizeProvider(provider);
    const result = await chrome.storage.local.get([TOKEN_STORAGE_KEY]);
    const tokens = result[TOKEN_STORAGE_KEY] || {};

    if (token) {
        tokens[normalizedProvider] = token;
    } else {
        delete tokens[normalizedProvider];
    }

    await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: tokens });
}

/**
 * Retrieves the saved API token for a provider.
 */
export async function getProviderToken(provider) {
    const normalizedProvider = normalizeProvider(provider);
    const result = await chrome.storage.local.get([TOKEN_STORAGE_KEY]);
    const tokens = result[TOKEN_STORAGE_KEY] || {};
    return tokens[normalizedProvider] || '';
}

function normalizeProvider(provider) {
    return (provider || '').toUpperCase();
}
