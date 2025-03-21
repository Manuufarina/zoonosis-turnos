const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const db = new sqlite3.Database('./zoonosis.db', (err) => {
  if (err) console.error(err.message);
  console.log('Conectado a la base de datos SQLite');
});

db.serialize(() => {
  // Crear tablas si no existen
  db.run(`CREATE TABLE IF NOT EXISTS vecinos (
    dni WEXT PRIMARY KEY,
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

  db.run(`CREATE TABLE IF NOT EXISTS puestos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    direccion TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS veterinarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    matricula TEXT UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS horarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puesto_id INTEGER,
    dia TEXT,
    hora TEXT,
    disponible INTEGER DEFAULT 1,
    FOREIGN KEY (puesto_id) REFERENCES puestos(id)
  )`);

  // Migración para la tabla turnos
  db.all(`PRAGMA table_info(turnos)`, (err, columns) => {
    if (err) {
      console.error('Error al verificar tabla turnos:', err.message);
      return;
    }

    const hasVeterinarioId = columns.some(col => col.name === 'veterinario_id');
    if (!hasVeterinarioId) {
      console.log('Migrando tabla turnos para agregar veterinario_id...');
      db.run(`CREATE TABLE turnos_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dni_vecino TEXT,
        mascota_id INTEGER,
        puesto TEXT,
        dia TEXT,
        hora TEXT,
        estado TEXT,
        veterinario_id INTEGER,
        FOREIGN KEY (dni_vecino) REFERENCES vecinos(dni),
        FOREIGN KEY (mascota_id) REFERENCES mascotas(id),
        FOREIGN KEY (veterinario_id) REFERENCES veterinarios(id)
      )`);

      db.run(`INSERT INTO turnos_new (id, dni_vecino, mascota_id, puesto, dia, hora, estado)
              SELECT id, dni_vecino, mascota_id, puesto, dia, hora, estado FROM turnos`, (err) => {
        if (err) console.error('Error al copiar datos:', err.message);
        db.run(`DROP TABLE turnos`, (err) => {
          if (err) console.error('Error al eliminar tabla antigua:', err.message);
          db.run(`ALTER TABLE turnos_new RENAME TO turnos`, (err) => {
            if (err) console.error('Error al renombrar tabla:', err.message);
            console.log('Migración completada.');
          });
        });
      });
    } else {
      db.run(`CREATE TABLE IF NOT EXISTS turnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dni_vecino TEXT,
        mascota_id INTEGER,
        puesto TEXT,
        dia TEXT,
        hora TEXT,
        estado TEXT,
        veterinario_id INTEGER,
        FOREIGN KEY (dni_vecino) REFERENCES vecinos(dni),
        FOREIGN KEY (mascota_id) REFERENCES mascotas(id),
        FOREIGN KEY (veterinario_id) REFERENCES veterinarios(id)
      )`);
    }
  });

  // Precarga de datos
  db.get(`SELECT COUNT(*) as count FROM puestos`, (err, row) => {
    if (row.count === 0) {
      const puestos = [
        ['Sede Central', 'Av. Central 123'], ['Hospital de Boulogne', 'Boulogne'], ['Subdelegacion Beccar', 'Beccar'],
        ['Plaza 9 de Julio', 'San Isidro'], ['Sede CAVA 1', 'San Isidro'], ['Plaza Stella Maris', 'San Isidro'],
        ['CAPS Barrio Obrero', 'Barrio Obrero'], ['Delegacion de Beccar', 'Beccar'], ['Delegacion de Boulogne', 'Boulogne'],
        ['Delegacion Bajo Boulogne', 'Bajo Boulogne'], ['Subdelegacion Martinez (Centro 35)', 'Martinez'],
        ['Plaza Brown', 'San Isidro'], ['Merendero Municipal Barrio San Cayetano', 'San Cayetano'],
        ['Sede CAVA 2', 'San Isidro'], ['Delegacion Las Lomas', 'Las Lomas'], ['Barrio San Isidro (BASI)', 'San Isidro'],
        ['Polideportivo Bajo Boulogne', 'Bajo Boulogne'], ['Delegacion La Horqueta', 'La Horqueta'],
        ['Plaza Belgrano', 'San Isidro'], ['Paseo de los Inmigrantes', 'San Isidro'], ['Barrio 20 de Junio', 'San Isidro'],
        ['Barrio Jardín (Iglesia San Benito)', 'San Isidro'], ['CAPS Bajo San Isidro', 'Bajo San Isidro'],
        ['Barrio Angelita', 'San Isidro'], ['Barrio Granaderos', 'San Isidro'], ['Barrio Los Sauces', 'San Isidro'],
        ['Barrio Uruguay y Beccar', 'Beccar'], ['Barrio los Perales', 'San Isidro'], ['Barrio Obrero', 'Barrio Obrero'],
        ['Barrio Estación', 'San Isidro'], ['Barrio Santa Rita', 'San Isidro'], ['Barrio Santa Ana', 'San Isidro'],
        ['Barrio El Congo', 'San Isidro']
      ];
      puestos.forEach(([nombre, direccion]) => {
        db.run(`INSERT INTO puestos (nombre, direccion) VALUES (?, ?)`, [nombre, direccion]);
      });
    }
  });

  db.get(`SELECT COUNT(*) as count FROM veterinarios`, (err, row) => {
    if (row.count === 0) {
      const veterinarios = [
        ['Dr. Juan Pérez', 'MP1234'],
        ['Dra. María Gómez', 'MP5678'],
        ['Dr. Carlos López', 'MP9012']
      ];
      veterinarios.forEach(([nombre, matricula]) => {
        db.run(`INSERT INTO veterinarios (nombre, matricula) VALUES (?, ?)`, [nombre, matricula]);
      });
    }
  });

  db.get(`SELECT COUNT(*) as count FROM horarios`, (err, row) => {
    if (row.count === 0) {
      db.run(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (1, '2025-03-25', '10:00')`);
      db.run(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (1, '2025-03-25', '11:00')`);
      db.run(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (2, '2025-03-26', '14:00')`);
      db.run(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (7, '2025-03-27', '15:00')`);
    }
  });
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.post('/api/vecinos', (req, res) => {
  const { dni, nombre, telefono, email, direccion, tarjeta_ciudadana } = req.body;
  db.get(`SELECT * FROM vecinos WHERE dni = ?`, [dni], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(200).json({ message: 'Usuario ya registrado', vecino: row });

    const sql = `INSERT INTO vecinos (dni, nombre, telefono, email, direccion, tarjeta_ciudadana) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [dni, nombre, telefono, email, direccion, tarjeta_ciudadana], function (err) {
      if (err) return res.status(400).json({ error: 'Error al registrar vecino' });
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Registro Exitoso - Zoonosis San Isidro',
        text: `Hola ${nombre}, tu registro fue exitoso. DNI: ${dni}`
      };
      transporter.sendMail(mailOptions, (error) => {
        if (error) console.error(error);
      });
      res.status(201).json({ message: 'Vecino registrado' });
    });
  });
});

