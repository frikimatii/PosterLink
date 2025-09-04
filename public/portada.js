// Asegúrate de incluir la librería 'qrcode.js' en tu HTML
// <script src="https://cdn.jsdelivr.net/npm/david-shimjs-qrcodejs@0.1.0/qrcode.min.js"></script>

const form = document.getElementById('music-form');
const urlInput = document.getElementById('music-url');
const postContent = document.getElementById('post-content');
const albumCover = document.getElementById('album-cover');
const qrCodeDiv = document.getElementById('qr-code');
const trackListDiv = document.getElementById('track-list');

// **Importante:** Reemplaza esta URL con la dirección de tu servidor de Node.js
const token1 = localStorage.getItem('token')// ... (código existente, como las constantes de los elementos del DOM)

// **Importante:** Asegúrate de que esta URL coincida con la de tu servidor
const BACKEND_URL = 'http://localhost:5000'; 

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const albumUrl = urlInput.value;

    try {
        const token = token1; // Reemplaza con el token JWT real

        const response = await fetch(`${BACKEND_URL}/get-album-title`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ albumUrl })
        });

        const data = await response.json();

        if (response.ok) {
            updatePost(data, albumUrl); // Reutilizamos la función con la nueva data
            postContent.classList.remove('hidden');
        } else {
            alert(data.error || 'Ocurrió un error al obtener la información del álbum.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('No se pudo conectar con el servidor. Inténtalo más tarde.');
    }
});

function updatePost(data, originalUrl) {
    // Actualiza la imagen de la portada
    albumCover.src = data.coverUrl;

    // Genera el código QR con la URL original del álbum
    qrCodeDiv.innerHTML = ''; 
    new QRCode(qrCodeDiv, {
        text: originalUrl,
        width: 150,
        height: 150,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    // Actualiza la lista de temas (aquí puedes mostrar el título del álbum)
    let trackListHTML = `<h2>${data.title}</h2><p>Pistas no disponibles vía scraping.</p>`;
    trackListDiv.innerHTML = trackListHTML;
}
