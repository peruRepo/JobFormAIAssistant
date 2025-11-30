# Career Site Form Fetcher Extension

This is a Brave/Chrome browser extension designed to scrape form fields from websites (specifically targeted at career/job application sites), accumulate the data across multiple pages, and export it as a JSON file.

## 📂 Project Structure

*   **`manifest.json`**: The configuration file that tells the browser about the extension, its permissions (activeTab, scripting, storage, downloads), and which files to load.
*   **`popup.html`**: The user interface that appears when you click the extension icon. It contains the buttons to Fetch, Download, and Clear data.
*   **`style.css`**: The styling for the popup, featuring a modern dark-mode design with glassmorphism effects.
*   **`popup.js`**: The logic for the popup. It handles user clicks, communicates with the content script, and manages the data stored in `chrome.storage`.
*   **`content.js`**: The script that gets injected into the web page. It scans the DOM for input fields (`<input>`, `<select>`, `<textarea>`) and uses heuristics to find their corresponding labels (checking `label` tags, `aria-label`, placeholders, etc.).

## 🚀 How to Install

1.  Open **Brave** or **Chrome**.
2.  Navigate to the extensions management page:
    *   **Brave**: `brave://extensions`
    *   **Chrome**: `chrome://extensions`
3.  Enable **Developer mode** using the toggle switch in the top-right corner.
4.  Click the **Load unpacked** button that appears in the top-left.
5.  Select the folder containing this project:
    `/Users/sriram/Documents/Ayyam/Study/BrowserExtension/FormFiller`
6.  The extension "Career Site Form Fetcher" should now appear in your list.

## 📖 How to Use

1.  **Navigate** to a website containing a form (e.g., a job application page).
2.  **Click** the extension icon in your browser toolbar.
3.  (Optional) Enter a **Target Filename** (e.g., "google_jobs"). If left blank, it defaults to "form_data".
4.  Click **Fetch Fields**.
    *   The extension will scan the page.
    *   The "Total Fields" counter in the popup will update.
    *   A success message will appear indicating how many fields were found.
5.  **Accumulate Data**: You can navigate to another page (e.g., "Next Step" of the application) and click **Fetch Fields** again. The new fields will be added to your collection.
6.  **Download**: Click **Download JSON** to save the accumulated data to your computer.
7.  **Clear**: Use the **Clear** button to reset the stored data and start a new session.

## 🛠️ Technical Details

### Data Storage
The extension uses `chrome.storage.local` to persist data. This means if you close the popup or even the browser, your collected fields are saved until you explicitly click "Clear".

## 🧪 Local Mock Job Application Server

To quickly exercise the extension, spin up the mock career site bundled in `FormFiller-Server/`.

1. `cd FormFiller/FormFiller-Server`
2. Install dependencies: `npm install`
3. Start the server: `npm start`
4. Visit `http://localhost:3000` and use the “Acme Corp Careers” form to test field detection.

The server also exposes a JSON API at `POST /api/applications` and `GET /api/applications` so you can verify submissions while iterating on the extension.

### Field Detection Logic
The `content.js` script uses a robust strategy to identify field labels:
1.  Checks for a `<label>` tag with a `for` attribute matching the input's ID.
2.  Checks if the input is nested inside a `<label>` tag.
3.  Checks the `aria-label` attribute.
4.  Falls back to the `placeholder` attribute.
