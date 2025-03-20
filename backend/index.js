require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
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

// Configurar Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Ruta para registrar un vecino
app.post('/api/vecinos', (req, res) => {
  const { dni, nombre, telefono, email, direccion, tarjeta_ciudadana } = req.body;
  const sql = `INSERT INTO vecinos (dni, nombre, telefono, email, direccion, tarjeta_ciudadana) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(sql, [dni, nombre, telefono, email, direccion, tarjeta_ciudadana], function (err) {
    if (err) return res.status(400).json({ error: 'DNI ya registrado o datos inválidos' });
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Registro Exitoso - Zoonosis San Isidro',
      text: `Hola ${nombre}, tu registro fue exitoso. DNI: ${dni}`,
    };
    transporter.sendMail(mailOptions, (error) => {
      if (error) console.error(error);
    });
    res.status(201).json({ message: 'Vecino registrado' });
  });
});

// Ruta para registrar una mascota
app.post('/api/mascotas', (req, res) => {
  const { dni_vecino, nombre, raza, edad, peso } = req.body;
  const sql = `INSERT INTO mascotas (dni_vecino, nombre, raza, edad, peso) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [dni_vecino, nombre, raza, edad, peso], function (err) {
    if (err) return res.status(400).json({ error: 'Error al registrar mascota' });
    res.status(201).json({ message: 'Mascota registrada', id: this.lastID });
  });
});

// Ruta para obtener mascotas de un vecino
app.get('/api/mascotas/:dni', (req, res) => {
  const { dni } = req.params;
  const sql = `SELECT * FROM mascotas WHERE dni_vecino = ?`;
  db.all(sql, [dni], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Ruta para reservar un turno
app.post('/api/turnos', (req, res) => {
  const { dni_vecino, mascota_id, sucursal, dia, hora } = req.body;
  // Verificar si ya hay un turno en el mes
  const mes = dia.substring(0, 7); // Ej: "2025-03"
  const sqlCheck = `SELECT COUNT(*) as count FROM turnos WHERE dni_vecino = ? AND dia LIKE ? AND estado = 'Reservado'`;
  db.get(sqlCheck, [dni_vecino, `${mes}%`], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.count > 0) return res.status(400).json({ error: 'Ya tienes un turno este mes' });

    const sqlInsert = `INSERT INTO turnos (dni_vecino, mascota_id, sucursal, dia, hora, estado) VALUES (?, ?, ?, ?, ?, 'Reservado')`;
    db.run(sqlInsert, [dni_vecino, mascota_id, sucursal, dia, hora], function (err) {
      if (err) return res.status(400).json({ error: 'Error al reservar turno' });

      // Enviar email de confirmación
      db.get(`SELECT email, nombre FROM vecinos WHERE dni = ?`, [dni_vecino], (err, vecino) => {
        if (err) return;
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: vecino.email,
          subject: 'Turno Reservado - Zoonosis San Isidro',
          text: `Hola ${vecino.nombre}, tu turno fue reservado para el ${dia} a las ${hora} en ${sucursal}.`,
        };
        transporter.sendMail(mailOptions, (error) => {
          if (error) console.error(error);
        });
      });
      res.status(201).json({ message: 'Turno reservado', id: this.lastID });
    });
  });
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Backend de Zoonosis funcionando');
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});