document.addEventListener('DOMContentLoaded', function() {
  validTokenSession();

  const videoElement = document.getElementById('videoElement');
  const searchEstudianteBtn = document.getElementById('searchEstudianteBtn');
  const retryBtn = document.getElementById('retryBtn');
  const canvas = document.getElementById('canvas');
  const resultadoEstudiante = document.getElementById('resultadoEstudiante');
  const nextBtn = document.getElementById('nextBtn');
  const spinnerObjeto = document.getElementsByClassName('spinner-box')[0];
  const toggleCameraButton = document.getElementById('toggleCameraButton');
  const barraProgreso = document.getElementById('barra-progreso');
  const porcentajeProgreso = document.getElementById('porcentaje-progreso');
  const mensajeProgreso = document.getElementById('mensaje-progreso');
  const anchoBarraMax = barraProgreso.parentNode.offsetWidth;
  
  let datosEstudiante = null;
  let stream;
  let isFrontCamera = true;
  let coincidenciaExistente = null;
  
  const umbralSimilitud = 20;
  const maxIntentos = 40;
  const minCoincidencias = 4;

  initCameraAccess(videoElement, isFrontCamera);

  searchEstudianteBtn.addEventListener('click', iniciarReconocimientoFacial);
  retryBtn.addEventListener('click', reiniciarBusqueda);
  nextBtn.addEventListener('click', enviarDatosYCerrar);
  toggleCameraButton.addEventListener('click', alternarCamara);

  // Obtener acceso a la cámara
  function initCameraAccess(videoElement, isFrontCamera) {
    const facingMode = isFrontCamera ? 'user' : 'environment';
    navigator.mediaDevices.getUserMedia({ video: { facingMode } })
      .then(cameraStream => {
        stream = cameraStream;
        videoElement.srcObject = cameraStream;
      })
      .catch(handleCameraError);
  }

  function alternarCamara() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    isFrontCamera = !isFrontCamera;
    initCameraAccess(videoElement, isFrontCamera);
  }
    // Capturar imagen de video
    function capturarImagen(videoElement, canvas) {
      const context = canvas.getContext('2d');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      canvas.style.display = 'none';
      return canvas.toDataURL("image/jpeg");
    }
  
    function crearFormData(file) {
      const formData = new FormData();
      formData.append('file', file);
      return formData;
    }

      // Enviar imagen al API repetidamente hasta obtener una respuesta
  function iniciarReconocimientoFacial() {
    videoElement.style.display = 'block';
    canvas.style.display = 'none';
    searchEstudianteBtn.style.display = 'none';
    realizarReconocimientoFacial();
  }

  function realizarReconocimientoFacial() {
    let intentos = 0;
    let coincidencias = [];

    function enviarFoto() {
      if (intentos < maxIntentos) {
        const imagenURI = capturarImagen(videoElement, canvas);
        const file = dataURItoFile(imagenURI, 'photo.jpg');
        const formData = crearFormData(file);
        mostrarSpinner(true);
        fetch(API_URL + '/estudiante/reconocimiento-facial', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + getCookie('jwt') },
          body: formData
        })
        .then(response => manejarRespuesta(response, coincidencias, umbralSimilitud, minCoincidencias))
        .then(data => procesarDatos(data, coincidencias, minCoincidencias))
        .catch(handleFetchError)
        .finally(() => {
          intentos++;
          if (!coincidenciaCompleta(coincidencias, minCoincidencias)) {
            enviarFoto();
          } else {
            canvas.style.display = 'block';
            videoElement.style.display = 'none';
          }
        });
      } else {
        mostrarMensajeEstudianteNoEncontrado();
      }
    }

    if (!coincidenciaCompleta(coincidencias, minCoincidencias)) {
      enviarFoto();
    } else {
      canvas.style.display = 'block';
      videoElement.style.display = 'none';
    }
  }

    // Manejar respuesta de la API
    function manejarRespuesta(response, coincidencias, umbralSimilitud, minCoincidencias) {
      handleUnauthorized(response);
      if (response.status === 404) {
        return null;
      } else if (response.ok) {
        return response.json();
      } else {
        throw new Error('Error en la solicitud');
      }
    }
  
    function procesarDatos(data, coincidencias, minCoincidencias) {
      if (data) {
        const similitud = data.Similitud || 0;
        if (similitud >= umbralSimilitud) {
          actualizarCoincidencias(coincidencias, data);
          actualizarBarraProgreso(coincidencias, minCoincidencias);
        }
        if (coincidenciaCompleta(coincidencias, minCoincidencias)) {
          mostrarResultadoEstudiante(coincidencias);
        }
      }
    }
  
    function actualizarCoincidencias(coincidencias, data) {
      coincidenciaExistente = coincidencias.find(obj => obj.idEstudiante === data.idEstudiante);
      if (coincidenciaExistente) {
        coincidenciaExistente.numCoincidencia = (coincidenciaExistente.numCoincidencia || 1) + 1;
      } else {
        data.numCoincidencia = 1;
        coincidencias.push(data);
      }
    }
  
    function actualizarBarraProgreso(coincidencias, minCoincidencias) {
      const coincidenciaMaxima = coincidencias.reduce((max, obj) => {
        return obj.numCoincidencia > (max.numCoincidencia || 0) ? obj : max;
      }, {});
  
      const maxCoincidencias = coincidenciaMaxima.numCoincidencia || 0;
      const porcentajeActual = (maxCoincidencias / minCoincidencias) * 100;
      barraProgreso.style.width = `${(porcentajeActual / 100) * anchoBarraMax}px`;
      porcentajeProgreso.textContent = `${Math.round(porcentajeActual)}%`;
      if (maxCoincidencias < minCoincidencias / 2) {
        mensajeProgreso.textContent = 'Intento de reconocimiento en curso...';
      } else if (maxCoincidencias >= minCoincidencias / 2 && maxCoincidencias < minCoincidencias) {
        mensajeProgreso.textContent = 'Ya casi hemos terminado';
      }
    }
  
    function coincidenciaCompleta(coincidencias, minCoincidencias) {
      mostrarSpinner(false);
      for (let obj of coincidencias) {
        if (obj.numCoincidencia === minCoincidencias) {
          return obj;
        }
      }
      return null;
    }
  
    function mostrarResultadoEstudiante(coincidencias) {
      mensajeProgreso.textContent = 'Identificación completada';
      const estudiante = coincidencias.find(obj => obj.numCoincidencia >= minCoincidencias);
      const mensaje = `Nombres: ${estudiante.Nombres || 'No disponible'}<br>Código: ${estudiante.codigoEstudiante || 'No disponible'}`;
      resultadoEstudiante.innerHTML = mensaje;
      resultadoEstudiante.style.display = 'block';
      nextBtn.style.display = 'inline-block';
      retryBtn.style.display = 'inline-block';
      datosEstudiante = {
        type: 'EstudianteData',
        payload: {
          id: estudiante.idEstudiante || 'No disponible',
          nombre: estudiante.Nombres || 'No disponible',
          codigo: estudiante.codigoEstudiante || 'No disponible',
          similitud: estudiante.Similitud || 'No disponible',
        }
      };
    }
  
    function mostrarMensajeEstudianteNoEncontrado() {
      spinnerObjeto.style.display = 'none';
      retryBtn.style.display = 'inline-block';
      mensajeProgreso.textContent = 'No se pudo Identificar al Estudiante';
      resultadoEstudiante.innerHTML = 'Estudiante no encontrado';
    }
  
    // Funciones de utilidad y manejo de errores
    function reiniciarBusqueda() {
      mensajeProgreso.textContent = 'Sin Resultados ...';
      mostrarSpinner(false);
      nextBtn.style.display = 'none';
      videoElement.style.display = 'block';
      canvas.style.display = 'none';
      searchEstudianteBtn.style.display = 'inline-block';
      retryBtn.style.display = 'none';
      resultadoEstudiante.innerHTML = 'Esperando Busqueda ....';
      datosEstudiante = null;
      barraProgreso.style.width = '0px';
      porcentajeProgreso.textContent = '0%';
    }
  
    function mostrarSpinner(show) {
      spinnerObjeto.style.display = show ? 'flex' : 'none';
    }
  
    function enviarDatosYCerrar() {
      if (datosEstudiante) {
        window.opener.postMessage(datosEstudiante, '*');
        window.close();
      }
    }
  
    function handleCameraError(error) {
      console.error('Error al acceder a la cámara web:', error);
    }
  
    function handleFetchError(error) {
      console.error('Error al enviar los datos:', error);
    }
  });
  