app.post('/api/mascotas', (req, res) => {
  const { dni_vecino, nombre, raza, edad, peso } = req.body;
  const sql = `INSERT INTO mascotas (dni_vecino, nombre, raza, edad, peso) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [dni_vecino, nombre, raza, edad, peso], function (err) {
    if (err) return res.status(400).json({ error: 'Error al registrar mascota' });
    res.json({ message: 'Mascota registrada', id: this.lastID });
  });
});

app.get('/api/mascotas/:dni', (req, res) => {
  const { dni } = req.params;
  db.all(`SELECT * FROM mascotas WHERE dni_vecino = ?`, [dni], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/puestos', (req, res) => {
  db.all(`SELECT * FROM puestos`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/veterinarios', (req, res) => {
  db.all(`SELECT * FROM veterinarios`, (err, rows) => {
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

app.get('/api/horarios', (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  db.all(`SELECT h.*, p.nombre as puesto FROM horarios h JOIN puestos p ON h.puesto_id = p.id`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/horarios', (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const { puesto_id, dia, hora } = req.body;
  db.run(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (?, ?, ?)`, [puesto_id, dia, hora], function (err) {
    if (err) return res.status(400).json({ error: 'Error al agregar horario' });
    res.json({ message: 'Horario agregado', id: this.lastID });
  });
});

app.put('/api/horarios/:id', (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const { id } = req.params;
  const { puesto_id, dia, hora } = req.body;
  db.run(`UPDATE horarios SET puesto_id = ?, dia = ?, hora = ? WHERE id = ?`, [puesto_id, dia, hora, id], function (err) {
    if (err) return res.status(400).json({ error: 'Error al editar horario' });
    res.json({ message: 'Horario actualizado' });
  });
});

