const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fetch = require('node-fetch');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: {
    rejectUnauthorized: false // Necesario para Render
  }
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
    res.status(400).json({ error: 'Error al registrar vecino' });
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
    res.status(400).json({ error: 'Error al registrar mascota' });
  }
});

app.get('/api/mascotas/:dni', async (req, res) => {
  const { dni } = req.params;
  try {
    const result = await pool.query(`SELECT * FROM mascotas WHERE dni_vecino = $1`, [dni]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/puestos', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM puestos`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/veterinarios', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM veterinarios`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/horarios', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    const result = await pool.query(
      `SELECT h.*, p.nombre as puesto FROM horarios h JOIN puestos p ON h.puesto_id = p.id`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/horarios', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const { puesto_id, dia, hora } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO horarios (puesto_id, dia, hora) VALUES ($1, $2, $3) RETURNING id`,
      [puesto_id, dia, hora]
    );
    res.json({ message: 'Horario agregado', id: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: 'Error al agregar horario' });
  }
});

app.post('/api/horarios/masivo', async (req, res) => {
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
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
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
    res.status(400).json({ error: 'Error al editar horario' });
  }
});

app.delete('/api/horarios/:id', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM horarios WHERE id = $1`, [id]);
    res.json({ message: 'Horario eliminado' });
  } catch (err) {
    res.status(400).json({ error: 'Error al eliminar horario' });
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
          <img src="https://www.sanisidro.gob.ar/sites/default/files/Logo%20San%20Isidro%202017.png" alt="Logo Municipio San Isidro" style="width: 200px;">
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

app.get('/api/turnos/pdf/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`Solicitud para generar PDF del turno con ID: ${id}`);

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

    const primaryColor = '#2E7D32';
    const secondaryColor = '#4CAF50';
    const textColor = '#333333';

    doc.rect(0, 0, doc.page.width, 100).fill('#F5F5F5');
    const logoUrl = 'https://www.sanisidro.gob.ar/sites/default/files/Logo%20San%20Isidro%202017.png';
    try {
      const response = await fetch(logoUrl);
      if (!response.ok) throw new Error('Error al descargar el logo');
      const logoBuffer = await response.buffer();
      doc.image(logoBuffer, 40, 20, { width: 150 });
    } catch (error) {
      console.error('Error al descargar el logo:', error.message);
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
       .text('Datos del Turno', { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(12)
       .fillColor(textColor)
       .text(`ID del Turno: ${turno.id}`, 40)
       .text(`Fecha: ${turno.dia} a las ${turno.hora}`)
       .text(`Puesto: ${turno.puesto}`)
       .text(`Veterinario: ${turno.veterinario_nombre || 'No asignado'}`)
       .text(`Estado: ${turno.estado}`);

    doc.moveDown(2);
    doc.fontSize(16)
       .fillColor(primaryColor)
       .text('Datos del Vecino', { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(12)
       .fillColor(textColor)
       .text(`Nombre: ${turno.vecino_nombre}`)
       .text(`DNI: ${turno.vecino_dni}`)
       .text(`Teléfono: ${turno.vecino_telefono || 'No disponible'}`)
       .text(`Email: ${turno.vecino_email || 'No disponible'}`)
       .text(`Dirección: ${turno.vecino_direccion || 'No disponible'}`);

    doc.moveDown(2);
    doc.fontSize(16)
       .fillColor(primaryColor)
       .text('Datos de la Mascota', { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(12)
       .fillColor(textColor)
       .text(`Nombre: ${turno.mascota_nombre}`)
       .text(`Raza: ${turno.mascota_raza}`)
       .text(`Edad: ${turno.mascota_edad}`)
       .text(`Peso: ${turno.mascota_peso} kg`);

    doc.moveDown(2);
    doc.lineCap('butt')
       .moveTo(40, doc.y)
       .lineTo(doc.page.width - 40, doc.y)
       .stroke(secondaryColor);

    doc.moveDown(1);
    doc.fontSize(10)
       .fillColor(textColor)
       .text('Zoonosis San Isidro - Municipalidad de San Isidro', { align: 'center' })
       .text('Ante cualquier duda, contactar al 4512-3151/3495 de lunes a viernes de 8 a 14 hs.', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Error al generar PDF:', err.message);
    res.status(500).json({ error: 'Error al generar el PDF: ' + err.message });
  }
});

app.get('/api/turnos/vecino/:dni', async (req, res) => {
  const { dni } = req.params;
  try {
    const result = await pool.query(
      `SELECT t.*, m.nombre AS mascota_nombre, vet.nombre AS veterinario_nombre 
       FROM turnos t 
       JOIN mascotas m ON t.mascota_id = m.id 
       LEFT JOIN veterinarios vet ON t.veterinario_id = vet.id 
       WHERE t.dni_vecino = $1`,
      [dni]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/turnos/vecino/:id/cancelar', async (req, res) => {
  const { id } = req.params;
  const { dni } = req.body;

  try {
    const turnoResult = await pool.query(
      `SELECT * FROM turnos WHERE id = $1 AND dni_vecino = $2`,
      [id, dni]
    );
    if (turnoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Turno no encontrado o no pertenece al vecino' });
    }
    if (turnoResult.rows[0].estado !== 'Reservado') {
      return res.status(400).json({ error: 'El turno no puede ser cancelado porque no está reservado' });
    }

    await pool.query(
      `UPDATE turnos SET estado = 'Cancelado' WHERE id = $1`,
      [id]
    );

    const horarioResult = await pool.query(
      `SELECT * FROM horarios WHERE puesto_id = (SELECT id FROM puestos WHERE nombre = $1) AND dia = $2 AND hora = $3`,
      [turnoResult.rows[0].puesto, turnoResult.rows[0].dia, turnoResult.rows[0].hora]
    );
    if (horarioResult.rows.length > 0) {
      await pool.query(
        `UPDATE horarios SET disponible = 1 WHERE id = $1`,
        [horarioResult.rows[0].id]
      );
    }

    res.json({ message: 'Turno cancelado' });
  } catch (err) {
    res.status(400).json({ error: 'Error al cancelar turno: ' + err.message });
  }
});

app.get('/api/turnos', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
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
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/turnos/:id/cancelar', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const { id } = req.params;

  try {
    const turnoResult = await pool.query(`SELECT * FROM turnos WHERE id = $1`, [id]);
    if (turnoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Turno no encontrado' });
    }
    if (turnoResult.rows[0].estado !== 'Reservado') {
      return res.status(400).json({ error: 'El turno no puede ser cancelado porque no está reservado' });
    }

    await pool.query(`UPDATE turnos SET estado = 'Cancelado' WHERE id = $1`, [id]);

    const horarioResult = await pool.query(
      `SELECT * FROM horarios WHERE puesto_id = (SELECT id FROM puestos WHERE nombre = $1) AND dia = $2 AND hora = $3`,
      [turnoResult.rows[0].puesto, turnoResult.rows[0].dia, turnoResult.rows[0].hora]
    );
    if (horarioResult.rows.length > 0) {
      await pool.query(`UPDATE horarios SET disponible = 1 WHERE id = $1`, [horarioResult.rows[0].id]);
    }

    res.json({ message: 'Turno cancelado' });
  } catch (err) {
    res.status(400).json({ error: 'Error al cancelar turno' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

app.get('/api/turnos/pdf/rango', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const { desde, hasta } = req.query;
  if (!desde || !hasta) {
    return res.status(400).json({ error: 'Faltan parámetros de fecha' });
  }

  try {
    const result = await pool.query(
      `SELECT t.*, v.nombre AS vecino_nombre, v.dni AS vecino_dni, m.nombre AS mascota_nombre, vet.nombre AS veterinario_nombre 
       FROM turnos t 
       JOIN vecinos v ON t.dni_vecino = v.dni 
       JOIN mascotas m ON t.mascota_id = m.id 
       LEFT JOIN veterinarios vet ON t.veterinario_id = vet.id 
       WHERE t.dia BETWEEN $1 AND $2 
       ORDER BY t.dia, t.hora`,
      [desde, hasta]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontraron turnos en el rango especificado' });
    }

    const turnos = result.rows;
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=turnos_${desde}_a_${hasta}.pdf`);
    doc.pipe(res);

    const primaryColor = '#2E7D32';
    const secondaryColor = '#4CAF50';
    const textColor = '#333333';

    doc.rect(0, 0, doc.page.width, 100).fill('#F5F5F5');
    const logoUrl = 'https://citymis.co/custom/sanisidro/_images/slide-logo.png';
    try {
      const response = await fetch(logoUrl);
      if (!response.ok) throw new Error('Error al descargar el logo');
      const logoBuffer = await response.buffer();
      doc.image(logoBuffer, 40, 20, { width: 150 });
    } catch (error) {
      console.error('Error al descargar el logo:', error.message);
      doc.text('No se pudo cargar el logo.', 40, 20);
    }

    doc.fontSize(20)
       .fillColor(primaryColor)
       .text(`Turnos del ${desde} al ${hasta}`, doc.page.width - 240, 40, { align: 'right' });

    doc.moveDown(2);
    doc.lineCap('butt')
       .moveTo(40, 110)
       .lineTo(doc.page.width - 40, 110)
       .stroke(secondaryColor);

    doc.moveDown(1);
    doc.fontSize(16)
       .fillColor(primaryColor)
       .text('Listado de Turnos', { align: 'center' });

    let yPosition = doc.y + 20;
    turnos.forEach((turno, index) => {
      if (yPosition > doc.page.height - 100) {
        doc.addPage();
        yPosition = 40;
      }

      doc.fontSize(12)
         .fillColor(textColor)
         .text(`Turno ${index + 1}`, 40, yPosition)
         .text(`ID: ${turno.id}`, 40, yPosition + 15)
         .text(`Fecha: ${turno.dia} ${turno.hora}`, 40, yPosition + 30)
         .text(`Puesto: ${turno.puesto}`, 40, yPosition + 45)
         .text(`Veterinario: ${turno.veterinario_nombre || 'No asignado'}`, 40, yPosition + 60)
         .text(`Vecino: ${turno.vecino_nombre} (DNI: ${turno.vecino_dni})`, 40, yPosition + 75)
         .text(`Mascota: ${turno.mascota_nombre}`, 40, yPosition + 90)
         .text(`Estado: ${turno.estado}`, 40, yPosition + 105);

      doc.lineCap('butt')
         .moveTo(40, yPosition + 120)
         .lineTo(doc.page.width - 40, yPosition + 120)
         .stroke(secondaryColor);

      yPosition += 140;
    });

    doc.moveDown(2);
    doc.fontSize(10)
       .fillColor(textColor)
       .text('Zoonosis San Isidro - Municipalidad de San Isidro', { align: 'center' })
       .text('Ante cualquier duda, contactar al 4512-3151/3495 de lunes a viernes de 8 a 14 hs.', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Error al generar PDF de rango:', err.message);
    res.status(500).json({ error: 'Error al generar el PDF: ' + err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));