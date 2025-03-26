const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fetch = require('node-fetch');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use('/public', express.static('public'));

// Verificar que las variables de entorno críticas estén definidas al iniciar el servidor
if (!process.env.JWT_SECRET) {
  console.error('Error: JWT_SECRET no está definido en las variables de entorno');
  process.exit(1);
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

pool.connect((err) => {
  if (err) {
    console.error('Error al conectar a PostgreSQL:', err.message);
    process.exit(1);
  }
  console.log('Conectado a la base de datos PostgreSQL');
});

const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vecinos (
        dni TEXT PRIMARY KEY,
        nombre TEXT,
        telefono TEXT,
        email TEXT,
        direccion TEXT,
        tarjeta_ciudadana TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mascotas (
        id SERIAL PRIMARY KEY,
        dni_vecino TEXT,
        nombre TEXT,
        raza TEXT,
        edad TEXT,
        peso REAL,
        FOREIGN KEY (dni_vecino) REFERENCES vecinos(dni)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS puestos (
        id SERIAL PRIMARY KEY,
        nombre TEXT,
        direccion TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS veterinarios (
        id SERIAL PRIMARY KEY,
        nombre TEXT,
        matricula TEXT UNIQUE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS horarios (
        id SERIAL PRIMARY KEY,
        puesto_id INTEGER,
        dia TEXT,
        hora TEXT,
        disponible INTEGER DEFAULT 1,
        FOREIGN KEY (puesto_id) REFERENCES puestos(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS turnos (
        id SERIAL PRIMARY KEY,
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
      )
    `);

    const puestosCount = await pool.query(`SELECT COUNT(*) FROM puestos`);
    if (puestosCount.rows[0].count == 0) {
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
      for (const [nombre, direccion] of puestos) {
        await pool.query(`INSERT INTO puestos (nombre, direccion) VALUES ($1, $2)`, [nombre, direccion]);
      }
    }

    const veterinariosCount = await pool.query(`SELECT COUNT(*) FROM veterinarios`);
    if (veterinariosCount.rows[0].count == 0) {
      const veterinarios = [
        ['Dr. Juan Pérez', 'MP1234'],
        ['Dra. María Gómez', 'MP5678'],
        ['Dr. Carlos López', 'MP9012']
      ];
      for (const [nombre, matricula] of veterinarios) {
        await pool.query(`INSERT INTO veterinarios (nombre, matricula) VALUES ($1, $2)`, [nombre, matricula]);
      }
    }

    const horariosCount = await pool.query(`SELECT COUNT(*) FROM horarios`);
    if (horariosCount.rows[0].count == 0) {
      await pool.query(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (1, '2025-03-25', '10:00')`);
      await pool.query(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (1, '2025-03-25', '11:00')`);
      await pool.query(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (2, '2025-03-26', '14:00')`);
      await pool.query(`INSERT INTO horarios (puesto_id, dia, hora) VALUES (7, '2025-03-27', '15:00')`);
    }
  } catch (err) {
    console.error('Error al crear tablas:', err.message);
  }
};

createTables();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const enviarRecordatorios = () => {
  const ahora = new Date();
  const manana = new Date(ahora);
  manana.setDate(ahora.getDate() + 1);
  const diaManana = manana.toISOString().split('T')[0];

  pool.query(
    `SELECT t.*, v.nombre AS vecino_nombre, v.email AS vecino_email, m.nombre AS mascota_nombre, vet.nombre AS veterinario_nombre 
     FROM turnos t 
     JOIN vecinos v ON t.dni_vecino = v.dni 
     JOIN mascotas m ON t.mascota_id = m.id 
     LEFT JOIN veterinarios vet ON t.veterinario_id = vet.id 
     WHERE t.dia = $1 AND t.estado = 'Reservado'`,
    [diaManana],
    (err, result) => {
      if (err) {
        console.error('Error al buscar turnos para recordatorios:', err.message);
        return;
      }

      const turnos = result.rows;
      turnos.forEach(turno => {
        const cancelLink = `https://zoonosis-frontend.vercel.app/cancelar-turno/${turno.id}/${turno.dni_vecino}`;
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: turno.vecino_email,
          subject: 'Recordatorio de Turno - Zoonosis San Isidro',
          html: `
            <div style="text-align: center; font-family: Arial, sans-serif; color: #333;">
              <img src="https://citymis.co/custom/sanisidro/_images/slide-logo.png" alt="Logo Municipio San Isidro" style="width: 200px;">
              <h2>Recordatorio de Turno</h2>
              <p>Estimado Vecino ${turno.vecino_nombre} DNI ${turno.dni_vecino},</p>
              <p>Le recordamos su turno para castración de su mascota ${turno.mascota_nombre} mañana ${turno.dia} a las ${turno.hora} en el puesto ${turno.puesto}.</p>
              <p>Si no puede asistir, por favor cancele su turno haciendo clic <a href="${cancelLink}">aquí</a>.</p>
              <p>Desde ya, muchas gracias.</p>
              <p><strong>Zoonosis San Isidro</strong></p>
              <hr style="border: 1px solid #2E7D32; width: 80%; margin: 20px auto;">
              <h3>Registro para Castración de Mascotas 2025</h3>
              <p>La Castración de Mascotas es un servicio gratuito del Municipio a los vecinos de San Isidro, en pos de cuidar la salud de sus mascotas y mejorar sus posibilidades de convivencia.</p>
              <p><strong>Podrás reservar turno para la castración de Mascotas a partir del 24 de cada mes.</strong></p>
              <h4>Condiciones para poder castrar a su mascota:</h4>
              <ul style="text-align: left; margin: 0 auto; width: 80%;">
                <li>Los felinos se castran desde los 6 meses hasta los 7 años de edad.</li>
                <li>Los caninos se castran desde los 6 meses hasta los 6 años de edad.</li>
                <li><strong>Razas que NO se castran en el servicio de Zoonosis:</strong> Boxer, Buldog, Shit Tzu, Chow Chow, Yorkshire, Pug, Chihuahua, Pekinés y sus cruzas, Bichon Maltés, Boston Terrier, Sharpei.</li>
                <li>No se castran todos los caninos que pesen menos de 3 kilos o más de 45 kilos.</li>
              </ul>
              <h4>El día de la castración debe concurrir con:</h4>
              <ul style="text-align: left; margin: 0 auto; width: 80%;">
                <li>Trozo de sábana vieja (o similar) bien lavada y planchada de 60 por 60 cm aprox. La que reemplaza el campo utilizado en la operación.</li>
                <li>Frazada (la salida de la anestesia provoca mucho frío).</li>
              </ul>
              <h4>El animal deberá guardar antes de ser operado:</h4>
              <ul style="text-align: left; margin: 0 auto; width: 80%;">
                <li>12 horas de ayuno sólido y 6 horas de ayuno líquido.</li>
                <li>NO suministrarle ningún medicamento antes de la cirugía.</li>
              </ul>
              <h4>Evite riesgos, cumpla con estas indicaciones estrictamente:</h4>
              <ul style="text-align: left; margin: 0 auto; width: 80%;">
                <li>Los caninos deberán concurrir con correa, collar y si es agresivo con bozal.</li>
                <li>Los felinos deberán ser transportados en canastos debidamente cerrados “JAMÁS SUELTOS”.</li>
                <li>Si su animal tuvo cría recientemente, deberán transcurrir un mínimo de 60 días para poder ser operada.</li>
                <li>Se requiere que el animal se encuentre clínicamente sano y en buen estado de higiene.</li>
                <li>Las hembras caninas presentan dos celos por año, uno cada seis meses, el momento adecuado para esterilizarlo es durante el prolongado periodo en que no están en celo.</li>
              </ul>
              <p>En todos los casos el vecino debe:</p>
              <ul style="text-align: left; margin: 0 auto; width: 80%;">
                <li>Tener Documento Nacional de Identidad (DNI) con domicilio en el partido de San Isidro.</li>
                <li>Poseer la Tarjeta Ciudadana SI y que la misma esté ACTIVA. (Encontrará la información en la web <a href="http://www.sanisidro.gob.ar">www.sanisidro.gob.ar</a>)</li>
                <li>Asistir el ciudadano que se registró con la mascota.</li>
              </ul>
              <p>En caso de no poseer Tarjeta Ciudadana o tenerla desactivada podrá solucionar su problema de alguna de las siguientes formas:</p>
              <ul style="text-align: left; margin: 0 auto; width: 80%;">
                <li>Ingresando a: <a href="http://www.tarjetasanisidro.gob.ar">http://www.tarjetasanisidro.gob.ar</a> (para el caso de sacar una tarjeta nueva o encontrarse vencida).</li>
                <li>Llamando a 4512-3567 de 8:30 a 14 hs. de Lunes a Viernes.</li>
                <li>Enviando mail a <a href="mailto:ciudadano@sanisidro.gob.ar">ciudadano@sanisidro.gob.ar</a>.</li>
              </ul>
              <h4>Los pasos a seguir para inscribirse son:</h4>
              <ol style="text-align: left; margin: 0 auto; width: 80%;">
                <li>“Reserve la vacante” colocando sus datos personales.</li>
                <li>Cargue y Seleccione su mascota (Gato o Perro).</li>
                <li>Tenga en cuenta seleccionar turno en el CENTRO más cercano a su domicilio, para ello recorra la lista completa y elija la mejor opción.</li>
                <li>Recibirá un mail de confirmación y un PDF con los datos de su turno.</li>
                <li>Presentarse personalmente en el CENTRO seleccionado y a la hora elegida a fin de ser atendido.</li>
              </ol>
              <p><strong>IMPORTANTE: ANTE CUALQUIER DUDA LLAMAR DE LUNES A VIERNES DE 8 A 14 AL 4512-3151/3495</strong></p>
            </div>
          `
        };
        transporter.sendMail(mailOptions, (error) => {
          if (error) {
            console.error(`Error al enviar recordatorio para turno ${turno.id}:`, error);
          } else {
            console.log(`Recordatorio enviado para turno ${turno.id} a ${turno.vecino_email}`);
          }
        });
      });
    }
  );
};

cron.schedule('0 8 * * *', () => {
  console.log('Ejecutando tarea de recordatorios...');
  enviarRecordatorios();
});

app.post('/api/vecinos', async (req, res) => {
  const { dni, nombre, telefono, email, direccion, tarjeta_ciudadana } = req.body;
  try {
    const result = await pool.query(`SELECT * FROM vecinos WHERE dni = $1`, [dni]);
    if (result.rows.length > 0) {
      return res.status(200).json({ message: 'Usuario ya registrado', vecino: result.rows[0] });
    }

    await pool.query(
      `INSERT INTO vecinos (dni, nombre, telefono, email, direccion, tarjeta_ciudadana) VALUES ($1, $2, $3, $4, $5, $6)`,
      [dni, nombre, telefono, email, direccion, tarjeta_ciudadana]
    );
    res.status(201).json({ message: 'Vecino registrado' });
  } catch (err) {
    res.status(400).json({ error: 'Error al registrar vecino: ' + err.message });
  }
});

app.post('/api/mascotas', async (req, res) => {
  const { dni_vecino, nombre, raza, edad, peso } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO mascotas (dni_vecino, nombre, raza, edad, peso) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [dni_vecino, nombre, raza, edad, peso]
    );
    res.json({ message: 'Mascota registrada', id: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: 'Error al registrar mascota: ' + err.message });
  }
});

