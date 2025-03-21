require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro';

const allowedOrigins = ['http://localhost:3000', 'https://zoonosis-turnos.vercel.app'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
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
    puesto TEXT,
    dia TEXT,
    hora TEXT,
    estado TEXT,
    FOREIGN KEY (dni_vecino) REFERENCES vecinos(dni),
    FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS puestos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    direccion TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS horarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puesto_id INTEGER,
    dia TEXT,
    hora TEXT,
    disponible INTEGER DEFAULT 1,
    FOREIGN KEY (puesto_id) REFERENCES puestos(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  // Precargar puestos
  db.get(`SELECT COUNT(*) as count FROM puestos`, (err, row) => {
    if (row.count === 0) {
      const puestos = [
        ['Sede Central', 'Av. Central 123'],
        ['Hospital de Boulogne', 'Boulogne'],
        ['Subdelegacion Beccar', 'Beccar'],
        ['Plaza 9 de Julio', 'San Isidro'],
        ['Sede CAVA 1', 'San Isidro'],
        ['Plaza Stella Maris', 'San Isidro'],
        ['CAPS Barrio Obrero', 'Barrio Obrero'],
        ['Delegacion de Beccar', 'Beccar'],
        ['Delegacion de Boulogne', 'Boulogne'],
        ['Delegacion Bajo Boulogne', 'Bajo Boulogne'],
        ['Subdelegacion Martinez (Centro 35)', 'Martinez'],
        ['Plaza Brown', 'San Isidro'],
        ['Merendero Municipal Barrio San Cayetano', 'San Cayetano'],
        ['Sede CAVA 2', 'San Isidro'],
        ['Delegacion Las Lomas', 'Las Lomas'],
        ['Barrio San Isidro (BASI)', 'San Isidro'],
        ['Polideportivo Bajo Boulogne', 'Bajo Boulogne'],
        ['Delegacion La Horqueta', 'La Horqueta'],
        ['Plaza Belgrano', 'San Isidro'],
        ['Paseo de los Inmigrantes', 'San Isidro'],
        ['Barrio 20 de Junio', 'San Isidro'],
        ['Barrio Jardín (Iglesia San Benito)', 'San Isidro'],
        ['CAPS Bajo San Isidro', 'Bajo San Isidro'],
        ['Barrio Angelita', 'San Isidro'],
        ['Barrio Granaderos', 'San Isidro'],
        ['Barrio Los Sauces', 'San Isidro'],
        ['Barrio Uruguay y Beccar', 'Beccar'],
        ['Barrio los Perales', 'San Isidro'],
        ['Barrio Obrero', 'Barrio Obrero'],
        ['Barrio Estación', 'San Isidro'],
        ['Barrio Santa Rita', 'San Isidro'],
        ['Barrio Santa Ana', 'San Isidro'],
        ['Barrio El Congo', 'San Isidro']
      ];
      puestos.forEach(([nombre, direccion]) => {
        db.run(`INSERT INTO puestos (nombre, direccion) VALUES (?, ?)`, [nombre, direccion]);
      });
    }
  });

  // Precargar horarios iniciales (ejemplo)
  db.get(`SELECT COUNT(*) as count FROM horarios`, (err, row) => {
    if (row.count === 0) {
      db.run(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (1, '2025-03-25', '10:00')`);
      db.run(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (1, '2025-03-25', '11:00')`);
      db.run(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (2, '2025-03-26', '14:00')`);
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

app.get('/api/puestos', (req, res) => {
  const sql = `SELECT * FROM puestos`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/horarios/:puesto_id', (req, res) => {
  const { puesto_id } = req.params;
  const sql = `SELECT * FROM horarios WHERE puesto_id = ? AND disponible = 1`;
  db.all(sql, [puesto_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/turnos', (req, res) => {
  const { dni_vecino, mascota_id, puesto, dia, hora } = req.body;
  const mes = dia.substring(0, 7);
  const sqlCheckTurno = `SELECT COUNT(*) as count FROM turnos WHERE dni_vecino = ? AND dia LIKE ? AND estado = 'Reservado'`;
  db.get(sqlCheckTurno, [dni_vecino, `${mes}%`], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.count > 0) return res.status(400).json({ error: 'Ya tienes un turno este mes' });

    const sqlCheckHorario = `SELECT id FROM horarios WHERE puesto_id = (SELECT id FROM puestos WHERE nombre = ?) AND dia = ? AND hora = ? AND disponible = 1`;
    db.get(sqlCheckHorario, [puesto, dia, hora], (err, horario) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!horario) return res.status(400).json({ error: 'Horario no disponible' });

      const sqlInsert = `INSERT INTO turnos (dni_vecino, mascota_id, puesto, dia, hora, estado) VALUES (?, ?, ?, ?, ?, 'Reservado')`;
      db.run(sqlInsert, [dni_vecino, mascota_id, puesto, dia, hora], function (err) {
        if (err) return res.status(400).json({ error: 'Error al reservar turno' });

        db.run(`UPDATE horarios SET disponible = 0 WHERE id = ?`, [horario.id]);

        db.get(`SELECT email, nombre FROM vecinos WHERE dni = ?`, [dni_vecino], (err, vecino) => {
          if (err) return;
          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: vecino.email,
            subject: 'Turno Reservado - Zoonosis San Isidro',
            text: `Hola ${vecino.nombre}, tu turno fue reservado para el ${dia} a las ${hora} en ${puesto}.`,
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
  const sql = `SELECT t.id, t.dni_vecino, v.nombre AS vecino_nombre, m.nombre AS mascota_nombre, t.puesto, t.dia, t.hora, t.estado 
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
  db.get(`SELECT puesto, dia, hora FROM turnos WHERE id = ?`, [id], (err, turno) => {
    if (err || !turno) return res.status(400).json({ error: 'Turno no encontrado' });
    const sql = `UPDATE turnos SET estado = 'Cancelado' WHERE id = ?`;
    db.run(sql, [id], function (err) {
      if (err) return res.status(400).json({ error: 'Error al cancelar turno' });
      db.run(`UPDATE horarios SET disponible = 1 WHERE puesto_id = (SELECT id FROM puestos WHERE nombre = ?) AND dia = ? AND hora = ?`, [turno.puesto, turno.dia, turno.hora]);
      res.json({ message: 'Turno cancelado' });
    });
  });
});

app.get('/api/horarios', verifyToken, (req, res) => {
  const sql = `SELECT h.id, s.nombre AS puesto, h.dia, h.hora, h.disponible 
               FROM horarios h 
               JOIN puestos s ON h.puesto_id = s.id`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/horarios', verifyToken, (req, res) => {
  const { puesto_id, dia, hora } = req.body;
  const hoy = new Date();
  const fechaIngresada = new Date(dia);
  if (fechaIngresada < hoy.setHours(0, 0, 0, 0)) {
    return res.status(400).json({ error: 'No se pueden agregar horarios en fechas pasadas' });
  }
  const sqlCheck = `SELECT COUNT(*) as count FROM horarios WHERE puesto_id = ? AND dia = ? AND hora = ?`;
  db.get(sqlCheck, [puesto_id, dia, hora], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.count > 0) return res.status(400).json({ error: 'Ya existe un horario para este puesto, día y hora' });
    const sql = `INSERT INTO horarios (puesto_id, dia, hora) VALUES (?, ?, ?)`;
    db.run(sql, [puesto_id, dia, hora], function (err) {
      if (err) return res.status(400).json({ error: 'Error al agregar horario' });
      res.status(201).json({ message: 'Horario agregado', id: this.lastID });
    });
  });
});

app.put('/api/horarios/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  const { puesto_id, dia, hora } = req.body;
  const hoy = new Date();
  const fechaIngresada = new Date(dia);
  if (fechaIngresada < hoy.setHours(0, 0, 0, 0)) {
    return res.status(400).json({ error: 'No se pueden editar horarios a fechas pasadas' });
  }
  const sqlCheck = `SELECT COUNT(*) as count FROM horarios WHERE puesto_id = ? AND dia = ? AND hora = ? AND id != ?`;
  db.get(sqlCheck, [puesto_id, dia, hora, id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.count > 0) return res.status(400).json({ error: 'Ya existe otro horario para este puesto, día y hora' });
    const sql = `UPDATE horarios SET puesto_id = ?, dia = ?, hora = ? WHERE id = ?`;
    db.run(sql, [puesto_id, dia, hora, id], function (err) {
      if (err) return res.status(400).json({ error: 'Error al modificar horario' });
      if (this.changes === 0) return res.status(404).json({ error: 'Horario no encontrado' });
      res.json({ message: 'Horario modificado' });
    });
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