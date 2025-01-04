document.addEventListener('DOMContentLoaded', function() {
    const inputText = document.getElementById('inputText');
    const maxChars = document.getElementById('maxChars');
    const splitTextsContainer = document.getElementById('splitTextsContainer');
    const charCount = document.getElementById('charCount');
    const fileInput = document.getElementById('fileInput');
    const downloadTranslations = document.getElementById('downloadTranslations');
    const resetAll = document.getElementById('resetAll');
    const copyAllOriginal = document.getElementById('copyAllOriginal');
    const copyAllTranslations = document.getElementById('copyAllTranslations');

    let splitTexts = [];
    let translations = [];
    let tagErrors = [];

    function updateCharCount() {
        charCount.textContent = inputText.value.length;
    }

    function splitText() {
        const text = inputText.value;
        const chars = parseInt(maxChars.value);

        if (!text) {
            splitTexts = [];
            renderSplitTexts();
            return;
        }

        const regex = /(<p[^>]*>[\s\S]*?<\/p>)/g;
        const parts = text.split(regex);
        
        let currentGroup = '';
        splitTexts = [];

        // Add text before first <p> if it exists
        if (parts[0].trim()) {
            splitTexts.push(parts[0].trim());
        }

        for (let i = 1; i < parts.length - 1; i++) {
            const part = parts[i];
            if (part.match(regex)) {
                if ((currentGroup + part).length <= chars) {
                    currentGroup += part;
                } else {
                    if (currentGroup) splitTexts.push(currentGroup);
                    currentGroup = part;
                }
            } else if (part.trim()) {
                // Add non-empty text between </p> and <p>
                splitTexts.push(part.trim());
            }
        }

        if (currentGroup) splitTexts.push(currentGroup);

        // Add text after last </p> if it exists
        if (parts[parts.length - 1].trim()) {
            splitTexts.push(parts[parts.length - 1].trim());
        }

        if (translations.length === 0) {
            translations = new Array(splitTexts.length).fill('');
        }
        tagErrors = new Array(splitTexts.length).fill({hasError: false, errorPositions: []});

        renderSplitTexts();
        saveToLocalStorage();
    }

    function renderSplitTexts() {
        splitTextsContainer.innerHTML = '';
        splitTexts.forEach((text, index) => {
            const card = document.createElement('div');
            card.className = `card ${tagErrors[index].hasError ? 'error' : ''}`;
            card.innerHTML = `
                <div class="card-content">
                    <div class="text-section">
                        <label>Texto original (${text.length} caracteres):</label>
                        <textarea readonly>${text}</textarea>
                        <button class="copy-button" data-index="${index}" data-type="original">
                            <span class="icon">📋</span> Copiar
                        </button>
                    </div>
                    <div class="text-section">
                        <label>Traducción (${translations[index]?.length || 0} caracteres):</label>
                        <textarea class="translation" data-index="${index}">${translations[index] || ''}</textarea>
                        <div class="button-group">
                            <button class="copy-button" data-index="${index}" data-type="translation">
                                <span class="icon">📋</span> Copiar
                            </button>
                            <button class="clear-button" data-index="${index}">
                                <span class="icon">🗑️</span> Limpiar
                            </button>
                        </div>
                    </div>
                </div>
                ${tagErrors[index].hasError ? `
                    <div class="error-message">
                        <span class="icon">⚠️</span> Advertencia: Se detectaron cambios en las etiquetas. Revise el texto resaltado a continuación.
                    </div>
                    <div class="highlighted-text">${renderHighlightedText(translations[index], tagErrors[index].errorPositions)}</div>
                ` : ''}
            `;
            splitTextsContainer.appendChild(card);
        });
    }

    function renderHighlightedText(text, errorPositions) {
        let result = [];
        let lastIndex = 0;
        const sortedErrorPositions = [...errorPositions].sort((a, b) => a - b);

        for (let i = 0; i < sortedErrorPositions.length; i++) {
            const position = sortedErrorPositions[i];
            if (position === -1) continue; // Skip missing tags

            const tagStart = text.lastIndexOf('<', position);
            const tagEnd = text.indexOf('>', position) + 1;

            if (tagStart >= lastIndex) {
                result.push(text.slice(lastIndex, tagStart));
                result.push(`<mark>${text.slice(tagStart, tagEnd)}</mark>`);
                lastIndex = tagEnd;
            }
        }
        result.push(text.slice(lastIndex));

        return result.join('');
    }

    function extractTags(text) {
        const tagRegex = /<[^>]+>/g;
        const tags = [];
        let match;
        while ((match = tagRegex.exec(text)) !== null) {
            tags.push({ tag: match[0], index: match.index });
        }
        return tags;
    }

    function compareTagsWithPositions(originalTags, translatedTags) {
        const errorPositions = [];
        const minLength = Math.min(originalTags.length, translatedTags.length);
        
        for (let i = 0; i < minLength; i++) {
            if (originalTags[i].tag.toLowerCase() !== translatedTags[i].tag.toLowerCase()) {
                errorPositions.push(translatedTags[i].index);
            }
        }

        if (originalTags.length > translatedTags.length) {
            for (let i = minLength; i < originalTags.length; i++) {
                errorPositions.push(-1);
            }
        } else if (translatedTags.length > originalTags.length) {
            for (let i = minLength; i < translatedTags.length; i++) {
                errorPositions.push(translatedTags[i].index);
            }
        }

        return [errorPositions.length > 0, errorPositions];
    }

    function copyToClipboard(text, button) {
        navigator.clipboard.writeText(text)
            .then(() => {
                button.classList.add('copied');
                setTimeout(() => {
                    button.classList.remove('copied');
                }, 2000);
            })
            .catch(err => console.error('Error al copiar: ', err));
    }

    function saveToLocalStorage() {
        localStorage.setItem('inputText', inputText.value);
        localStorage.setItem('maxChars', maxChars.value);
        localStorage.setItem('translations', JSON.stringify(translations));
    }

    function loadFromLocalStorage() {
        const savedInputText = localStorage.getItem('inputText');
        const savedMaxChars = localStorage.getItem('maxChars');
        const savedTranslations = localStorage.getItem('translations');

        if (savedInputText) inputText.value = savedInputText;
        if (savedMaxChars) maxChars.value = savedMaxChars;
        if (savedTranslations) translations = JSON.parse(savedTranslations);

        updateCharCount();
        splitText();
        loadDarkModePreference(); // Added line from update 2
    }

    inputText.addEventListener('input', function() {
        updateCharCount();
        splitText();
    });

    maxChars.addEventListener('input', splitText);

    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                inputText.value = e.target.result;
                updateCharCount();
                splitText();
            };
            reader.readAsText(file);
        }
    });

    downloadTranslations.addEventListener('click', function() {
        const allTranslations = translations.join('\n\n');
        const blob = new Blob([allTranslations], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'traducciones.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });

    resetAll.addEventListener('click', function() {
        // Save the current darkMode value
        const darkMode = localStorage.getItem('darkMode');

        // Clear input text
        inputText.value = '';

        // Reset translations array
        translations = [];

        // Update character count
        updateCharCount();

        // Clear split text
        splitText();

        // Clear entire localStorage
        localStorage.clear();

        // Restore darkMode configuration if it existed
        if (darkMode !== null) {
            localStorage.setItem('darkMode', darkMode);
        }
    });

    splitTextsContainer.addEventListener('input', function(e) {
        if (e.target.classList.contains('translation')) {
            const index = parseInt(e.target.dataset.index);
            translations[index] = e.target.value;
            
            const originalTags = extractTags(splitTexts[index]);
            const translatedTags = extractTags(e.target.value);
            const [hasError, errorPositions] = compareTagsWithPositions(originalTags, translatedTags);

            tagErrors[index] = { hasError, errorPositions };
            renderSplitTexts();
            saveToLocalStorage();
        }
    });

    splitTextsContainer.addEventListener('click', function(e) {
        if (e.target.classList.contains('copy-button')) {
            const index = parseInt(e.target.dataset.index);
            const type = e.target.dataset.type;
            const text = type === 'original' ? splitTexts[index] : translations[index];
            copyToClipboard(text, e.target);
        } else if (e.target.classList.contains('clear-button')) {
            const index = parseInt(e.target.dataset.index);
            translations[index] = '';
            renderSplitTexts();
            saveToLocalStorage();
        }
    });

    copyAllOriginal.addEventListener('click', function() {
        copyToClipboard(splitTexts.join('\n\n'), this);
    });

    copyAllTranslations.addEventListener('click', function() {
        copyToClipboard(translations.join('\n\n'), this);
    });

    // Load saved data on initial load
    loadFromLocalStorage();

    const darkModeToggle = document.getElementById('darkModeToggle');
    
    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    }
    
    function loadDarkModePreference() {
        const darkMode = localStorage.getItem('darkMode');
        if (darkMode === 'true') {
            document.body.classList.add('dark-mode');
        }
    }
    
    darkModeToggle.addEventListener('click', toggleDarkMode);
    
    // Cargar la preferencia de modo oscuro al inicio
    loadDarkModePreference();
});