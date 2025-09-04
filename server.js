import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { MongoClient, GridFSBucket } from "mongodb";
import getColors from "get-image-colors";
import bcrypt from "bcrypt";

const app = express();
app.use(express.json());
app.use(cors({ origin: "https://frikimatii.github.io/PosterLink" }));

const url = "mongodb+srv://fernandomatiasjuarez88:pwwm9eo6O7i7IKyv@basededatosmatias.fxkuru7.mongodb.net/?retryWrites=true&w=majority&appName=basededatosMATIAS";
const client = new MongoClient(url);
let bucket;
let usersCollection; // <- importante, debe estar arriba de todo


async function connectDB() {
    await client.connect();
    const db = client.db("mydatabase");

    // Bucket para miniaturas
    bucket = new GridFSBucket(db, { bucketName: "Usuarios" });

    // Colección para registrar usuarios
    usersCollection = db.collection("UsuariosDatos");

    console.log("MongoDB conectado y bucket listo");
}

async function startServer() {
    try {
        await connectDB(); // aseguramos que todo esté listo
        app.listen(5000, () => console.log("Servidor corriendo en https://frikimatii.github.io/PosterLink"));
    } catch (err) {
        console.error("Error conectando a MongoDB:", err);
    }
}

startServer();


function getVideoId(url) {
    const short = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (short) return short[1];
    const long = url.match(/v=([a-zA-Z0-9_-]+)/);
    return long ? long[1] : null;
}

app.post("/register", async (req, res) => {
  if (!usersCollection) {
    return res.status(500).json({ error: "Base de datos no conectada todavía" });
  }

  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Faltan datos obligatorios" });

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "El correo ya está registrado" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await usersCollection.insertOne({ name, email, password: hashedPassword, createdAt: new Date() });

    res.status(201).json({ message: "Usuario registrado", userId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error registrando usuario" });
  }
});




// Login de usuario
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(400).json({ error: "Credenciales incorrectas" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Credenciales incorrectas" });

    // Devuelve también el nombre
    res.json({ 
      message: "Login exitoso", 
      userId: user._id, 
      name: user.name, 
      email: user.email 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en login" });
  }
});

app.get("/user/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    // Convertir a ObjectId de Mongo
    const { ObjectId } = require("mongodb");
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    res.json({ name: user.name, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo usuario" });
  }
});


app.post("/get-title", async (req, res) => {
    const { youtubeUrl } = req.body;
    const videoId = getVideoId(youtubeUrl);
    if (!videoId) return res.status(400).json({ error: "URL inválida" });

    try {
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
        const html = await response.text();
        const match = html.match(/<title>(.*?)<\/title>/);
        const title = match ? match[1].replace(" - YouTube", "").trim() : "Título no encontrado";
        res.json({ videoId, title });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "No se pudo obtener el título" });
    }
});

app.post("/save-thumbnail", async (req, res) => {
    const { youtubeUrl } = req.body;
    const videoId = getVideoId(youtubeUrl);
    if (!videoId) return res.status(400).json({ error: "URL inválida" });

    try {
        let response = await fetch(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
        if (!response.ok) {
            response = await fetch(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
            if (!response.ok) throw new Error("No se pudo descargar la miniatura");
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const colors = await getColors(buffer, "image/jpeg");
        const palette = colors.map(c => c.hex());

        res.json({ thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, colors: palette });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error procesando la miniatura" });
    }
});

app.listen(5000, () => console.log("Servidor corriendo en https://frikimatii.github.io/PosterLink"));
