document.addEventListener("DOMContentLoaded", () => {
  // --- ELEMENTOS DEL DOM ---
  const welcomeMsg = document.getElementById("welcomeMsg");
  const logoutBtn = document.getElementById("logoutBtn");
  const generateBtn = document.getElementById("generateBtn");
  const remixBtn = document.getElementById("remixBtn");
  const youtubeUrlInput = document.getElementById("youtubeUrl");
  const poster = document.getElementById("poster");
  const thumbnail = document.getElementById("thumbnail");
  const videoTitle = document.getElementById("videoTitle");
  const paletteDiv = document.getElementById("palette");
  const qrDiv = document.getElementById("qrcode");
  const statusMsg = document.getElementById("statusMsg");
  const ctaBtn = document.getElementById("ctaBtn");
  const premiumModal = document.getElementById("premiumModal");
  const payBtn = document.getElementById("payBtn");
  const closeModalBtn = premiumModal.querySelector(".close-btn");
  const downloadBtn = document.getElementById("downloadBtn");
  const galleryBtn = document.getElementById("galleryBtn");

  // --- VARIABLES DE ESTADO ---
  const API_URL = "https://posterlink.onrender.com";
  let currentVideoData = null;

  // --- LÓGICA DE SESIÓN ---
  const user = JSON.parse(localStorage.getItem("user"));
  const token = localStorage.getItem("token");

  if (!user || !token) {
    window.location.href = "index.html";
  } else {
    let userNameDisplay = user.name;
    if (user.isPremium) {
      userNameDisplay += " 👑";
      galleryBtn.classList.remove("hidden");
    }
    welcomeMsg.textContent = `Hola, ${userNameDisplay}`;
  }

  logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    window.location.href = "index.html";
  });

  // --- FUNCIONES AUXILIARES ---
  const decodeHtmlEntities = (text) => {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  };

  const applyLogoColor = (color) => {
    const logoContainer = document.getElementById("youtubeLogoContainer");
    const youtubeSvg = `
      <svg fill="${color}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <path d="M24.325 8.309s-2.655-.334-8.357-.334c-5.517 0-8.294.334-8.294.334A2.675 2.675 0 0 0 5 10.984v10.034a2.675 2.675 0 0 0 2.674 2.676s2.582.332 8.294.332c5.709 0 8.357-.332 8.357-.332A2.673 2.673 0 0 0 27 21.018V10.982a2.673 2.673 0 0 0-2.675-2.673zM13.061 19.975V12.03L20.195 16l-7.134 3.975z"/>
      </svg>`;
    logoContainer.innerHTML = youtubeSvg;
  };

  const generateQRCode = (url, colors) => {
    qrDiv.innerHTML = "";
    const canvasQR = document.createElement("canvas");
    qrDiv.appendChild(canvasQR);
    QRCode.toCanvas(canvasQR, url, {
      color: { dark: colors[1], light: colors[0] },
      width: 120,
      margin: 1,
    });
  };

  const renderColorCubes = (colors) => {
    paletteDiv.innerHTML = "";
    colors.forEach((color) => {
      const cube = document.createElement("div");
      cube.className = "color-cube";
      cube.style.backgroundColor = color;
      paletteDiv.appendChild(cube);
    });
  };

  const updateStatus = (message, type) => {
    statusMsg.textContent = message;
    statusMsg.style.color =
      type === "error" ? "#ef4444" :
      type === "success" ? "#22c55e" : "#6b7280";
  };

  const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);

  // --- FUNCIONES PRINCIPALES ---
  const applyDataToPoster = (colors) => {
    if (!currentVideoData) return;
    const decodedTitle = decodeHtmlEntities(currentVideoData.title);
    videoTitle.textContent = decodedTitle;
    thumbnail.src = currentVideoData.thumbnailUrl;
    poster.style.backgroundColor = colors[0];
    videoTitle.style.color = colors[1];
    applyLogoColor(colors[2]);
    renderColorCubes(colors);
    generateQRCode(currentVideoData.url, colors);
  };

  const generatePoster = async () => {
    const url = youtubeUrlInput.value.trim();
    if (!url) {
      updateStatus("Por favor, ingresa una URL de YouTube.", "error");
      return;
    }
    updateStatus("Generando, por favor espera...", "loading");
    generateBtn.disabled = true;
    downloadBtn.disabled = true;

    try {
      const res = await fetch(`${API_URL}/get-video-info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ youtubeUrl: url }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "No se pudieron obtener los datos del video");
      }

      const data = await res.json();
      currentVideoData = { ...data, url };

      applyDataToPoster(currentVideoData.colors);
      updateStatus("¡Póster generado con éxito!", "success");
      downloadBtn.disabled = false;
      ctaBtn.href = url;
      ctaBtn.classList.remove("hidden");
    } catch (err) {
      console.error("Error al generar el póster:", err);
      updateStatus(`Error: ${err.message}`, "error");
      downloadBtn.disabled = true;
      ctaBtn.classList.add("hidden");
    } finally {
      generateBtn.disabled = false;
    }
  };

  // Subir a imgbb vía servidor
  const uploadImageToServer = async (imageData, filename) => {
    const res = await fetch(`${API_URL}/upload-to-imgbb`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ imageData, filename }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al subir la imagen a imgbb.");
    return data.url;
  };

  const triggerDownloadAndUpload = () => {
    updateStatus("Descargando y subiendo póster...", "loading");
    html2canvas(poster, { useCORS: true, scale: 2 }).then((canvas) => {
      // Descargar
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${currentVideoData.title.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
      link.click();

      // Subir a servidor
      const imageData = canvas.toDataURL("image/png");
      const filename = `${currentVideoData.title.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
      uploadImageToServer(imageData, filename)
        .then((url) => {
          updateStatus("✅ ¡Descarga y subida exitosa!", "success");
          console.log("Póster subido a:", url);
        })
        .catch((error) => {
          console.error("Error al subir el póster:", error);
          updateStatus(`❌ Descarga exitosa, pero la subida falló: ${error.message}`, "error");
        });
    });
  };

  // --- EVENT LISTENERS ---
  generateBtn.addEventListener("click", generatePoster);

  remixBtn.addEventListener("click", () => {
    if (!currentVideoData) {
      updateStatus("Primero genera un póster para remezclar.", "error");
      return;
    }
    const newColors = shuffleArray(currentVideoData.colors);
    currentVideoData.colors = newColors;
    applyDataToPoster(newColors);
  });

  payBtn.addEventListener("click", async () => {
    updateStatus("Procesando pago...", "loading");
    payBtn.disabled = true;
    try {
      const res = await fetch(`${API_URL}/update-to-premium`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo completar el pago.");
      
      // Actualizar estado del usuario en localStorage
      const updatedUser = { ...user, isPremium: true };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      premiumModal.classList.remove("show");
      updateStatus("¡Pago exitoso! Ahora puedes descargar.", "success");

      triggerDownloadAndUpload();
    } catch (error) {
      console.error("Error en el pago:", error);
      updateStatus(`❌ Error en el pago: ${error.message}`, "error");
    } finally {
      payBtn.disabled = false;
    }
  });

  closeModalBtn.addEventListener("click", () => {
    premiumModal.classList.remove("show");
  });

  downloadBtn.addEventListener("click", () => {
    if (!currentVideoData) {
      updateStatus("Primero genera un póster para descargar.", "error");
      return;
    }
    const user = JSON.parse(localStorage.getItem("user"));
    if (user && user.isPremium) {
      triggerDownloadAndUpload();
    } else {
      premiumModal.classList.add("show");
    }
  });

  galleryBtn.addEventListener("click", () => {
    window.location.href = "gallery.html";
  });
});
