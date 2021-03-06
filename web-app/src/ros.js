// -------------------------------------------------------
// Autores: Luis Belloch, Adrian Maldonado
// Fecha: 20/03/2022
// Descripcion: Este archivo es el que se encarga de la comunicacion con el servidor y el
// robot
// -------------------------------------------------------

//---------ROS-----------
let conn_data = {
  // ros connection
  ros: null,
  rosbridge_address: "ws://127.0.0.1:9090/",
  connected: false,
};

//---------TOPICS-----------
var goal_pose = new ROSLIB.Topic({
  ros: null,
  name: "/goal_pose",
  messageType: "geometry_msgs/msg/PoseStamped",
});
var odom = new ROSLIB.Topic({
  ros: null,
  name: "/odom",
  messageType: "nav_msgs/msg/Odometry",
});

// DOCS: http://docs.ros.org/en/noetic/api/sensor_msgs/html/msg/Image.html
var camera = new ROSLIB.Topic({
  ros: null,
  name: "/camera/image_raw",
  messageType: "sensor_msgs/msg/Image",
});

var analizar = new ROSLIB.Topic({
  ros: null,
  name: "/analizar",
  messageType: "std_msgs/msg/String",
});

var resultado = new ROSLIB.Topic({
  ros: null,
  name: "/resultado",
  messageType: "std_msgs/msg/String",
});

// Guarda la imagen actual de la camara
var imagen_camara = null;
var imagen_anterior = null;
// Guarda las imagenes hasta que termine la ruta y las envia al final
var images_data = {
  images: [],
};

var resultado_analisis = "";

//---------ROBOS-----------
let robos_x = 0;
let robos_y = 0;

let limite_mapa_x = 1.9;
let limite_mapa_y = 2.1;

let destino_x = 0;
let destino_y = 0;

let checkpoints = [];
let checkpoint_actual = 0;
let seguir = true;
let tiempo_espera = 2000;

let dibujar_disponible = true;

var fotos_necesarias = 0;
var fotos_hechas = 0;
let canvas;
let ctx;

