document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('inputText');
    const charLimit = document.getElementById('charLimit');
    const divideBtn = document.getElementById('divideBtn');
    const output = document.getElementById('output');
    const copyAllBtn = document.getElementById('copyAllBtn');
    const darkModeToggle = document.getElementById('darkModeToggle');

    // Load dark mode preference
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
    }

    darkModeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? 'enabled' : 'disabled');
    });

    divideBtn.addEventListener('click', () => {
        const text = inputText.value;
        const limit = parseInt(charLimit.value);
        const subtexts = divideText(text, limit);
        displaySubtexts(subtexts);
    });

    copyAllBtn.addEventListener('click', () => {
        const allText = Array.from(document.querySelectorAll('.output-text'))
            .map(el => el.textContent)
            .join('\n\n');
        copyToClipboard(allText);
    });

    function divideText(text, limit) {
        const words = text.split(' ');
        const subtexts = [];
        let currentSubtext = '';

        for (const word of words) {
            if ((currentSubtext + word).length > limit) {
                subtexts.push(currentSubtext.trim());
                currentSubtext = '';
            }
            currentSubtext += word + ' ';
        }

        if (currentSubtext.trim()) {
            subtexts.push(currentSubtext.trim());
        }

        return subtexts;
    }

    function displaySubtexts(subtexts) {
        output.innerHTML = '';
        subtexts.forEach((subtext, index) => {
            const subtextElement = document.createElement('div');
            subtextElement.classList.add('output-item');
        
            const textElement = document.createElement('div');
            textElement.classList.add('output-text');
            textElement.textContent = `${subtext} [${index + 1}/${subtexts.length}]`;
        
            const infoElement = document.createElement('div');
            infoElement.classList.add('subtext-info');
            infoElement.textContent = `Caracteres: ${subtext.length}`;
        
            const copyBtn = document.createElement('button');
            copyBtn.classList.add('btn', 'copy-btn');
            copyBtn.innerHTML = '<span class="material-icons">content_copy</span> Copiar';
            copyBtn.addEventListener('click', () => copyToClipboard(textElement.textContent));

            subtextElement.appendChild(textElement);
            subtextElement.appendChild(infoElement);
            subtextElement.appendChild(copyBtn);
            output.appendChild(subtextElement);
        });

        copyAllBtn.style.display = subtexts.length > 0 ? 'inline-flex' : 'none';
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            alert('Texto copiado al portapapeles');
        }, (err) => {
            console.error('Error al copiar texto: ', err);
        });
    }
});