app.get('/api/mascotas/:dni', async (req, res) => {
  const { dni } = req.params;
  try {
    const result = await pool.query(`SELECT * FROM mascotas WHERE dni_vecino = $1`, [dni]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mascotas: ' + err.message });
  }
});

app.get('/api/puestos', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM puestos`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener puestos: ' + err.message });
  }
});

app.get('/api/veterinarios', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM veterinarios`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener veterinarios: ' + err.message });
  }
});

app.get('/api/horarios/:puesto_id', async (req, res) => {
  const { puesto_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM horarios WHERE puesto_id = $1 AND disponible = 1`,
      [puesto_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener horarios: ' + err.message });
  }
});

app.get('/api/horarios', async (req, res) => {
  const token = req.headers.authorization;
  console.log('Solicitud recibida para /api/horarios');
  console.log('Token recibido:', token);
  if (!token) {
    console.log('Error: Token no proporcionado');
    return res.status(403).json({ error: 'Acceso denegado: Token no proporcionado' });
  }

  if (!process.env.JWT_SECRET) {
    console.error('Error: JWT_SECRET no está definido en las variables de entorno');
    return res.status(500).json({ error: 'Error interno del servidor: JWT_SECRET no configurado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decodificado:', decoded);
    if (decoded.role !== 'admin') {
      console.log('Error: Rol no autorizado');
      return res.status(403).json({ error: 'Acceso denegado: Rol no autorizado' });
    }
  } catch (err) {
    console.error('Error al verificar el token:', err.message);
    return res.status(403).json({ error: 'Acceso denegado: Token inválido' });
  }

  try {
    const result = await pool.query(
      `SELECT h.*, p.nombre as puesto FROM horarios h JOIN puestos p ON h.puesto_id = p.id`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener horarios: ' + err.message });
  }
});

app.post('/api/horarios', async (req, res) => {
  const token = req.headers.authorization;
  console.log('Solicitud recibida para /api/horarios (POST)');
  console.log('Token recibido:', token);
  if (!token) {
    console.log('Error: Token no proporcionado');
    return res.status(403).json({ error: 'Acceso denegado: Token no proporcionado' });
  }

  if (!process.env.JWT_SECRET) {
    console.error('Error: JWT_SECRET no está definido en las variables de entorno');
    return res.status(500).json({ error: 'Error interno del servidor: JWT_SECRET no configurado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decodificado:', decoded);
    if (decoded.role !== 'admin') {
      console.log('Error: Rol no autorizado');
      return res.status(403).json({ error: 'Acceso denegado: Rol no autorizado' });
    }
  } catch (err) {
    console.error('Error al verificar el token:', err.message);
    return res.status(403).json({ error: 'Acceso denegado: Token inválido' });
  }

  const { puesto_id, dia, hora } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO horarios (puesto_id, dia, hora) VALUES ($1, $2, $3) RETURNING id`,
      [puesto_id, dia, hora]
    );
    res.json({ message: 'Horario agregado', id: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: 'Error al agregar horario: ' + err.message });
  }
});

