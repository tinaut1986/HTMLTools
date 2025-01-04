document.addEventListener('DOMContentLoaded', () => {
    const toolList = document.getElementById('toolList');
    const nightModeToggle = document.getElementById('nightModeToggle');

    // Obtener la lista de juegos desde el archivo PHP
    fetch('get_tools.php')
        .then(response => response.json())
        .then(tools => {
            tools.forEach(tool => {
                const toolItem = document.createElement('div');
                toolItem.className = 'tool-item';
                
                if (tool.favicon) {
                    const favicon = document.createElement('img');
                    favicon.src = `data:image/x-icon;base64,${tool.favicon}`;
                    favicon.alt = `${tool.name} favicon`;
                    toolItem.appendChild(favicon);
                }
                
                const toolName = document.createElement('span');
                toolName.textContent = tool.name;
                toolItem.appendChild(toolName);
                
                toolItem.addEventListener('click', () => {
                    window.location.href = `./${tool.name}/index.html`;
                });
                toolList.appendChild(toolItem);
            });
        })
        .catch(error => {
            console.error('Error al obtener la lista de juegos:', error);
            toolList.innerHTML = '<p>Error al cargar los juegos. Por favor, intenta más tarde.</p>';
        });

    // Funcionalidad del modo noche
    function toggleNightMode() {
        document.body.classList.toggle('night-mode');
        const isNightMode = document.body.classList.contains('night-mode');
        localStorage.setItem('nightMode', isNightMode);
        nightModeToggle.innerHTML = isNightMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }

    // Cargar preferencia de modo noche
    const savedNightMode = localStorage.getItem('nightMode');
    if (savedNightMode === 'true') {
        toggleNightMode();
    }

    nightModeToggle.addEventListener('click', toggleNightMode);

    // Easter egg
    let clickCount = 0;
    const easterEggThreshold = 5;
    let lastClickTime = 0;

    document.addEventListener('click', (e) => {
        const currentTime = new Date().getTime();
        if (currentTime - lastClickTime < 500) {
            clickCount++;
            if (clickCount === easterEggThreshold) {
                alert('¡Has descubierto el Easter egg! 🎉🥚');
                document.body.style.fontFamily = 'Comic Sans MS, cursive';
                setTimeout(() => {
                    document.body.style.fontFamily = '';
                }, 5000);
                clickCount = 0;
            }
        } else {
            clickCount = 1;
        }
        lastClickTime = currentTime;
    });
});