document.addEventListener("DOMContentLoaded", (event) => {
  console.log("entro en la pagina");

  /* Imagen del canvas */
  let mapStatus = document.getElementById("map-status");
  canvas = document.getElementById("map-canvas");
  ctx = canvas.getContext("2d");
  let image = new Image();
  // -------------------------------------------
  // Cambiar esta parte para meter otra imagen
  image.src = "img/my_map.png";
  // -------------------------------------------
  image.onload = function () {
    drawImageScaled(image, ctx);

    /* Activar circulo */
    mapStatus.classList.add("circle-green");
    mapStatus.classList.remove("circle-red");
  };
  /**
   * Dibuja en el mapa la trayectoria seguida por el robot
   */
  function dibujar() {
    if (dibujar_disponible) {
      dibujar_disponible = false;
      setTimeout(function () {
        dibujar_disponible = true;
        let pos = relativePosRobot(robos_x, robos_y, ctx.canvas);
        //console.log(pos)
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 6, 0, 2 * Math.PI);

        ctx.stroke();
      }, 300);
    }
  }

  /* BOTONES */
  // Conectar a ROS
  var botonConectar = document.getElementById("btn-con");
  // Asigna la funcion connect al boton de conectar
  botonConectar.addEventListener("click", connect);
  // Enviar datos a firebase
  var botonEnviar = document.getElementById("btn-send");
  // Asigna la funcion senData al boton de enviar
  botonEnviar.addEventListener("click", sendRosData);
  // Recoger datos de firebase
  var botonDescargar = document.getElementById("btn-fetch");
  // Asigna la funcion senData al boton de enviar
  botonDescargar.addEventListener("click", fetchRosData);

  // Se asigna cuando se usa, se guarda aqui como global para poder usarla en las funciones
  var idSlot = 0;

  // Comprueba cookies para la pagina
  checkCookies();

  /**
   * Se conecta a ROS por un websocket
   */
  function connect() {
    console.log("Clic en connect");

    conn_data.ros = new ROSLIB.Ros({
      url: conn_data.rosbridge_address,
    });

    goal_pose.ros = conn_data.ros;
    odom.ros = conn_data.ros;
    camera.ros = conn_data.ros;
    analizar.ros = conn_data.ros;
    resultado.ros = conn_data.ros;

    // TODO: mostrar que se ha conectado cambiado el circulo de color y cambiando de
    // boton conectar a desconectar

    // Define callbacks
    conn_data.ros.on("connection", () => {
      conn_data.connected = true;
      //mover()
      console.log("Conexion con ROSBridge correcta");
    });
    conn_data.ros.on("data", (result) => {
      console.log("Se ha producido algun result");
      console.log(result);
    });
    conn_data.ros.on("error", (error) => {
      console.log(
        "Se ha producido algun error mientras se intentaba realizar la conexion"
      );
      console.log(error);
    });
    conn_data.ros.on("close", () => {
      conn_data.connected = false;
      console.log("Conexion con ROSBridge cerrada");
    });

    odom.subscribe(function (message) {
      robos_x = -message.pose.pose.position.x;
      robos_y = -message.pose.pose.position.y;
      //console.log(message)
      dibujar();
    });
    // TOPIC RESULTADO IA (analizar)
    resultado.subscribe(function (message) {
      console.log(message.data);
      campos = [message.data[2], message.data[5], message.data[8]];
      console.log(campos);

      if (campos[0] == "1") {
        resultado_analisis = "llave-abierta";
      } else if (campos[1] == "1") {
        resultado_analisis = "llave-cerrada";
      } else if (campos[2] == "1") {
        resultado_analisis = "no-llave";
      } else {
        console.log("Error al establecer resultado");
      }
    });
    // Dibuja en el canvas la imagen recibida por el topic
    camera.subscribe(function (message) {
      //console.log(message.data)
      let msg_data = message.data;
      // msg_data es un array de bytes
      let arr = new Uint8ClampedArray(msg_data.length);
      let image = new ImageData(arr, 480);
      image.data = arr;
      //console.log(msg_data)
      // Iterate through every pixel
      for (let i = 0; i < image.data.length; i += 4) {
        image.data[i] = msg_data[i];
        image.data[i + 1] = msg_data[i + 1];
        image.data[i + 2] = msg_data[i + 2];
        image.data[i + 3] = 255;
      }

      ctx.putImageData(image, 0, 0);
      //console.log(image)
      imagen_camara = image;
    });
  }
  /**
   * Obtiene datos desde firebase
   */
  function fetchRosData() {
    // Guarda cookies con la ID de conexion para no tener que ponerla cada vez
    document.cookie = "ros_id=" + idSlot + ";";

    var requestOptions = {
      method: "GET",
      redirect: "follow",
    };

    fetch(Constants.url + `123456789-web.json`, requestOptions)
      .then((response) => response.json())
      .then((result) => {
        console.log(result);
        try {
          result.msg.forEach((element) => {
            //console.log(element.tipo)
            if (element.tipo == "ruta") {
              element.posiciones.forEach((pos) => {
                pos.tipo = "ruta";
                pos.z = 0.0;
                checkpoints.push(pos);
              });
            } else if (element.tipo == "foto") {
              let pos = {};
              pos.x = element.posicion.x;
              pos.y = element.posicion.y;

              let z = Math.atan(
                element.orientacion.y - element.posicion.y,
                element.orientacion.x - element.posicion.x
              );
              pos.z = z;
              pos.tipo = "foto";
              checkpoints.push(pos);

              fotos_necesarias++;
            }
          });

          console.log(checkpoints);
          seguir = true;
          // Toma los valores del mensaje
          //destino_x = result.msg[0].posiciones[0].x;
          //destino_y = result.msg[0].posiciones[0].y;
          // Crea el mensaje goal pose recibido desde Firebase
          //var mensaje = generarMensajeGoalPose(destino_x/100*1.9, destino_y/100*2.1)
          //console.log(mensaje)
          //goal_pose.publish(mensaje);
          // Inicia la ruta
          nextCheckpoint();
        } catch (error) {
          console.error(error);
        }
      })
      .catch((error) => console.error(error));
  }
});

/**
 * Genera un mensaje de ROSLIB para el Goal Pose
 * @param {num} x posicion objetivo
 * @param {num} y posicion objetivo
 * @returns ROSLIB.Message
 */
