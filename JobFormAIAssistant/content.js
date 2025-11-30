// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scan_forms') {
        const fields = scanPage();
        sendResponse({ fields: fields });
    }

    if (request.action === 'fill_field') {
        fillField(request.id, request.value);
        sendResponse({ success: true });
    }

    if (request.action === 'reset_forms') {
        const inputs = document.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            // Safety check: don't clear buttons/submits
            if (input.type !== 'submit' && input.type !== 'button' && input.type !== 'image' && input.type !== 'hidden') {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        sendResponse({ success: true });
    }

    return true;
});

function fillField(elementId, value) {
    if (!elementId) return;

    const element = document.getElementById(elementId);
    if (element) {
        // CRITICAL SAFETY CHECK: Never interact with submit buttons or hidden fields during fill
        if (element.type === 'submit' || element.type === 'image' || element.type === 'button') {
            console.warn(`Skipping fill for element ${elementId} as it is a button/submit type.`);
            return;
        }

        element.value = value;
        // Trigger events so frameworks like React/Angular detect the change
        // We strictly avoid 'submit' events or simulating 'Enter' keypresses
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true })); // Finalize the field edit
    }
}

function scanPage() {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
    const results = [];

    inputs.forEach(input => {
        // Skip hidden or submit inputs
        if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button' || input.type === 'image') {
            return;
        }

        // Try to find a label
        let labelText = '';

        // 1. Check explicit label tag with 'for' attribute
        if (input.id) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label) labelText = label.innerText;
        }

        // 2. Check if wrapped in a label
        if (!labelText) {
            const parentLabel = input.closest('label');
            if (parentLabel) {
                labelText = parentLabel.innerText;
            }
        }

        // 3. Check aria-label
        if (!labelText) {
            labelText = input.getAttribute('aria-label') || '';
        }

        // 4. Check placeholder
        if (!labelText) {
            labelText = input.placeholder || '';
        }

        // Clean up label
        labelText = labelText.replace(/[\n\r\t]/g, ' ').trim();

        results.push({
            tag: input.tagName.toLowerCase(),
            type: input.type || 'text',
            name: input.name || '',
            id: input.id || '', // Critical for filling back
            label: labelText,
            value: input.value || '',
            placeholder: input.placeholder || '',
            required: input.required || false
        });
    });

    return results;
}