app.post('/api/horarios/masivo', async (req, res) => {
  const token = req.headers.authorization;
  console.log('Solicitud recibida para /api/horarios/masivo');
  console.log('Token recibido:', token);
  if (!token) {
    console.log('Error: Token no proporcionado');
    return res.status(403).json({ error: 'Acceso denegado: Token no proporcionado' });
  }

  if (!process.env.JWT_SECRET) {
    console.error('Error: JWT_SECRET no está definido en las variables de entorno');
    return res.status(500).json({ error: 'Error interno del servidor: JWT_SECRET no configurado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decodificado:', decoded);
    if (decoded.role !== 'admin') {
      console.log('Error: Rol no autorizado');
      return res.status(403).json({ error: 'Acceso denegado: Rol no autorizado' });
    }
  } catch (err) {
    console.error('Error al verificar el token:', err.message);
    return res.status(403).json({ error: 'Acceso denegado: Token inválido' });
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
    const hora = current.toTimeString().slice(0, 5);
    horarios.push(hora);
    current.setHours(current.getHours() + 1);
  }

  let insertedCount = 0;
  for (const hora of horarios) {
    const turnoResult = await pool.query(
      `SELECT * FROM turnos WHERE veterinario_id = $1 AND dia = $2 AND hora = $3 AND estado = 'Reservado'`,
      [veterinario_id, dia, hora]
    );
    if (turnoResult.rows.length === 0) {
      await pool.query(
        `INSERT INTO horarios (puesto_id, dia, hora) VALUES ($1, $2, $3)`,
        [puesto_id, dia, hora]
      );
      insertedCount++;
    }
  }
  res.json({ message: `${insertedCount} horarios agregados exitosamente` });
});

app.put('/api/horarios/:id', async (req, res) => {
  const token = req.headers.authorization;
  console.log('Solicitud recibida para /api/horarios/:id (PUT)');
  console.log('Token recibido:', token);
  if (!token) {
    console.log('Error: Token no proporcionado');
    return res.status(403).json({ error: 'Acceso denegado: Token no proporcionado' });
  }

  if (!process.env.JWT_SECRET) {
    console.error('Error: JWT_SECRET no está definido en las variables de entorno');
    return res.status(500).json({ error: 'Error interno del servidor: JWT_SECRET no configurado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decodificado:', decoded);
    if (decoded.role !== 'admin') {
      console.log('Error: Rol no autorizado');
      return res.status(403).json({ error: 'Acceso denegado: Rol no autorizado' });
    }
  } catch (err) {
    console.error('Error al verificar el token:', err.message);
    return res.status(403).json({ error: 'Acceso denegado: Token inválido' });
  }

  const { id } = req.params;
  const { puesto_id, dia, hora } = req.body;
  try {
    await pool.query(
      `UPDATE horarios SET puesto_id = $1, dia = $2, hora = $3 WHERE id = $4`,
      [puesto_id, dia, hora, id]
    );
    res.json({ message: 'Horario actualizado' });
  } catch (err) {
    res.status(400).json({ error: 'Error al editar horario: ' + err.message });
  }
});

app.delete('/api/horarios/:id', async (req, res) => {
  const token = req.headers.authorization;
  console.log('Solicitud recibida para /api/horarios/:id (DELETE)');
  console.log('Token recibido:', token);
  if (!token) {
    console.log('Error: Token no proporcionado');
    return res.status(403).json({ error: 'Acceso denegado: Token no proporcionado' });
  }

  if (!process.env.JWT_SECRET) {
    console.error('Error: JWT_SECRET no está definido en las variables de entorno');
    return res.status(500).json({ error: 'Error interno del servidor: JWT_SECRET no configurado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decodificado:', decoded);
    if (decoded.role !== 'admin') {
      console.log('Error: Rol no autorizado');
      return res.status(403).json({ error: 'Acceso denegado: Rol no autorizado' });
    }
  } catch (err) {
    console.error('Error al verificar el token:', err.message);
    return res.status(403).json({ error: 'Acceso denegado: Token inválido' });
  }

  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM horarios WHERE id = $1`, [id]);
    res.json({ message: 'Horario eliminado' });
  } catch (err) {
    res.status(400).json({ error: 'Error al eliminar horario: ' + err.message });
  }
});

app.post('/api/turnos', async (req, res) => {
  const { dni_vecino, mascota_id, puesto, dia, hora, veterinario_id } = req.body;
  if (!dni_vecino || !mascota_id || !puesto || !dia || !hora || !veterinario_id) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const existingTurno = await pool.query(
      `SELECT * FROM turnos WHERE veterinario_id = $1 AND dia = $2 AND hora = $3 AND estado = 'Reservado'`,
      [veterinario_id, dia, hora]
    );
    if (existingTurno.rows.length > 0) {
      return res.status(400).json({ error: 'El veterinario ya tiene un turno asignado en este día y horario' });
    }

    const horario = await pool.query(
      `SELECT * FROM horarios WHERE puesto_id = (SELECT id FROM puestos WHERE nombre = $1) AND dia = $2 AND hora = $3 AND disponible = 1`,
      [puesto, dia, hora]
    );
    if (horario.rows.length === 0) {
      return res.status(400).json({ error: 'Horario no disponible' });
    }

    const result = await pool.query(
      `INSERT INTO turnos (dni_vecino, mascota_id, puesto, dia, hora, estado, veterinario_id) VALUES ($1, $2, $3, $4, $5, 'Reservado', $6) RETURNING id`,
      [dni_vecino, mascota_id, puesto, dia, hora, veterinario_id]
    );

    await pool.query(
      `UPDATE horarios SET disponible = 0 WHERE id = $1`,
      [horario.rows[0].id]
    );

    const vecino = await pool.query(`SELECT nombre, email FROM vecinos WHERE dni = $1`, [dni_vecino]);
    if (vecino.rows.length === 0 || !vecino.rows[0].email) {
      return res.json({ message: 'Turno reservado, pero no se pudo enviar el email', id: result.rows[0].id });
    }

    const mascota = await pool.query(`SELECT nombre FROM mascotas WHERE id = $1`, [mascota_id]);
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: vecino.rows[0].email,
      subject: 'Confirmación de Turno - Zoonosis San Isidro',
      html: `
        <div style="text-align: center; font-family: Arial, sans-serif; color: #333;">
          <img src="https://citymis.co/custom/sanisidro/_images/slide-logo.png" alt="Logo Municipio San Isidro" style="width: 200px;">
          <h2>Confirmación de Turno</h2>
          <p>Estimado Vecino ${vecino.rows[0].nombre || ''} DNI ${dni_vecino},</p>
          <p>Le confirmamos su turno para castración de su mascota ${mascota.rows[0]?.nombre || ''} para el día ${dia} a las ${hora} en el puesto ${puesto}.</p>
          <p>Le pedimos que, de no poder asistir, ingrese al sistema y cancele su turno para habilitárselo a otro vecino.</p>
          <p>Desde ya, muchas gracias.</p>
          <p><strong>Zoonosis San Isidro</strong></p>
          <hr style="border: 1px solid #2E7D32; width: 80%; margin: 20px auto;">
          <h3>Registro para Castración de Mascotas 2025</h3>
          <p>La Castración de Mascotas es un servicio gratuito del Municipio a los vecinos de San Isidro, en pos de cuidar la salud de sus mascotas y mejorar sus posibilidades de convivencia.</p>
          <p><strong>Podrás reservar turno para la castración de Mascotas a partir del 24 de cada mes.</strong></p>
          <h4>Condiciones para poder castrar a su mascota:</h4>
          <ul style="text-align: left; margin: 0 auto; width: 80%;">
            <li>Los felinos se castran desde los 6 meses hasta los 7 años de edad.</li>
            <li>Los caninos se castran desde los 6 meses hasta los 6 años de edad.</li>
            <li><strong>Razas que NO se castran en el servicio de Zoonosis:</strong> Boxer, Buldog, Shit Tzu, Chow Chow, Yorkshire, Pug, Chihuahua, Pekinés y sus cruzas, Bichon Maltés, Boston Terrier, Sharpei.</li>
            <li>No se castran todos los caninos que pesen menos de 3 kilos o más de 45 kilos.</li>
          </ul>
          <h4>El día de la castración debe concurrir con:</h4>
          <ul style="text-align: left; margin: 0 auto; width: 80%;">
            <li>Trozo de sábana vieja (o similar) bien lavada y planchada de 60 por 60 cm aprox. La que reemplaza el campo utilizado en la operación.</li>
            <li>Frazada (la salida de la anestesia provoca mucho frío).</li>
          </ul>
          <h4>El animal deberá guardar antes de ser operado:</h4>
          <ul style="text-align: left; margin: 0 auto; width: 80%;">
            <li>12 horas de ayuno sólido y 6 horas de ayuno líquido.</li>
            <li>NO suministrarle ningún medicamento antes de la cirugía.</li>
          </ul>
          <h4>Evite riesgos, cumpla con estas indicaciones estrictamente:</h4>
          <ul style="text-align: left; margin: 0 auto; width: 80%;">
            <li>Los caninos deberán concurrir con correa, collar y si es agresivo con bozal.</li>
            <li>Los felinos deberán ser transportados en canastos debidamente cerrados “JAMÁS SUELTOS”.</li>
            <li>Si su animal tuvo cría recientemente, deberán transcurrir un mínimo de 60 días para poder ser operada.</li>
            <li>Se requiere que el animal se encuentre clínicamente sano y en buen estado de higiene.</li>
            <li>Las hembras caninas presentan dos celos por año, uno cada seis meses, el momento adecuado para esterilizarlo es durante el prolongado periodo en que no están en celo.</li>
          </ul>
          <p>En todos los casos el vecino debe:</p>
          <ul style="text-align: left; margin: 0 auto; width: 80%;">
            <li>Tener Documento Nacional de Identidad (DNI) con domicilio en el partido de San Isidro.</li>
            <li>Poseer la Tarjeta Ciudadana SI y que la misma esté ACTIVA. (Encontrará la información en la web <a href="http://www.sanisidro.gob.ar">www.sanisidro.gob.ar</a>)</li>
            <li>Asistir el ciudadano que se registró con la mascota.</li>
          </ul>
          <p>En caso de no poseer Tarjeta Ciudadana o tenerla desactivada podrá solucionar su problema de alguna de las siguientes formas:</p>
          <ul style="text-align: left; margin: 0 auto; width: 80%;">
            <li>Ingresando a: <a href="http://www.tarjetasanisidro.gob.ar">http://www.tarjetasanisidro.gob.ar</a> (para el caso de sacar una tarjeta nueva o encontrarse vencida).</li>
            <li>Llamando a 4512-3567 de 8:30 a 14 hs. de Lunes a Viernes.</li>
            <li>Enviando mail a <a href="mailto:ciudadano@sanisidro.gob.ar">ciudadano@sanisidro.gob.ar</a>.</li>
          </ul>
          <h4>Los pasos a seguir para inscribirse son:</h4>
          <ol style="text-align: left; margin: 0 auto; width: 80%;">
            <li>“Reserve la vacante” colocando sus datos personales.</li>
            <li>Cargue y Seleccione su mascota (Gato o Perro).</li>
            <li>Tenga en cuenta seleccionar turno en el CENTRO más cercano a su domicilio, para ello recorra la lista completa y elija la mejor opción.</li>
            <li>Recibirá un mail de confirmación y un PDF con los datos de su turno.</li>
            <li>Presentarse personalmente en el CENTRO seleccionado y a la hora elegida a fin de ser atendido.</li>
          </ol>
          <p><strong>IMPORTANTE: ANTE CUALQUIER DUDA LLAMAR DE LUNES A VIERNES DE 8 A 14 AL 4512-3151/3495</strong></p>
        </div>
      `
    };
    transporter.sendMail(mailOptions, (error) => {
      if (error) console.error('Error al enviar email:', error);
    });
    res.json({ message: 'Turno reservado', id: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: 'Error al reservar turno: ' + err.message });
  }
});

// Ruta estática para generar el PDF de un rango de fechas
app.get('/api/turnos/pdf/rango', async (req, res) => {
  console.log('Solicitud recibida para /api/turnos/pdf/rango');
  console.log('Parámetros:', req.query);

  const token = req.headers.authorization;
  console.log('Token recibido:', token);
  if (!token) {
    console.log('Error: Token no proporcionado');
    return res.status(403).json({ error: 'Acceso denegado: Token no proporcionado' });
  }

  if (!process.env.JWT_SECRET) {
    console.error('Error: JWT_SECRET no está definido en las variables de entorno');
    return res.status(500).json({ error: 'Error interno del servidor: JWT_SECRET no configurado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decodificado:', decoded);
    if (decoded.role !== 'admin') {
      console.log('Error: Rol no autorizado');
      return res.status(403).json({ error: 'Acceso denegado: Rol no autorizado' });
    }
  } catch (err) {
    console.error('Error al verificar el token:', err.message);
    return res.status(403).json({ error: 'Acceso denegado: Token inválido' });
  }

  const { desde, hasta } = req.query;
  if (!desde || !hasta) {
    console.log('Error: Faltan parámetros de fecha');
    return res.status(400).json({ error: 'Faltan parámetros de fecha' });
  }

  try {
    console.log('Ejecutando consulta SQL...');
    const result = await pool.query(
      `SELECT t.*, v.nombre AS vecino_nombre, v.dni AS vecino_dni, m.nombre AS mascota_nombre, vet.nombre AS veterinario_nombre 
       FROM turnos t 
       JOIN vecinos v ON t.dni_vecino = v.dni 
       JOIN mascotas m ON t.mascota_id = m.id 
       LEFT JOIN veterinarios vet ON t.veterinario_id = vet.id 
       WHERE t.dia BETWEEN $1 AND $2 AND t.estado = 'Reservado' 
       ORDER BY t.dia, t.hora`,
      [desde, hasta]
    );
    console.log('Consulta ejecutada. Filas obtenidas:', result.rows.length);

    const turnos = result.rows;
    if (turnos.length === 0) {
      console.log('No hay turnos reservados en este rango de fechas');
      return res.status(404).json({ error: 'No hay turnos reservados en este rango de fechas' });
    }

    console.log('Generando PDF...');
    const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=turnos_${desde}_a_${hasta}.pdf`);
    doc.pipe(res);

    const primaryColor = '#2E7D32'; // Verde oscuro del logo
    const secondaryColor = '#4CAF50'; // Verde más claro del logo
    const textColor = '#333333';

    doc.rect(0, 0, doc.page.width, 100).fill('#F5F5F5');
    try {
      console.log('Cargando logo local...');
      const logoPath = path.join(__dirname, 'public', 'logo-san-isidro.png');
      doc.image(logoPath, 40, 20, { width: 150 });
      console.log('Logo cargado y agregado al PDF');
    } catch (error) {
      console.error('Error al cargar el logo:', error.message);
      doc.text('No se pudo cargar el logo.', 40, 20);
    }

    doc.fontSize(20)
       .fillColor(primaryColor)
       .text(`Turnos Reservados: ${desde} al ${hasta}`, doc.page.width - 240, 40, { align: 'right' });

    doc.moveDown(2);
    doc.lineCap('butt')
       .moveTo(40, 110)
       .lineTo(doc.page.width - 40, 110)
       .stroke(secondaryColor);

    doc.moveDown(1);
    doc.fontSize(16)
       .fillColor(primaryColor)
       .text('Lista de Turnos Reservados', 40);

    const tableTop = doc.y + 20;
    const col1 = 40;
    const col2 = 80;
    const col3 = 200;
    const col4 = 300;
    const col5 = 450;
    const col6 = 550;
    const col7 = 650;

    doc.fontSize(12)
       .text('ID', col1, tableTop)
       .text('Vecino', col2, tableTop)
       .text('Mascota', col3, tableTop)
       .text('Puesto', col4, tableTop)
       .text('Día', col5, tableTop)
       .text('Hora', col6, tableTop)
       .text('Veterinario', col7, tableTop);

    let y = tableTop + 30;
    turnos.forEach((turno) => {
      doc.text(turno.id.toString(), col1, y);
      doc.text(turno.vecino_nombre || 'N/A', col2, y, { width: 110, ellipsis: true });
      doc.text(turno.mascota_nombre || 'N/A', col3, y, { width: 90, ellipsis: true });
      doc.text(turno.puesto || 'N/A', col4, y, { width: 140, ellipsis: true });
      doc.text(turno.dia || 'N/A', col5, y);
      doc.text(turno.hora || 'N/A', col6, y);
      doc.text(turno.veterinario_nombre || 'No asignado', col7, y, { width: 140, ellipsis: true });
      y += 20;

      if (y > doc.page.height - 100) {
        doc.addPage();
        y = 40;
        doc.fontSize(12)
           .text('ID', col1, y)
           .text('Vecino', col2, y)
           .text('Mascota', col3, y)
           .text('Puesto', col4, y)
           .text('Día', col5, y)
           .text('Hora', col6, y)
           .text('Veterinario', col7, y);
        y += 30;
      }
    });

    doc.fontSize(10)
       .fillColor(textColor)
       .text('Zoonosis San Isidro', 40, doc.page.height - 60, { align: 'center' });
    doc.text('Teléfono: (011) 4512-3456 | Email: zoonosis@sanisidro.gob.ar', 40, doc.page.height - 45, { align: 'center' });
    doc.text('Dirección: Av. Centenario 123, San Isidro, Buenos Aires', 40, doc.page.height - 30, { align: 'center' });

    doc.lineCap('butt')
       .moveTo(40, doc.page.height - 70)
       .lineTo(doc.page.width - 40, doc.page.height - 70)
       .stroke(secondaryColor);

    doc.end();
    console.log('PDF generado y enviado');
  } catch (err) {
    console.error('Error en /api/turnos/pdf/rango:', err.message);
    res.status(500).json({ error: 'Error al generar el PDF: ' + err.message });
  }
});

// Ruta dinámica para generar el PDF de un turno específico
app.get('/api/turnos/pdf/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`Solicitud para generar PDF del turno con ID: ${id}`);

  if (isNaN(id)) {
    console.log(`Error: El ID (${id}) no es un número válido`);
    return res.status(400).json({ error: 'El ID debe ser un número entero' });
  }

  try {
    const result = await pool.query(
      `SELECT t.*, v.nombre AS vecino_nombre, v.dni AS vecino_dni, v.telefono AS vecino_telefono, v.email AS vecino_email, v.direccion AS vecino_direccion, 
              m.nombre AS mascota_nombre, m.raza AS mascota_raza, m.edad AS mascota_edad, m.peso AS mascota_peso, 
              vet.nombre AS veterinario_nombre 
       FROM turnos t 
       JOIN vecinos v ON t.dni_vecino = v.dni 
       JOIN mascotas m ON t.mascota_id = m.id 
       LEFT JOIN veterinarios vet ON t.veterinario_id = vet.id 
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      console.log(`Turno con ID ${id} no encontrado`);
      return res.status(404).json({ error: 'Turno no encontrado' });
    }

    const turno = result.rows[0];
    console.log('Turno encontrado:', turno);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=turno_${id}.pdf`);
    doc.pipe(res);

    const primaryColor = '#2E7D32'; // Verde oscuro del logo
    const secondaryColor = '#4CAF50'; // Verde más claro del logo
    const textColor = '#333333';

    doc.rect(0, 0, doc.page.width, 100).fill('#F5F5F5');
    try {
      console.log('Cargando logo local...');
      const logoPath = path.join(__dirname, 'public', 'logo-san-isidro.png');
      doc.image(logoPath, 40, 20, { width: 150 });
      console.log('Logo cargado y agregado al PDF');
    } catch (error) {
      console.error('Error al cargar el logo:', error.message);
      doc.text('No se pudo cargar el logo.', 40, 20);
    }

    doc.fontSize(20)
       .fillColor(primaryColor)
       .text('Reserva de Turno de Castración', doc.page.width - 240, 40, { align: 'right' });

    doc.moveDown(2);
    doc.lineCap('butt')
       .moveTo(40, 110)
       .lineTo(doc.page.width - 40, 110)
       .stroke(secondaryColor);

    doc.moveDown(2);
    doc.fontSize(16)
       .fillColor(primaryColor)
       .text('Datos del Turno', 40, doc.y, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12)
       .fillColor(textColor)
       .text(`ID del Turno: ${turno.id}`, 50);
    doc.text(`Puesto: ${turno.puesto}`, 50);
    doc.text(`Día: ${turno.dia}`, 50);
    doc.text(`Hora: ${turno.hora}`, 50);
    doc.text(`Veterinario: ${turno.veterinario_nombre || 'No asignado'}`, 50);
    doc.text(`Estado: ${turno.estado}`, 50);

    doc.moveDown(1);
    doc.lineCap('butt')
       .moveTo(40, doc.y)
       .lineTo(doc.page.width - 40, doc.y)
       .stroke(secondaryColor);

    doc.moveDown(1);
    doc.fontSize(16)
       .fillColor(primaryColor)
       .text('Datos del Vecino', 40, doc.y, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12)
       .fillColor(textColor)
       .text(`Nombre: ${turno.vecino_nombre}`, 50);
    doc.text(`DNI: ${turno.vecino_dni}`, 50);
    doc.text(`Teléfono: ${turno.vecino_telefono}`, 50);
    doc.text(`Email: ${turno.vecino_email}`, 50);
    doc.text(`Dirección: ${turno.vecino_direccion}`, 50);

    doc.moveDown(1);
    doc.lineCap('butt')
       .moveTo(40, doc.y)
       .lineTo(doc.page.width - 40, doc.y)
       .stroke(secondaryColor);

    doc.moveDown(1);
    doc.fontSize(16)
       .fillColor(primaryColor)
       .text('Datos de la Mascota', 40, doc.y, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12)
       .fillColor(textColor)
       .text(`Nombre: ${turno.mascota_nombre}`, 50);
    doc.text(`Raza: ${turno.mascota_raza}`, 50);
    doc.text(`Edad: ${turno.mascota_edad}`, 50);
    doc.text(`Peso: ${turno.mascota_peso} kg`, 50);

    doc.fontSize(10)
       .fillColor(textColor)
       .text('Zoonosis San Isidro', 40, doc.page.height - 60, { align: 'center' });
    doc.text('Teléfono: (011) 4512-3456 | Email: zoonosis@sanisidro.gob.ar', 40, doc.page.height - 45, { align: 'center' });
    doc.text('Dirección: Av. Centenario 123, San Isidro, Buenos Aires', 40, doc.page.height - 30, { align: 'center' });

    doc.lineCap('butt')
       .moveTo(40, doc.page.height - 70)
       .lineTo(doc.page.width - 40, doc.page.height - 70)
       .stroke(secondaryColor);

    doc.end();
    console.log(`PDF generado para el turno con ID ${id}`);
  } catch (err) {
    console.error('Error al generar el PDF:', err.message);
    res.status(500).json({ error: 'Error al generar el PDF: ' + err.message });
  }
});

