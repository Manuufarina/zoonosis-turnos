const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const db = new sqlite3.Database('./zoonosis.db', (err) => {
  if (err) console.error(err.message);
  console.log('Conectado a la base de datos SQLite');
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

  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='turnos'`, (err, table) => {
    if (err) {
      console.error('Error al verificar existencia de turnos:', err.message);
      return;
    }

    if (table) {
      db.all(`PRAGMA table_info(turnos)`, (err, columns) => {
        if (err) {
          console.error('Error al obtener info de turnos:', err.message);
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
          )`, (err) => {
            if (err) {
              console.error('Error al crear turnos_new:', err.message);
              return;
            }
            db.run(`INSERT INTO turnos_new (id, dni_vecino, mascota_id, puesto, dia, hora, estado)
                    SELECT id, dni_vecino, mascota_id, puesto, dia, hora, estado FROM turnos`, (err) => {
              if (err) {
                console.error('Error al copiar datos:', err.message);
                return;
              }
              db.run(`DROP TABLE turnos`, (err) => {
                if (err) {
                  console.error('Error al eliminar turnos:', err.message);
                  return;
                }
                db.run(`ALTER TABLE turnos_new RENAME TO turnos`, (err) => {
                  if (err) {
                    console.error('Error al renombrar turnos_new:', err.message);
                    return;
                  }
                  console.log('Migración completada.');
                });
              });
            });
          });
        }
      });
    } else {
      db.run(`CREATE TABLE turnos (
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
      )`, (err) => {
        if (err) console.error('Error al crear turnos:', err.message);
      });
    }
  });

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

