import React, { useEffect, useState } from 'react';
import axios from 'axios';

function App() {
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    axios.get('http://localhost:3001')
      .then(response => setMensaje(response.data))
      .catch(error => console.error(error));
  }, []);

  return (
    <div>
      <h1>Sistema de Turnos - Zoonosis</h1>
      <p>{mensaje}</p>
    </div>
  );
}

export default App;