app.delete('/api/horarios/:id', (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const { id } = req.params;
  db.run(`DELETE FROM horarios WHERE id = ?`, [id], function (err) {
    if (err) return res.status(400).json({ error: 'Error al eliminar horario' });
    res.json({ message: 'Horario eliminado' });
  });
});

app.post('/api/turnos', (req, res) => {
  const { dni_vecino, mascota_id, puesto, dia, hora, veterinario_id } = req.body;
  if (!dni_vecino || !mascota_id || !puesto || !dia || !hora || !veterinario_id) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  db.get(`SELECT * FROM horarios WHERE puesto_id = (SELECT id FROM puestos WHERE nombre = ?) AND dia = ? AND hora = ? AND disponible = 1`, 
    [puesto, dia, hora], (err, horario) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!horario) return res.status(400).json({ error: 'Horario no disponible' });

      const sql = `INSERT INTO turnos (dni_vecino, mascota_id, puesto, dia, hora, estado, veterinario_id) VALUES (?, ?, ?, ?, ?, 'Reservado', ?)`;
      db.run(sql, [dni_vecino, mascota_id, puesto, dia, hora, veterinario_id], function (err) {
        if (err) return res.status(400).json({ error: 'Error al reservar turno: ' + err.message });
        db.run(`UPDATE horarios SET disponible = 0 WHERE id = ?`, [horario.id]);
        res.json({ message: 'Turno reservado', id: this.lastID });
      });
    });
});

app.get('/api/turnos', (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  db.all(`SELECT t.*, v.nombre AS vecino_nombre, m.nombre AS mascota_nombre, vet.nombre AS veterinario_nombre 
          FROM turnos t 
          JOIN vecinos v ON t.dni_vecino = v.dni 
          JOIN mascotas m ON t.mascota_id = m.id 
          LEFT JOIN veterinarios vet ON t.veterinario_id = vet.id`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/turnos/vecino/:dni', (req, res) => {
  const { dni } = req.params;
  db.all(`SELECT t.*, v.nombre AS vecino_nombre, m.nombre AS mascota_nombre, vet.nombre AS veterinario_nombre 
          FROM turnos t 
          JOIN vecinos v ON t.dni_vecino = v.dni 
          JOIN mascotas m ON t.mascota_id = m.id 
          LEFT JOIN veterinarios vet ON t.veterinario_id = vet.id 
          WHERE t.dni_vecino = ?`, [dni], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/api/turnos/:id/cancelar', (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const { id } = req.params;
  db.get(`SELECT * FROM turnos WHERE id = ? AND estado = 'Reservado'`, [id], (err, turno) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!turno) return res.status(404).json({ error: 'Turno no encontrado o no reservado' });

    db.run(`UPDATE turnos SET estado = 'Cancelado' WHERE id = ?`, [id], function (err) {
      if (err) return res.status(400).json({ error: 'Error al cancelar turno' });
      db.run(`UPDATE horarios SET disponible = 1 WHERE puesto_id = (SELECT id FROM puestos WHERE nombre = ?) AND dia = ? AND hora = ?`, 
        [turno.puesto, turno.dia, turno.hora]);
      res.json({ message: 'Turno cancelado' });
    });
  });
});

app.put('/api/turnos/vecino/:id/cancelar', (req, res) => {
  const { id } = req.params;
  const { dni } = req.body;
  db.get(`SELECT * FROM turnos WHERE id = ? AND dni_vecino = ? AND estado = 'Reservado'`, [id, dni], (err, turno) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!turno) return res.status(404).json({ error: 'Turno no encontrado o no pertenece al vecino' });

    db.run(`UPDATE turnos SET estado = 'Cancelado' WHERE id = ?`, [id], function (err) {
      if (err) return res.status(400).json({ error: 'Error al cancelar turno' });
      db.run(`UPDATE horarios SET disponible = 1 WHERE puesto_id = (SELECT id FROM puestos WHERE nombre = ?) AND dia = ? AND hora = ?`, 
        [turno.puesto, turno.dia, turno.hora]);
      res.json({ message: 'Turno cancelado' });
    });
  });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;
  if (username === adminUser && password === adminPass) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Credenciales inválidas' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});