app.get('/api/turnos', async (req, res) => {
  const token = req.headers.authorization;
  console.log('Solicitud recibida para /api/turnos');
  console.log('Token recibido:', token);
  if (!token) {
    console.log('Error: Token no proporcionado');
    return res.status(403).json({ error: 'Acceso denegado: Token no proporcionado' });
  }

  if (!process.env.JWT_SECRET) {
    console.error('Error: JWT_SECRET no está definido en las variables de entorno');
    return res.status(500).json({ error: 'Error interno del servidor: JWT_SECRET no configurado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decodificado:', decoded);
    if (decoded.role !== 'admin') {
      console.log('Error: Rol no autorizado');
      return res.status(403).json({ error: 'Acceso denegado: Rol no autorizado' });
    }
  } catch (err) {
    console.error('Error al verificar el token:', err.message);
    return res.status(403).json({ error: 'Acceso denegado: Token inválido' });
  }

  try {
    const result = await pool.query(
      `SELECT t.*, v.nombre AS vecino_nombre, m.nombre AS mascota_nombre, vet.nombre AS veterinario_nombre 
       FROM turnos t 
       JOIN vecinos v ON t.dni_vecino = v.dni 
       JOIN mascotas m ON t.mascota_id = m.id 
       LEFT JOIN veterinarios vet ON t.veterinario_id = vet.id`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener turnos: ' + err.message });
  }
});

app.get('/api/turnos/vecino/:dni', async (req, res) => {
  const { dni } = req.params;
  try {
    const result = await pool.query(
      `SELECT t.*, v.nombre AS vecino_nombre, m.nombre AS mascota_nombre, vet.nombre AS veterinario_nombre 
       FROM turnos t 
       JOIN vecinos v ON t.dni_vecino = v.dni 
       JOIN mascotas m ON t.mascota_id = m.id 
       LEFT JOIN veterinarios vet ON t.veterinario_id = vet.id 
       WHERE t.dni_vecino = $1`,
      [dni]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener turnos del vecino: ' + err.message });
  }
});

app.put('/api/turnos/:id/cancelar', async (req, res) => {
  const token = req.headers.authorization;
  console.log('Solicitud recibida para /api/turnos/:id/cancelar');
  console.log('Token recibido:', token);
  if (!token) {
    console.log('Error: Token no proporcionado');
    return res.status(403).json({ error: 'Acceso denegado: Token no proporcionado' });
  }

  if (!process.env.JWT_SECRET) {
    console.error('Error: JWT_SECRET no está definido en las variables de entorno');
    return res.status(500).json({ error: 'Error interno del servidor: JWT_SECRET no configurado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decodificado:', decoded);
    if (decoded.role !== 'admin') {
      console.log('Error: Rol no autorizado');
      return res.status(403).json({ error: 'Acceso denegado: Rol no autorizado' });
    }
  } catch (err) {
    console.error('Error al verificar el token:', err.message);
    return res.status(403).json({ error: 'Acceso denegado: Token inválido' });
  }

  const { id } = req.params;
  try {
    const turnoResult = await pool.query(
      `SELECT * FROM turnos WHERE id = $1 AND estado = 'Reservado'`,
      [id]
    );
    if (turnoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Turno no encontrado o no reservado' });
    }

    const turno = turnoResult.rows[0];
    await pool.query(`UPDATE turnos SET estado = 'Cancelado' WHERE id = $1`, [id]);
    await pool.query(
      `UPDATE horarios SET disponible = 1 WHERE puesto_id = (SELECT id FROM puestos WHERE nombre = $1) AND dia = $2 AND hora = $3`,
      [turno.puesto, turno.dia, turno.hora]
    );

    const vecino = await pool.query(`SELECT nombre, email FROM vecinos WHERE dni = $1`, [turno.dni_vecino]);
    if (vecino.rows.length > 0 && vecino.rows[0].email) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: vecino.rows[0].email,
        subject: 'Cancelación de Turno - Zoonosis San Isidro',
        html: `
          <div style="text-align: center; font-family: Arial, sans-serif; color: #333;">
            <img src="https://citymis.co/custom/sanisidro/_images/slide-logo.png" alt="Logo Municipio San Isidro" style="width: 200px;">
            <h2>Cancelación de Turno</h2>
            <p>Estimado Vecino ${vecino.rows[0].nombre || ''} DNI ${turno.dni_vecino},</p>
            <p>Le informamos que su turno para el día ${turno.dia} a las ${turno.hora} en el puesto ${turno.puesto} ha sido cancelado.</p>
            <p>Si desea reservar otro turno, puede hacerlo a través de nuestro sistema.</p>
            <p>Desde ya, muchas gracias.</p>
            <p><strong>Zoonosis San Isidro</strong></p>
          </div>
        `
      };
      transporter.sendMail(mailOptions, (error) => {
        if (error) console.error('Error al enviar email de cancelación:', error);
      });
    }

    res.json({ message: 'Turno cancelado' });
  } catch (err) {
    res.status(400).json({ error: 'Error al cancelar turno: ' + err.message });
  }
});

app.put('/api/turnos/:id/cancelar/vecino', async (req, res) => {
  const { id } = req.params;
  const { dni } = req.body;

  try {
    const turnoResult = await pool.query(
      `SELECT * FROM turnos WHERE id = $1 AND dni_vecino = $2 AND estado = 'Reservado'`,
      [id, dni]
    );
    if (turnoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Turno no encontrado, no reservado o no pertenece al vecino' });
    }

    const turno = turnoResult.rows[0];
    await pool.query(`UPDATE turnos SET estado = 'Cancelado' WHERE id = $1`, [id]);
    await pool.query(
      `UPDATE horarios SET disponible = 1 WHERE puesto_id = (SELECT id FROM puestos WHERE nombre = $1) AND dia = $2 AND hora = $3`,
      [turno.puesto, turno.dia, turno.hora]
    );

    const vecino = await pool.query(`SELECT nombre, email FROM vecinos WHERE dni = $1`, [dni]);
    if (vecino.rows.length > 0 && vecino.rows[0].email) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: vecino.rows[0].email,
        subject: 'Cancelación de Turno - Zoonosis San Isidro',
        html: `
          <div style="text-align: center; font-family: Arial, sans-serif; color: #333;">
            <img src="https://citymis.co/custom/sanisidro/_images/slide-logo.png" alt="Logo Municipio San Isidro" style="width: 200px;">
            <h2>Cancelación de Turno</h2>
            <p>Estimado Vecino ${vecino.rows[0].nombre || ''} DNI ${dni},</p>
            <p>Le informamos que su turno para el día ${turno.dia} a las ${turno.hora} en el puesto ${turno.puesto} ha sido cancelado.</p>
            <p>Si desea reservar otro turno, puede hacerlo a través de nuestro sistema.</p>
            <p>Desde ya, muchas gracias.</p>
            <p><strong>Zoonosis San Isidro</strong></p>
          </div>
        `
      };
      transporter.sendMail(mailOptions, (error) => {
        if (error) console.error('Error al enviar email de cancelación:', error);
      });
    }

    res.json({ message: 'Turno cancelado' });
  } catch (err) {
    res.status(400).json({ error: 'Error al cancelar turno: ' + err.message });
  }
});

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

// Middleware para manejar errores no capturados
app.use((err, req, res, next) => {
  console.error('Error no capturado:', err.stack);
  res.status(500).json({ error: 'Error interno del servidor: ' + err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});