function generarMensajeGoalPose(x, y, z) {
  let mensaje = new ROSLIB.Message({
    header: {
      stamp: {
        sec: 1649056173,
        nanosecs: 274857925,
      },
      frame_id: "map",
    },
    pose: {
      position: {
        x: x,
        y: y,
        z: 0.0,
      },
      orientation: {
        x: 0.0,
        y: 0.0,
        z: z,
        w: 0.8,
      },
    },
  });

  return mensaje;
}

function nextCheckpoint() {
  setTimeout(function () {
    if (seguir) {
      let checkpoint = checkpoints[checkpoint_actual];
      destinoAlcanzado(checkpoint);
      nextCheckpoint();
    }
  }, tiempo_espera);
}

/**
 *
 * @param {*} px
 * @param {*} py
 * @param {*} element
 * @returns
 */
function relativePosRobot(px, py, element) {
  var rect = element.getBoundingClientRect();

  return {
    x: Math.floor((px * rect.width) / limite_mapa_x),
    y: Math.floor((py * rect.height) / limite_mapa_y),
  };
}

/**
 * Se llama cuando el goal pose ha sido alcanzado
 * @param {*} x
 * @param {*} y
 */
function destinoAlcanzado(checkpoint) {
  if (checkpoint_actual >= checkpoints.length) {
    //console.log("fin")
    seguir = false;
    checkpoints = [];
    checkpoint_actual = 0;
    return;
  }
  //console.log(checkpoint)
  //console.log(checkpoint_actual)

  if (checkpoint.tipo == "ruta") {
    tiempo_espera = 2000;
    destino_x = (checkpoint.x / 100) * limite_mapa_x;
    destino_y = (checkpoint.y / 100) * limite_mapa_y;

    checkpoint_actual++;
    goal_pose.publish(
      generarMensajeGoalPose(destino_x, destino_y, checkpoint.z)
    );
    //console.log("llegadisimo")
    //checkpoint_actual++
  } else if (checkpoint.tipo == "foto") {
    console.log("foto");
    destino_x = (checkpoint.x / 100) * limite_mapa_x;
    destino_y = (checkpoint.y / 100) * limite_mapa_y;

    checkpoint_actual++;
    analizar.publish({ data: "a" });
    
    tiempo_espera = 5000;
    goal_pose.publish(
      generarMensajeGoalPose(destino_x, destino_y, checkpoint.z)
    );
    guardarFoto(imagen_camara);
    //console.log("llegadisimo")
    //checkpoint_actual++

    // TODO: mostrar destino alcanzado
  }

  // Si es el ultimo checkpoint envia las fotos a firebase
  if (checkpoint_actual == checkpoints.length - 1) {
    sendRosData(images_data);
  }
}

/**
 * Guarda la imagen actual en el canvas
 */
function guardarFoto(img) {
  setTimeout(function () {
    if (resultado_analisis == "") {
      guardarFoto(img);
      console.log("aa");
    } else {
      canvas.src = img;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.putImageData(img, 0, 0);
      var dataURL = canvas.toDataURL("image/png");
      imagen_url = dataURL;

      if (imagen_url != null) {
        images_data.images.push({
          img: imagen_url,
          label: resultado_analisis,
        });

        resultado_analisis = "";
      }
      fotos_hechas++;
      console.log(fotos_hechas + " fotos de " + fotos_necesarias);
      console.log(images_data);
    }
  }, 300);
}

/**
 * Crea el objeto de datos para enviar a Firebase
 */
function sendRosData(data_send) {
  setTimeout(function () {
    if (fotos_hechas >= fotos_necesarias) {
      console.log("Clic en sendROSData");
      console.log(data_send);

      idSlot = document.getElementById("id-slot").value; // string

      let jsonMsg = {
        time: new Date().getTime(),
        connection_data: conn_data,
        msg: data_send,
      };

      // Guarda cookies con la ID de conexion para no tener que ponerla cada vez
      document.cookie = "ros_id=" + idSlot + ";";

      putData(idSlot, jsonMsg);
    } else {
      sendRosData(data_send);
    }
  }, 300);
}