app.post('/api/horarios/masivo', (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const { puesto_id, dia, hora_inicio, hora_fin, veterinario_id } = req.body;
  if (!puesto_id || !dia || !hora_inicio || !hora_fin || !veterinario_id) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  const inicio = new Date(`1970-01-01T${hora_inicio}:00`);
  const fin = new Date(`1970-01-01T${hora_fin}:00`);
  const horarios = [];
  let current = inicio;

  while (current <= fin) {
    const hora = current.toTimeString().slice(0, 5); // Formato HH:MM
    horarios.push(hora);
    current.setHours(current.getHours() + 1); // Intervalo de 1 hora
  }

  let insertedCount = 0;
  horarios.forEach((hora) => {
    db.get(`SELECT * FROM turnos WHERE veterinario_id = ? AND dia = ? AND hora = ? AND estado = 'Reservado'`, 
      [veterinario_id, dia, hora], (err, turno) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!turno) {
          db.run(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (?, ?, ?)`, [puesto_id, dia, hora], function (err) {
            if (err) console.error('Error al insertar horario:', err.message);
            else insertedCount++;
            if (insertedCount === horarios.length) {
              res.json({ message: `${insertedCount} horarios agregados exitosamente` });
            }
          });
        }
      });
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

  db.get(`SELECT * FROM turnos WHERE veterinario_id = ? AND dia = ? AND hora = ? AND estado = 'Reservado'`, 
    [veterinario_id, dia, hora], (err, existingTurno) => {
      if (err) return res.status(500).json({ error: err.message });
      if (existingTurno) {
        return res.status(400).json({ error: 'El veterinario ya tiene un turno asignado en este día y horario' });
      }

      db.get(`SELECT * FROM horarios WHERE puesto_id = (SELECT id FROM puestos WHERE nombre = ?) AND dia = ? AND hora = ? AND disponible = 1`, 
        [puesto, dia, hora], (err, horario) => {
          if (err) return res.status(500).json({ error: err.message });
          if (!horario) return res.status(400).json({ error: 'Horario no disponible' });

          const sql = `INSERT INTO turnos (dni_vecino, mascota_id, puesto, dia, hora, estado, veterinario_id) VALUES (?, ?, ?, ?, ?, 'Reservado', ?)`;
          db.run(sql, [dni_vecino, mascota_id, puesto, dia, hora, veterinario_id], function (err) {
            if (err) return res.status(400).json({ error: 'Error al reservar turno: ' + err.message });

            db.run(`UPDATE horarios SET disponible = 0 WHERE id = ?`, [horario.id], (err) => {
              if (err) console.error('Error al actualizar horario:', err.message);
            });

            db.get(`SELECT nombre, email FROM vecinos WHERE dni = ?`, [dni_vecino], (err, vecino) => {
              if (err) {
                console.error('Error al obtener vecino:', err.message);
                return res.status(500).json({ error: 'Error al procesar el turno' });
              }
              if (!vecino || !vecino.email) {
                console.error('No se encontró email para el vecino con DNI:', dni_vecino);
                return res.json({ message: 'Turno reservado, pero no se pudo enviar el email', id: this.lastID });
              }

              db.get(`SELECT nombre FROM mascotas WHERE id = ?`, [mascota_id], (err, mascota) => {
                if (err) {
                  console.error('Error al obtener mascota:', err.message);
                  return res.status(500).json({ error: 'Error al procesar el turno' });
                }

                const mailOptions = {
                  from: process.env.EMAIL_USER,
                  to: vecino.email,
                  subject: 'Confirmación de Turno - Zoonosis San Isidro',
                  html: `
                    <div style="text-align: center;">
                      <img src="https://www.sanisidro.gob.ar/sites/default/files/Logo%20San%20Isidro%202017.png" alt="Logo Municipio San Isidro" style="width: 200px;">
                      <p>Estimado Vecino ${vecino.nombre || ''} DNI ${dni_vecino},</p>
                      <p>Le confirmamos su turno para castración de su mascota ${mascota?.nombre || ''} para el día ${dia} a las ${hora} en el puesto ${puesto}.</p>
                      <p>Le pedimos que, de no poder asistir, ingrese al sistema y cancele su turno para habilitárselo a otro vecino.</p>
                      <p>Desde ya, muchas gracias.</p>
                      <p><strong>Zoonosis San Isidro</strong></p>
                    </div>
                  `
                };
                transporter.sendMail(mailOptions, (error) => {
                  if (error) console.error('Error al enviar email:', error);
                });
                res.json({ message: 'Turno reservado', id: this.lastID });
              });
            });
          });
        });
    });
});

app.get('/api/turnos/pdf/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`Solicitud para generar PDF del turno con ID: ${id}`);
  
    db.get(`SELECT t.*, v.nombre AS vecino_nombre, v.dni AS vecino_dni, v.telefono AS vecino_telefono, v.email AS vecino_email, v.direccion AS vecino_direccion, 
                   m.nombre AS mascota_nombre, m.raza AS mascota_raza, m.edad AS mascota_edad, m.peso AS mascota_peso, 
                   vet.nombre AS veterinario_nombre 
            FROM turnos t 
            JOIN vecinos v ON t.dni_vecino = v.dni 
            JOIN mascotas m ON t.mascota_id = m.id 
            LEFT JOIN veterinarios vet ON t.veterinario_id = vet.id 
            WHERE t.id = ?`, [id], async (err, turno) => {
      if (err) {
        console.error('Error al buscar turno:', err.message);
        return res.status(500).json({ error: err.message });
      }
      if (!turno) {
        console.log(`Turno con ID ${id} no encontrado`);
        return res.status(404).json({ error: 'Turno no encontrado' });
      }
  
      console.log('Turno encontrado:', turno);
  
      // Crear el documento PDF
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=turno_${id}.pdf`);
      doc.pipe(res);
  
      // Descargar el logo
      const logoUrl = 'https://www.sanisidro.gob.ar/sites/default/files/Logo%20San%20Isidro%202017.png';
      try {
        const response = await fetch(logoUrl);
        if (!response.ok) throw new Error('Error al descargar el logo');
        const logoBuffer = await response.buffer();
        doc.image(logoBuffer, 50, 30, { width: 200 });
      } catch (error) {
        console.error('Error al descargar el logo:', error.message);
        doc.text('No se pudo cargar el logo.', 50, 30);
      }
  
      // Título
      doc.moveDown(8);
      doc.fontSize(20).text('Reserva de turno de castración', { align: 'center' });
  
      // Datos del turno
      doc.moveDown(2);
      doc.fontSize(14).text('Datos del Turno', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`ID del Turno: ${turno.id}`);
      doc.text(`Puesto: ${turno.puesto}`);
      doc.text(`Día: ${turno.dia}`);
      doc.text(`Hora: ${turno.hora}`);
      doc.text(`Veterinario: ${turno.veterinario_nombre || 'No asignado'}`);
      doc.text(`Estado: ${turno.estado}`);
  
      // Datos del vecino
      doc.moveDown(1);
      doc.fontSize(14).text('Datos del Vecino', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Nombre: ${turno.vecino_nombre}`);
      doc.text(`DNI: ${turno.vecino_dni}`);
      doc.text(`Teléfono: ${turno.vecino_telefono}`);
      doc.text(`Email: ${turno.vecino_email}`);
      doc.text(`Dirección: ${turno.vecino_direccion}`);
  
      // Datos de la mascota
      doc.moveDown(1);
      doc.fontSize(14).text('Datos de la Mascota', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Nombre: ${turno.mascota_nombre}`);
      doc.text(`Raza: ${turno.mascota_raza}`);
      doc.text(`Edad: ${turno.mascota_edad}`);
      doc.text(`Peso: ${turno.mascota_peso} kg`);
  
      // Finalizar el PDF
      doc.end();
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

app.put('/api/turnos/vecino/:id/cancelar', (req, res) => {
    const { id } = req.params;
    const { dni } = req.body;
    console.log(`Solicitud para cancelar turno con ID ${id} por vecino con DNI ${dni}`);
  
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