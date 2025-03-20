import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [dni, setDni] = useState('');
  const [vecino, setVecino] = useState(null);
  const [mascota, setMascota] = useState({ nombre: '', raza: '', edad: '', peso: '' });
  const [turno, setTurno] = useState({ mascota_id: '', sucursal: '', dia: '', hora: '' });
  const [mascotas, setMascotas] = useState([]);
  const backendUrl = 'http://localhost:3001'; // Usamos el backend local por ahora

  // Registrar vecino
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
      alert(error.response?.data?.error || 'Error al registrar vecino');
    }
  };

  // Registrar mascota
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

  // Obtener mascotas
  const obtenerMascotas = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/mascotas/${dni}`);
      setMascotas(response.data);
    } catch (error) {
      alert('Error al obtener mascotas');
    }
  };

  // Reservar turno
  const reservarTurno = async (e) => {
    e.preventDefault();
    const datos = { ...turno, dni_vecino: dni };
    try {
      const response = await axios.post(`${backendUrl}/api/turnos`, datos);
      alert(response.data.message);
    } catch (error) {
      alert(error.response?.data?.error || 'Error al reservar turno');
    }
  };

  return (
    <div className="App">
      <h1>Sistema de Turnos - Zoonosis</h1>

      {!dni ? (
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
      ) : (
        <div>
          <h2>Bienvenido, DNI: {dni}</h2>

          <form onSubmit={registrarMascota}>
            <h3>Registrar Nueva Mascota</h3>
            <input
              type="text"
              placeholder="Nombre"
              value={mascota.nombre}
              onChange={(e) => setMascota({ ...mascota, nombre: e.target.value })}
              required
            />
            <input
              type="text"
              placeholder="Raza"
              value={mascota.raza}
              onChange={(e) => setMascota({ ...mascota, raza: e.target.value })}
              required
            />
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
            <input
              type="number"
              placeholder="ID de Mascota"
              value={turno.mascota_id}
              onChange={(e) => setTurno({ ...turno, mascota_id: e.target.value })}
              required
            />
            <input
              type="text"
              placeholder="Sucursal"
              value={turno.sucursal}
              onChange={(e) => setTurno({ ...turno, sucursal: e.target.value })}
              required
            />
            <input
              type="date"
              value={turno.dia}
              onChange={(e) => setTurno({ ...turno, dia: e.target.value })}
              required
            />
            <input
              type="time"
              value={turno.hora}
              onChange={(e) => setTurno({ ...turno, hora: e.target.value })}
              required
            />
            <button type="submit">Reservar Turno</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;