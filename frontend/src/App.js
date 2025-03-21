import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [dni, setDni] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLogin, setAdminLogin] = useState({ username: '', password: '' });
  const [token, setToken] = useState(null);
  const [mascota, setMascota] = useState({ nombre: '', raza: '', edad: '', peso: '' });
  const [turno, setTurno] = useState({ mascota_id: '', puesto: '', dia: '', hora: '', veterinario_id: '' });
  const [nuevoHorario, setNuevoHorario] = useState({ puesto_id: '', dia: '', hora: '' });
  const [masivoHorario, setMasivoHorario] = useState({ puesto_id: '', dia: '', hora_inicio: '', hora_fin: '', veterinario_id: '' });
  const [editHorario, setEditHorario] = useState(null);
  const [mascotas, setMascotas] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [veterinarios, setVeterinarios] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [horariosAdmin, setHorariosAdmin] = useState([]);
  const [turnosVecino, setTurnosVecino] = useState([]);
  const [filtroTurnos, setFiltroTurnos] = useState('Todos');
  const backendUrl = 'https://zoonosis-backend.onrender.com';

  useEffect(() => {
    if (token) {
      obtenerTurnos();
      obtenerHorariosAdmin();
    } else if (!isAdmin) {
      obtenerPuestos();
      obtenerVeterinarios();
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

  const obtenerVeterinarios = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/veterinarios`);
      setVeterinarios(response.data);
    } catch (error) {
      alert('Error al obtener veterinarios');
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
      setTurno({ mascota_id: '', puesto: '', dia: '', hora: '', veterinario_id: '' });
    } catch (error) {
      alert(error.response?.data?.error || 'Error al reservar turno');
    }
  };

  const descargarPDF = async (turnoId) => {
    try {
      const response = await axios.get(`${backendUrl}/api/turnos/pdf/${turnoId}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `turno_${turnoId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert('Error al descargar el PDF');
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

  const agregarHorariosMasivo = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${backendUrl}/api/horarios/masivo`, masivoHorario, {
        headers: { Authorization: token }
      });
      alert(response.data.message);
      obtenerHorariosAdmin();
      setMasivoHorario({ puesto_id: '', dia: '', hora_inicio: '', hora_fin: '', veterinario_id: '' });
    } catch (error) {
      alert(error.response?.data?.error || 'Error al agregar horarios masivos');
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

  const razasPerros = [
    "Affenpinscher", "Afghan Hound", "Airedale Terrier", "Akita", "Alaskan Klee Kai", "Alaskan Malamute",
    "American Bulldog", "American English Coonhound", "American Eskimo Dog", "American Foxhound",
    "American Hairless Terrier", "American Leopard Hound", "American Pit Bull Terrier", "American Staffordshire Terrier",
    "American Water Spaniel", "Anatolian Shepherd Dog", "Appenzeller Sennenhund", "Australian Cattle Dog",
    "Australian Kelpie", "Australian Shepherd", "Australian Stumpy Tail Cattle Dog", "Australian Terrier",
    "Azawakh", "Barbet", "Basenji", "Basset Fauve de Bretagne", "Basset Hound", "Bavarian Mountain Hound",
    "Beagle", "Bearded Collie", "Beauceron", "Bedlington Terrier", "Belgian Laekenois", "Belgian Malinois",
    "Belgian Sheepdog", "Belgian Tervuren", "Bergamasco Sheepdog", "Berger Picard", "Bernese Mountain Dog",
    "Bichon Frise", "Biewer Terrier", "Black and Tan Coonhound", "Black Russian Terrier", "Bloodhound",
    "Bluetick Coonhound", "Boerboel", "Bolognese", "Border Collie", "Border Terrier", "Borzoi",
    "Boston Terrier", "Bouvier des Flandres", "Boxer", "Boykin Spaniel", "Bracco Italiano", "Briard",
    "Brittany", "Broholmer", "Brussels Griffon", "Bull Terrier", "Bulldog", "Bullmastiff",
    "Cairn Terrier", "Canaan Dog", "Cane Corso", "Cardigan Welsh Corgi", "Catahoula Leopard Dog",
    "Caucasian Shepherd Dog", "Cavalier King Charles Spaniel", "Cesky Terrier", "Chesapeake Bay Retriever",
    "Chihuahua", "Chinese Crested", "Chinese Shar-Pei", "Chinook", "Chow Chow", "Cirneco dell’Etna",
    "Clumber Spaniel", "Cocker Spaniel", "Collie", "Coton de Tulear", "Curly-Coated Retriever",
    "Czechoslovakian Vlcak", "Dachshund", "Dalmatian", "Dandie Dinmont Terrier", "Danish-Swedish Farmdog",
    "Deutscher Wachtelhund", "Doberman Pinscher", "Dogo Argentino", "Dogue de Bordeaux", "Drentsche Patrijshond",
    "Drever", "Dutch Shepherd", "English Cocker Spaniel", "English Foxhound", "English Setter",
    "English Springer Spaniel", "English Toy Spaniel", "Entlebucher Mountain Dog", "Eurasier",
    "Field Spaniel", "Finnish Lapphund", "Finnish Spitz", "Flat-Coated Retriever", "French Bulldog",
    "French Spaniel", "German Longhaired Pointer", "German Pinscher", "German Shepherd Dog",
    "German Shorthaired Pointer", "German Spitz", "German Wirehaired Pointer", "Giant Schnauzer",
    "Glen of Imaal Terrier", "Golden Retriever", "Gordon Setter", "Grand Basset Griffon Vendéen",
    "Great Dane", "Great Pyrenees", "Greater Swiss Mountain Dog", "Greyhound", "Hamiltonstovare",
    "Hanoverian Scenthound", "Harrier", "Havanese", "Hokkaido", "Hovawart", "Ibizan Hound",
    "Icelandic Sheepdog", "Irish Red and White Setter", "Irish Setter", "Irish Terrier",
    "Irish Water Spaniel", "Irish Wolfhound", "Italian Greyhound", "Jagdterrier", "Japanese Chin",
    "Japanese Spitz", "Keeshond", "Kerry Blue Terrier", "Kishu Ken", "Komondor", "Kooikerhondje",
    "Kuvasz", "Labrador Retriever", "Lagotto Romagnolo", "Lakeland Terrier", "Lancashire Heeler",
    "Leonberger", "Lhasa Apso", "Löwchen", "Maltese", "Manchester Terrier", "Mastiff",
    "Miniature American Shepherd", "Miniature Bull Terrier", "Miniature Pinscher", "Miniature Schnauzer",
    "Mudi", "Neapolitan Mastiff", "Nederlandse Kooikerhondje", "Newfoundland", "Norfolk Terrier",
    "Norwegian Buhund", "Norwegian Elkhound", "Norwegian Lundehund", "Norwich Terrier",
    "Nova Scotia Duck Tolling Retriever", "Old English Sheepdog", "Otterhound", "Papillon",
    "Parson Russell Terrier", "Pekingese", "Pembroke Welsh Corgi", "Perro de Presa Canario",
    "Peruvian Inca Orchid", "Petit Basset Griffon Vendéen", "Pharaoh Hound", "Plott Hound",
    "Pointer", "Polish Lowland Sheepdog", "Pomeranian", "Poodle", "Porcelaine", "Portuguese Podengo",
    "Portuguese Pointer", "Portuguese Water Dog", "Pug", "Puli", "Pumi", "Pyrenean Mastiff",
    "Pyrenean Shepherd", "Rafeiro do Alentejo", "Rat Terrier", "Redbone Coonhound", "Rhodesian Ridgeback",
    "Rottweiler", "Russell Terrier", "Russian Toy", "Saint Bernard", "Saluki", "Samoyed",
    "Schapendoes", "Schipperke", "Schnauzer", "Scottish Deerhound", "Scottish Terrier", "Sealyham Terrier",
    "Shetland Sheepdog", "Shiba Inu", "Shih Tzu", "Shikoku", "Siberian Husky", "Silky Terrier",
    "Skye Terrier", "Sloughi", "Slovak Cuvac", "Small Munsterlander", "Soft Coated Wheaten Terrier",
    "Spanish Mastiff", "Spanish Water Dog", "Spinone Italiano", "Staffordshire Bull Terrier",
    "Standard Schnauzer", "Stumpy Tail Cattle Dog", "Sussex Spaniel", "Swedish Lapphund",
    "Swedish Vallhund", "Tennessee Treeing Brindle", "Thai Ridgeback", "Tibetan Mastiff",
    "Tibetan Spaniel", "Tibetan Terrier", "Tornjak", "Tosa", "Toy Fox Terrier", "Treeing Tennessee Brindle",
    "Treeing Walker Coonhound", "Vizsla", "Weimaraner", "Welsh Springer Spaniel", "Welsh Terrier",
    "West Highland White Terrier", "Whippet", "Wire Fox Terrier", "Wirehaired Pointing Griffon",
    "Wirehaired Vizsla", "Xoloitzcuintli", "Yorkshire Terrier"
  ];

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
                {razasPerros.map((raza) => (
                  <option key={raza} value={raza}>{raza}</option>
                ))}
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
              <select
                value={turno.veterinario_id}
                onChange={(e) => setTurno({ ...turno, veterinario_id: e.target.value })}
                required
              >
                <option value="">Seleccionar Veterinario</option>
                {veterinarios.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
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
                    <th>Veterinario</th>
                    <th>Estado</th>
                    <th>Acciones</th>
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
                      <td>{t.veterinario_nombre}</td>
                      <td>{t.estado}</td>
                      <td>
                        {t.estado === 'Reservado' && (
                          <button className="cancelar-btn" onClick={() => cancelarTurnoVecino(t.id)}>
                            Cancelar
                          </button>
                        )}
                        <button onClick={() => descargarPDF(t.id)}>
                          Descargar PDF
                        </button>
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
                <th>Veterinario</th>
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
                  <td>{t.veterinario_nombre}</td>
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
            <h4>Agregar Horario Individual</h4>
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

          <form onSubmit={agregarHorariosMasivo}>
            <h4>Agregar Horarios Masivos</h4>
            <select
              value={masivoHorario.puesto_id}
              onChange={(e) => setMasivoHorario({ ...masivoHorario, puesto_id: e.target.value })}
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
              value={masivoHorario.dia}
              onChange={(e) => setMasivoHorario({ ...masivoHorario, dia: e.target.value })}
              min={new Date().toISOString().split("T")[0]}
              required
            />
            <input
              type="time"
              value={masivoHorario.hora_inicio}
              onChange={(e) => setMasivoHorario({ ...masivoHorario, hora_inicio: e.target.value })}
              required
            />
            <input
              type="time"
              value={masivoHorario.hora_fin}
              onChange={(e) => setMasivoHorario({ ...masivoHorario, hora_fin: e.target.value })}
              required
            />
            <select
              value={masivoHorario.veterinario_id}
              onChange={(e) => setMasivoHorario({ ...masivoHorario, veterinario_id: e.target.value })}
              required
            >
              <option value="">Seleccionar Veterinario</option>
              {veterinarios.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
            <button type="submit">Agregar Horarios Masivos</button>
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