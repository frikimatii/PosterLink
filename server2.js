import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import ratelimit from "express-rate-limit";
import getColors from "get-image-colors";
import fetch from "node-fetch";
import FormData from "form-data";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || "";

// --- Middlewares ---
app.use(express.json({ limit: "500mb" }));
app.use(helmet());
app.use(
  cors({
    origin: "https://frikimatii.github.io", // tu frontend
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.options("*", cors());
app.set("trust proxy", 1);

const authLimiter = ratelimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Demasiados intentos. Por favor, prueba más tarde." },
});

// --- Conexión a MongoDB ---
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB conectado"))
  .catch((err) => {
    console.error("❌ Error conectando a MongoDB:", err.message);
    process.exit(1);
  });

// --- Esquema y Modelo de Usuario ---
const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    isPremium: { type: Boolean, default: false },
    posters: [{ type: String }],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// --- Funciones de Utilidad ---
function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });
}

function getVideoId(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === "youtu.be") {
      return urlObj.pathname.slice(1);
    }
    if (urlObj.hostname.includes("youtube.com")) {
      return urlObj.searchParams.get("v");
    }
    return null;
  } catch (error) {
    const short = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (short) return short[1];
    const long = url.match(/v=([a-zA-Z0-9_-]+)/);
    return long ? long[1] : null;
  }
}

// --- Middleware de Autenticación ---
async function auth(req, res, next) {
  const header = req.headers["authorization"];
  if (!header)
    return res
      .status(401)
      .json({ error: "Acceso no autorizado. Se requiere token." });

  const token = header.split(" ")[1];
  if (!token)
    return res.status(401).json({ error: "Formato de token inválido." });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
}

// --- RUTAS DE AUTENTICACIÓN ---
app.get("/", (req, res) =>
  res.json({ message: "API de PosterLink funcionando correctamente" })
);

app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password || !name) {
      return res
        .status(400)
        .json({ error: "Nombre, email y contraseña son requeridos" });
    }

    const existing = await User.findOne({ email });
    if (existing)
      return res
        .status(409)
        .json({ error: "El correo electrónico ya está registrado" });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: "Usuario creado con éxito." });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ error: "Email y contraseña son requeridos" });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ error: "Credenciales inválidas" });

    const token = createToken({ id: user._id, email: user.email });
    res.json({
      token,
      user: {
        userId: user._id,
        name: user.name,
        email: user.email,
        isPremium: user.isPremium,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// --- RUTA PRINCIPAL DE LA APLICACIÓN ---
app.post("/get-video-info", auth, async (req, res) => {
  const { youtubeUrl } = req.body;
  const videoId = getVideoId(youtubeUrl);
  if (!videoId) {
    return res.status(400).json({ error: "La URL de YouTube no es válida." });
  }

  try {
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    let thumbnailResponse = await fetch(thumbnailUrl);

    if (!thumbnailResponse.ok) {
      const hqThumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      thumbnailResponse = await fetch(hqThumbnailUrl);
      if (!thumbnailResponse.ok) {
        throw new Error("No se encontró una miniatura para este video.");
      }
    }

    const buffer = Buffer.from(await thumbnailResponse.arrayBuffer());
    const colors = await getColors(buffer, "image/jpeg");
    const palette = colors.map((c) => c.hex());

    const videoPageResponse = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`
    );
    const html = await videoPageResponse.text();
    const match = html.match(/<title>(.*?)<\/title>/);
    const title = match
      ? match[1].replace(" - YouTube", "").trim()
      : "Título no disponible";

    res.json({
      title,
      thumbnailUrl,
      colors: palette,
    });
  } catch (err) {
    console.error("Error procesando video info:", err.message);
    res
      .status(500)
      .json({ error: "No se pudo procesar el video. Inténtalo de nuevo." });
  }
});

// 🚨 RUTA DE SUBIDA Y GUARDADO DE URL
app.post("/upload-to-imgbb", auth, async (req, res) => {
  const { imageData, filename } = req.body;
  if (!imageData || !filename) {
    return res
      .status(400)
      .json({ error: "Datos de imagen y nombre de archivo son requeridos." });
  }
  if (!IMGBB_API_KEY) {
    return res
      .status(500)
      .json({ error: "Clave de API de imgbb no configurada en el servidor." });
  }

  try {
    const base64Data = imageData.split(",")[1];

    const formData = new FormData();
    formData.append("image", base64Data); // Solo base64, evita problemas en producción

    const imgbbUrl = `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`;
    const response = await fetch(imgbbUrl, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      req.user.posters.push(data.data.url);
      await req.user.save();
      res.json({
        message: "Imagen subida y guardada con éxito.",
        url: data.data.url,
      });
    } else {
      res
        .status(400)
        .json({
          error: data.error?.message || "Error al subir la imagen a imgbb.",
        });
    }
  } catch (error) {
    console.error("Error en el endpoint de subida:", error);
    res
      .status(500)
      .json({ error: "Error interno del servidor al subir la imagen." });
  }
});

// 🚨 RUTA DE ACTUALIZACIÓN A PREMIUM
app.post("/update-to-premium", auth, async (req, res) => {
  try {
    if (req.user.isPremium) {
      return res.status(400).json({ error: "El usuario ya es premium." });
    }
    req.user.isPremium = true;
    await req.user.save();
    res.json({
      message: "¡Actualización a premium exitosa!",
      user: {
        userId: req.user._id,
        name: req.user.name,
        email: req.user.email,
        isPremium: req.user.isPremium,
      },
    });
  } catch (error) {
    console.error("Error al actualizar a premium:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// 🚨 Endpoint para la galería de pósters
app.get("/get-posters", auth, async (req, res) => {
  try {
    if (!req.user.isPremium) {
      return res
        .status(403)
        .json({
          error: "Acceso denegado. Esta función es solo para usuarios premium.",
        });
    }
    res.json({ posters: req.user.posters });
  } catch (error) {
    console.error("Error al obtener los pósters:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
