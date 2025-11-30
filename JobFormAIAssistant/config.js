// Configuration for the extension
const CONFIG = {
    // Select the active provider: "OLLAMA", "OPENAI", or "GEMINI"
    SELECTED_PROVIDER: "GEMINI",

    // Ollama Configuration (Local)
    OLLAMA: {
        API_URL: "http://localhost:11434/api/generate",
        MODEL: "gemma3:1b"
    },

    // OpenAI Configuration (Cloud)
    OPENAI: {
        API_URL: "https://api.openai.com/v1/chat/completions",
        MODEL: "gpt-3.5-turbo"
    },

    // Google Gemini Configuration (Cloud)
    GEMINI: {
        API_URL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        MODEL: "gemini-2.0-flash"
    }


};

export default CONFIG;
