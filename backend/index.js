const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Conectar a la base de datos SQLite
const db = new sqlite3.Database('./zoonosis.db', (err) => {
  if (err) console.error(err.message);
  console.log('Conectado a la base de datos.');
});

// Crear tablas
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS vecinos (
    dni TEXT PRIMARY KEY,
    nombre TEXT,
    telefono TEXT,
    email TEXT,
    direccion TEXT,
    tarjeta_ciudadana TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS mascotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dni_vecino TEXT,
    nombre TEXT,
    raza TEXT,
    edad TEXT,
    peso REAL,
    FOREIGN KEY (dni_vecino) REFERENCES vecinos(dni)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dni_vecino TEXT,
    mascota_id INTEGER,
    sucursal TEXT,
    dia TEXT,
    hora TEXT,
    estado TEXT,
    FOREIGN KEY (dni_vecino) REFERENCES vecinos(dni),
    FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
  )`);
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Backend de Zoonosis funcionando');
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});