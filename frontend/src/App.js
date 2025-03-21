import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [dni, setDni] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLogin, setAdminLogin] = useState({ username: '', password: '' });
  const [token, setToken] = useState(null);
  const [mascota, setMascota] = useState({ nombre: '', raza: '', edad: '', peso: '' });
  const [turno, setTurno] = useState({ mascota_id: '', puesto: '', dia: '', hora: '' });
  const [nuevoHorario, setNuevoHorario] = useState({ puesto_id: '', dia: '', hora: '' });
  const [editHorario, setEditHorario] = useState(null);
  const [mascotas, setMascotas] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [horariosAdmin, setHorariosAdmin] = useState([]);
  const [turnosVecino, setTurnosVecino] = useState([]);
  const [filtroTurnos, setFiltroTurnos] = useState('Todos'); // Nuevo estado para filtro
  const backendUrl = 'https://zoonosis-backend.onrender.com';

  useEffect(() => {
    if (token) {
      obtenerTurnos();
      obtenerHorariosAdmin();
    } else if (!isAdmin) {
      obtenerPuestos();
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
      if (response.status === 201) {
        alert(response.data.message);
        setDni(datos.dni);
        obtenerMascotas(datos.dni);
        obtenerTurnosVecino(datos.dni);
      } else if (response.status === 200 && response.data.message === 'Usuario ya registrado') {
        setDni(datos.dni);
        obtenerMascotas(datos.dni);
        obtenerTurnosVecino(datos.dni);
      }
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
      obtenerMascotas(dni);
    } catch (error) {
      alert(error.response?.data?.error || 'Error al registrar mascota');
    }
  };

  const obtenerMascotas = async (dniToUse = dni) => {
    if (!dniToUse) {
      console.error('DNI no definido para obtener mascotas');
      return;
    }
    try {
      const response = await axios.get(`${backendUrl}/api/mascotas/${dniToUse}`);
      setMascotas(response.data);
    } catch (error) {
      alert('Error al obtener mascotas');
    }
  };

  const obtenerPuestos = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/puestos`);
      setPuestos(response.data);
    } catch (error) {
      alert('Error al obtener puestos');
    }
  };

  const obtenerHorarios = async (puesto_id) => {
    try {
      const response = await axios.get(`${backendUrl}/api/horarios/${puesto_id}`);
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
      obtenerTurnosVecino(dni);
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
      setNuevoHorario({ puesto_id: '', dia: '', hora: '' });
    } catch (error) {
      alert(error.response?.data?.error || 'Error al agregar horario');
    }
  };

  const editarHorario = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.put(`${backendUrl}/api/horarios/${editHorario.id}`, editHorario, {
        headers: { Authorization: token }
      });
      alert(response.data.message);
      obtenerHorariosAdmin();
      setEditHorario(null);
    } catch (error) {
      alert(error.response?.data?.error || 'Error al editar horario');
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

  const obtenerTurnosVecino = async (dni) => {
    try {
      const response = await axios.get(`${backendUrl}/api/turnos/vecino/${dni}`);
      setTurnosVecino(response.data);
    } catch (error) {
      alert('Error al obtener turnos del vecino');
    }
  };

  const cancelarTurnoVecino = async (id) => {
    try {
      const response = await axios.put(`${backendUrl}/api/turnos/vecino/${id}/cancelar`, { dni });
      alert(response.data.message);
      obtenerTurnosVecino(dni);
    } catch (error) {
      alert(error.response?.data?.error || 'Error al cancelar turno');
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

  const turnosFiltrados = turnosVecino.filter((t) => {
    if (filtroTurnos === 'Todos') return true;
    if (filtroTurnos === 'Reservados') return t.estado === 'Reservado';
    if (filtroTurnos === 'Pasados') return t.estado !== 'Reservado';
    return true;
  });

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
            <button onClick={() => setDni('')}>Cambiar Vecino</button>

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
            <button onClick={() => obtenerMascotas(dni)}>Actualizar Lista</button>
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
                value={turno.puesto}
                onChange={(e) => {
                  setTurno({ ...turno, puesto: e.target.value });
                  const puestoId = puestos.find(s => s.nombre === e.target.value)?.id;
                  if (puestoId) obtenerHorarios(puestoId);
                }}
                required
              >
                <option value="">Seleccionar Puesto</option>
                {puestos.map((p) => (
                  <option key={p.id} value={p.nombre}>
                    {p.nombre}
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

            <h3>Mis Turnos</h3>
            <div className="filtro-turnos">
              <label>Filtrar: </label>
              <select value={filtroTurnos} onChange={(e) => setFiltroTurnos(e.target.value)}>
                <option value="Todos">Todos</option>
                <option value="Reservados">Reservados</option>
                <option value="Pasados">Pasados</option>
              </select>
              <button onClick={() => obtenerTurnosVecino(dni)}>Actualizar Turnos</button>
            </div>
            {turnosFiltrados.length > 0 ? (
              <table className="turnos-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Mascota</th>
                    <th>Puesto</th>
                    <th>Día</th>
                    <th>Hora</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {turnosFiltrados.map((t) => (
                    <tr key={t.id} className={t.estado === 'Reservado' ? 'turno-activo' : 'turno-pasado'}>
                      <td>{t.id}</td>
                      <td>{t.mascota_nombre}</td>
                      <td>{t.puesto}</td>
                      <td>{t.dia}</td>
                      <td>{t.hora}</td>
                      <td>{t.estado}</td>
                      <td>
                        {t.estado === 'Reservado' && (
                          <button className="cancelar-btn" onClick={() => cancelarTurnoVecino(t.id)}>
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No hay turnos para mostrar con este filtro</p>
            )}
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
                <th>Puesto</th>
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
                  <td>{t.puesto}</td>
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
              value={nuevoHorario.puesto_id}
              onChange={(e) => setNuevoHorario({ ...nuevoHorario, puesto_id: e.target.value })}
              required
            >
              <option value="">Seleccionar Puesto</option>
              {puestos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={nuevoHorario.dia}
              onChange={(e) => setNuevoHorario({ ...nuevoHorario, dia: e.target.value })}
              min={new Date().toISOString().split("T")[0]}
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

          {editHorario && (
            <form onSubmit={editarHorario} className="edit-form">
              <h4>Editar Horario ID: {editHorario.id}</h4>
              <label>
                Puesto:
                <select
                  value={editHorario.puesto_id}
                  onChange={(e) => setEditHorario({ ...editHorario, puesto_id: e.target.value })}
                  required
                >
                  <option value="">Seleccionar Puesto</option>
                  {puestos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Día:
                <input
                  type="date"
                  value={editHorario.dia}
                  onChange={(e) => setEditHorario({ ...editHorario, dia: e.target.value })}
                  min={new Date().toISOString().split("T")[0]}
                  required
                />
              </label>
              <label>
                Hora:
                <input
                  type="time"
                  value={editHorario.hora}
                  onChange={(e) => setEditHorario({ ...editHorario, hora: e.target.value })}
                  required
                />
              </label>
              <div>
                <button type="submit">Guardar Cambios</button>
                <button type="button" onClick={() => setEditHorario(null)}>Cancelar</button>
              </div>
            </form>
          )}

          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Puesto</th>
                <th>Día</th>
                <th>Hora</th>
                <th>Disponible</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {horariosAdmin.length > 0 ? (
                horariosAdmin.map((h) => (
                  <tr key={h.id}>
                    <td>{h.id}</td>
                    <td>{h.puesto}</td>
                    <td>{h.dia}</td>
                    <td>{h.hora}</td>
                    <td>{h.disponible ? 'Sí' : 'No'}</td>
                    <td>
                      <button onClick={() => setEditHorario({ id: h.id, puesto_id: puestos.find(s => s.nombre === h.puesto)?.id, dia: h.dia, hora: h.hora })}>
                        Editar
                      </button>
                      <button onClick={() => eliminarHorario(h.id)}>Eliminar</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6">No hay horarios disponibles</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;