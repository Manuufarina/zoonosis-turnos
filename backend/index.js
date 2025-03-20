require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro';

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./zoonosis.db', (err) => {
  if (err) console.error(err.message);
  console.log('Conectado a la base de datos.');
});

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

  db.run(`CREATE TABLE IF NOT EXISTS sucursales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    direccion TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS horarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal_id INTEGER,
    dia TEXT,
    hora TEXT,
    disponible INTEGER DEFAULT 1,
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  db.get(`SELECT COUNT(*) as count FROM sucursales`, (err, row) => {
    if (row.count === 0) {
      db.run(`INSERT INTO sucursales (nombre, direccion) VALUES ('Zoonosis Central', 'Av. Central 123')`);
      db.run(`INSERT INTO sucursales (nombre, direccion) VALUES ('Sucursal Norte', 'Calle Norte 456')`);
    }
  });

  db.get(`SELECT COUNT(*) as count FROM horarios`, (err, row) => {
    if (row.count === 0) {
      db.run(`INSERT INTO horarios (sucursal_id, dia, hora) VALUES (1, '2025-03-25', '10:00')`);
      db.run(`INSERT INTO horarios (sucursal_id, dia, hora) VALUES (1, '2025-03-25', '11:00')`);
      db.run(`INSERT INTO horarios (sucursal_id, dia, hora) VALUES (2, '2025-03-26', '14:00')`);
    }
  });

  db.get(`SELECT COUNT(*) as count FROM admins`, (err, row) => {
    if (row.count === 0) {
      db.run(`INSERT INTO admins (username, password) VALUES ('admin', '1234')`);
    }
  });
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ error: 'Token requerido' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Token inválido' });
    req.adminId = decoded.id;
    next();
  });
};

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM admins WHERE username = ? AND password = ?`, [username, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const token = jwt.sign({ id: row.id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  });
});

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

app.post('/api/mascotas', (req, res) => {
  const { dni_vecino, nombre, raza, edad, peso } = req.body;
  const sql = `INSERT INTO mascotas (dni_vecino, nombre, raza, edad, peso) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [dni_vecino, nombre, raza, edad, peso], function (err) {
    if (err) return res.status(400).json({ error: 'Error al registrar mascota' });
    res.status(201).json({ message: 'Mascota registrada', id: this.lastID });
  });
});

app.get('/api/mascotas/:dni', (req, res) => {
  const { dni } = req.params;
  const sql = `SELECT * FROM mascotas WHERE dni_vecino = ?`;
  db.all(sql, [dni], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/sucursales', (req, res) => {
  const sql = `SELECT * FROM sucursales`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/horarios/:sucursal_id', (req, res) => {
  const { sucursal_id } = req.params;
  const sql = `SELECT * FROM horarios WHERE sucursal_id = ? AND disponible = 1`;
  db.all(sql, [sucursal_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/turnos', (req, res) => {
  const { dni_vecino, mascota_id, sucursal, dia, hora } = req.body;
  const mes = dia.substring(0, 7);
  const sqlCheckTurno = `SELECT COUNT(*) as count FROM turnos WHERE dni_vecino = ? AND dia LIKE ? AND estado = 'Reservado'`;
  db.get(sqlCheckTurno, [dni_vecino, `${mes}%`], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.count > 0) return res.status(400).json({ error: 'Ya tienes un turno este mes' });

    const sqlCheckHorario = `SELECT id FROM horarios WHERE sucursal_id = (SELECT id FROM sucursales WHERE nombre = ?) AND dia = ? AND hora = ? AND disponible = 1`;
    db.get(sqlCheckHorario, [sucursal, dia, hora], (err, horario) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!horario) return res.status(400).json({ error: 'Horario no disponible' });

      const sqlInsert = `INSERT INTO turnos (dni_vecino, mascota_id, sucursal, dia, hora, estado) VALUES (?, ?, ?, ?, ?, 'Reservado')`;
      db.run(sqlInsert, [dni_vecino, mascota_id, sucursal, dia, hora], function (err) {
        if (err) return res.status(400).json({ error: 'Error al reservar turno' });

        db.run(`UPDATE horarios SET disponible = 0 WHERE id = ?`, [horario.id]);

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
});

app.get('/api/turnos', verifyToken, (req, res) => {
  const sql = `SELECT t.id, t.dni_vecino, v.nombre AS vecino_nombre, m.nombre AS mascota_nombre, t.sucursal, t.dia, t.hora, t.estado 
               FROM turnos t 
               JOIN vecinos v ON t.dni_vecino = v.dni 
               JOIN mascotas m ON t.mascota_id = m.id`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/api/turnos/:id/cancelar', verifyToken, (req, res) => {
  const { id } = req.params;
  db.get(`SELECT sucursal, dia, hora FROM turnos WHERE id = ?`, [id], (err, turno) => {
    if (err || !turno) return res.status(400).json({ error: 'Turno no encontrado' });
    const sql = `UPDATE turnos SET estado = 'Cancelado' WHERE id = ?`;
    db.run(sql, [id], function (err) {
      if (err) return res.status(400).json({ error: 'Error al cancelar turno' });
      db.run(`UPDATE horarios SET disponible = 1 WHERE sucursal_id = (SELECT id FROM sucursales WHERE nombre = ?) AND dia = ? AND hora = ?`, [turno.sucursal, turno.dia, turno.hora]);
      res.json({ message: 'Turno cancelado' });
    });
  });
});

// Rutas para gestionar horarios (Admin)
app.get('/api/horarios', verifyToken, (req, res) => {
  const sql = `SELECT h.id, s.nombre AS sucursal, h.dia, h.hora, h.disponible 
               FROM horarios h 
               JOIN sucursales s ON h.sucursal_id = s.id`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/horarios', verifyToken, (req, res) => {
  const { sucursal_id, dia, hora } = req.body;
  const sql = `INSERT INTO horarios (sucursal_id, dia, hora) VALUES (?, ?, ?)`;
  db.run(sql, [sucursal_id, dia, hora], function (err) {
    if (err) return res.status(400).json({ error: 'Error al agregar horario' });
    res.status(201).json({ message: 'Horario agregado', id: this.lastID });
  });
});

app.put('/api/horarios/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  const { dia, hora } = req.body;
  const sql = `UPDATE horarios SET dia = ?, hora = ? WHERE id = ?`;
  db.run(sql, [dia, hora, id], function (err) {
    if (err) return res.status(400).json({ error: 'Error al modificar horario' });
    res.json({ message: 'Horario modificado' });
  });
});

app.delete('/api/horarios/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  const sql = `DELETE FROM horarios WHERE id = ?`;
  db.run(sql, [id], function (err) {
    if (err) return res.status(400).json({ error: 'Error al eliminar horario' });
    res.json({ message: 'Horario eliminado' });
  });
});

app.get('/', (req, res) => {
  res.send('Backend de Zoonosis funcionando');
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});