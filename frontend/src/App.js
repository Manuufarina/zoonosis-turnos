import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [dni, setDni] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLogin, setAdminLogin] = useState({ username: '', password: '' });
  const [token, setToken] = useState(null);
  const [mascota, setMascota] = useState({ nombre: '', raza: '', edad: '', peso: '' });
  const [turno, setTurno] = useState({ mascota_id: '', sucursal: '', dia: '', hora: '' });
  const [nuevoHorario, setNuevoHorario] = useState({ sucursal_id: '', dia: '', hora: '' });
  const [mascotas, setMascotas] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [horariosAdmin, setHorariosAdmin] = useState([]);
  const backendUrl = 'http://localhost:3001'; // Cambia a Render para producción

  useEffect(() => {
    if (token) {
      obtenerTurnos();
      obtenerHorariosAdmin();
    } else if (!isAdmin) {
      obtenerSucursales();
    }
  }, [token, isAdmin]);

  const registrarVecino = async (e) => {
    e.preventDefault();
    const datos = {
      dni: e.target.dni.value,
      nombre: e.target.nombre.value,
      telefono: e.target.telefono.value,
      email: e.target.email.value,
      direccion: e.target.direccion.value,
      tarjeta_ciudadana: e.target.tarjeta.value,
    };
    try {
      const response = await axios.post(`${backendUrl}/api/vecinos`, datos);
      alert(response.data.message);
      setDni(datos.dni);
    } catch (error) {
      alert(error.response?.data?.error || 'Error al registrar');
    }
  };

  const registrarMascota = async (e) => {
    e.preventDefault();
    const datos = { ...mascota, dni_vecino: dni };
    try {
      const response = await axios.post(`${backendUrl}/api/mascotas`, datos);
      alert(response.data.message);
      obtenerMascotas();
    } catch (error) {
      alert(error.response?.data?.error || 'Error al registrar mascota');
    }
  };

  const obtenerMascotas = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/mascotas/${dni}`);
      setMascotas(response.data);
    } catch (error) {
      alert('Error al obtener mascotas');
    }
  };

  const obtenerSucursales = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/sucursales`);
      setSucursales(response.data);
    } catch (error) {
      alert('Error al obtener sucursales');
    }
  };

  const obtenerHorarios = async (sucursal_id) => {
    try {
      const response = await axios.get(`${backendUrl}/api/horarios/${sucursal_id}`);
      setHorarios(response.data);
    } catch (error) {
      alert('Error al obtener horarios');
    }
  };

  const reservarTurno = async (e) => {
    e.preventDefault();
    const datos = { ...turno, dni_vecino: dni };
    try {
      const response = await axios.post(`${backendUrl}/api/turnos`, datos);
      alert(response.data.message);
      setHorarios(horarios.filter(h => !(h.dia === turno.dia && h.hora === turno.hora)));
    } catch (error) {
      alert(error.response?.data?.error || 'Error al reservar turno');
    }
  };

  const obtenerTurnos = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/turnos`, {
        headers: { Authorization: token }
      });
      setTurnos(response.data);
    } catch (error) {
      alert('Error al obtener turnos');
      setToken(null);
      setIsAdmin(false);
    }
  };

  const cancelarTurno = async (id) => {
    try {
      const response = await axios.put(`${backendUrl}/api/turnos/${id}/cancelar`, {}, {
        headers: { Authorization: token }
      });
      alert(response.data.message);
      obtenerTurnos();
    } catch (error) {
      alert('Error al cancelar turno');
    }
  };

  const obtenerHorariosAdmin = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/horarios`, {
        headers: { Authorization: token }
      });
      setHorariosAdmin(response.data);
    } catch (error) {
      alert('Error al obtener horarios admin');
    }
  };

  const agregarHorario = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${backendUrl}/api/horarios`, nuevoHorario, {
        headers: { Authorization: token }
      });
      alert(response.data.message);
      obtenerHorariosAdmin();
      setNuevoHorario({ sucursal_id: '', dia: '', hora: '' });
    } catch (error) {
      alert('Error al agregar horario');
    }
  };

  const eliminarHorario = async (id) => {
    try {
      const response = await axios.delete(`${backendUrl}/api/horarios/${id}`, {
        headers: { Authorization: token }
      });
      alert(response.data.message);
      obtenerHorariosAdmin();
    } catch (error) {
      alert('Error al eliminar horario');
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${backendUrl}/api/admin/login`, adminLogin);
      setToken(response.data.token);
      setIsAdmin(true);
    } catch (error) {
      alert(error.response?.data?.error || 'Error al iniciar sesión');
    }
  };

  return (
    <div className="App">
      <h1>Sistema de Turnos - Zoonosis</h1>

      {isAdmin && !token ? (
        <form onSubmit={handleAdminLogin}>
          <h2>Login Administrador</h2>
          <input
            type="text"
            placeholder="Usuario"
            value={adminLogin.username}
            onChange={(e) => setAdminLogin({ ...adminLogin, username: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={adminLogin.password}
            onChange={(e) => setAdminLogin({ ...adminLogin, password: e.target.value })}
            required
          />
          <button type="submit">Iniciar Sesión</button>
          <button type="button" onClick={() => setIsAdmin(false)}>Volver a Vecino</button>
        </form>
      ) : !isAdmin ? (
        !dni ? (
          <div>
            <form onSubmit={registrarVecino}>
              <h2>Registro de Vecino</h2>
              <input type="text" name="dni" placeholder="DNI" required />
              <input type="text" name="nombre" placeholder="Nombre y Apellido" required />
              <input type="text" name="telefono" placeholder="Teléfono" required />
              <input type="email" name="email" placeholder="Email" required />
              <input type="text" name="direccion" placeholder="Dirección" required />
              <input type="text" name="tarjeta" placeholder="Tarjeta Ciudadana" required />
              <button type="submit">Registrar</button>
            </form>
            <button onClick={() => setIsAdmin(true)}>Ir a Login Admin</button>
          </div>
        ) : (
          <div>
            <h2>Bienvenido, DNI: {dni}</h2>
            <button onClick={() => setIsAdmin(true)}>Ir a Login Admin</button>

            <form onSubmit={registrarMascota}>
              <h3>Registrar Nueva Mascota</h3>
              <input
                type="text"
                placeholder="Nombre"
                value={mascota.nombre}
                onChange={(e) => setMascota({ ...mascota, nombre: e.target.value })}
                required
              />
              <select
                value={mascota.raza}
                onChange={(e) => setMascota({ ...mascota, raza: e.target.value })}
                required
              >
                <option value="">Seleccionar Raza</option>
                <option value="Mestizo">Mestizo</option>
                <option value="Labrador">Labrador</option>
                <option value="Caniche">Caniche</option>
              </select>
              <input
                type="text"
                placeholder="Edad"
                value={mascota.edad}
                onChange={(e) => setMascota({ ...mascota, edad: e.target.value })}
                required
              />
              <input
                type="number"
                placeholder="Peso (kg)"
                value={mascota.peso}
                onChange={(e) => setMascota({ ...mascota, peso: e.target.value })}
                required
              />
              <button type="submit">Registrar Mascota</button>
            </form>

            <h3>Mis Mascotas</h3>
            <button onClick={obtenerMascotas}>Actualizar Lista</button>
            <ul>
              {mascotas.length > 0 ? (
                mascotas.map((m) => (
                  <li key={m.id}>
                    {m.nombre} - {m.raza} ({m.edad}, {m.peso}kg)
                  </li>
                ))
              ) : (
                <li>No hay mascotas registradas</li>
              )}
            </ul>

            <form onSubmit={reservarTurno}>
              <h3>Reservar Turno</h3>
              <select
                value={turno.mascota_id}
                onChange={(e) => setTurno({ ...turno, mascota_id: e.target.value })}
                required
              >
                <option value="">Seleccionar Mascota</option>
                {mascotas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <select
                value={turno.sucursal}
                onChange={(e) => {
                  setTurno({ ...turno, sucursal: e.target.value });
                  const sucursalId = sucursales.find(s => s.nombre === e.target.value)?.id;
                  if (sucursalId) obtenerHorarios(sucursalId);
                }}
                required
              >
                <option value="">Seleccionar Sucursal</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.nombre}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <select
                value={`${turno.dia} ${turno.hora}`}
                onChange={(e) => {
                  const [dia, hora] = e.target.value.split(' ');
                  setTurno({ ...turno, dia, hora });
                }}
                required
              >
                <option value="">Seleccionar Horario</option>
                {horarios.map((h) => (
                  <option key={h.id} value={`${h.dia} ${h.hora}`}>
                    {h.dia} {h.hora}
                  </option>
                ))}
              </select>
              <button type="submit">Reservar Turno</button>
            </form>
          </div>
        )
      ) : (
        <div>
          <h2>Dashboard del Administrador</h2>
          <button onClick={obtenerTurnos}>Actualizar Turnos</button>
          <button onClick={() => { setToken(null); setIsAdmin(false); }}>Cerrar Sesión</button>

          <h3>Turnos Reservados</h3>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Vecino</th>
                <th>Mascota</th>
                <th>Sucursal</th>
                <th>Día</th>
                <th>Hora</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{t.vecino_nombre} ({t.dni_vecino})</td>
                  <td>{t.mascota_nombre}</td>
                  <td>{t.sucursal}</td>
                  <td>{t.dia}</td>
                  <td>{t.hora}</td>
                  <td>{t.estado}</td>
                  <td>
                    {t.estado === 'Reservado' && (
                      <button onClick={() => cancelarTurno(t.id)}>Cancelar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Gestionar Horarios</h3>
          <form onSubmit={agregarHorario}>
            <select
              value={nuevoHorario.sucursal_id}
              onChange={(e) => setNuevoHorario({ ...nuevoHorario, sucursal_id: e.target.value })}
              required
            >
              <option value="">Seleccionar Sucursal</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={nuevoHorario.dia}
              onChange={(e) => setNuevoHorario({ ...nuevoHorario, dia: e.target.value })}
              required
            />
            <input
              type="time"
              value={nuevoHorario.hora}
              onChange={(e) => setNuevoHorario({ ...nuevoHorario, hora: e.target.value })}
              required
            />
            <button type="submit">Agregar Horario</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Sucursal</th>
                <th>Día</th>
                <th>Hora</th>
                <th>Disponible</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {horariosAdmin.map((h) => (
                <tr key={h.id}>
                  <td>{h.id}</td>
                  <td>{h.sucursal}</td>
                  <td>{h.dia}</td>
                  <td>{h.hora}</td>
                  <td>{h.disponible ? 'Sí' : 'No'}</td>
                  <td>
                    <button onClick={() => eliminarHorario(h.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;