(() => {
  "use strict";

  /* ============================================================
   *  1. ESCENA BASE
   * ============================================================ */
  const canvas = document.getElementById("escena");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.z = 10;

  /* ============================================================
   *  2. SHADERS DE PARTÍCULAS
   *     Cada partícula tiene una posición "casa" (forma original)
   *     y una posición "dispersa" (galaxia). uSpread las mezcla.
   * ============================================================ */
  const vertexShader = `
    attribute vec3 aScatter;
    attribute float aSize;
    attribute float aSeed;
    uniform float uSpread;
    uniform float uTime;
    uniform float uPixel;
    varying float vAlpha;
    varying float vMix;
    void main() {
      vec3 p = mix(position, aScatter, uSpread);
      p += 0.035 * vec3(
        sin(uTime * 1.3 + aSeed * 20.0),
        cos(uTime * 1.1 + aSeed * 31.0),
        sin(uTime * 0.9 + aSeed * 17.0)
      ) * (0.5 + uSpread * 2.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uPixel * (14.0 / -mv.z);
      vAlpha = 0.6 + 0.4 * sin(uTime * 2.0 + aSeed * 40.0);
      vMix = uSpread;
    }
  `;

  const fragmentShader = `
    uniform vec3 uColor;
    uniform vec3 uColor2;
    varying float vAlpha;
    varying float vMix;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.05, d) * vAlpha;
      vec3 c = mix(uColor, uColor2, vMix * 0.75);
      gl_FragColor = vec4(c, a);
    }
  `;

  const materiales = [];

  function crearPuntos(home, scatter, color, color2, tamano) {
    const n = home.length / 3;
    const geo = new THREE.BufferGeometry();
    const sizes = new Float32Array(n);
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      sizes[i] = tamano * (0.7 + Math.random() * 0.8);
      seeds[i] = Math.random();
    }
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(home), 3));
    geo.setAttribute("aScatter", new THREE.BufferAttribute(new Float32Array(scatter), 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSpread: { value: 0 },
        uTime: { value: 0 },
        uPixel: { value: renderer.getPixelRatio() },
        uColor: { value: new THREE.Color(color) },
        uColor2: { value: new THREE.Color(color2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    materiales.push(mat);
    const puntos = new THREE.Points(geo, mat);
    puntos.frustumCulled = false;
    return puntos;
  }

  /* ============================================================
   *  3. GENERADORES DE FORMAS
   * ============================================================ */

  // Planeta: anillos de latitud -> se ve como círculos concéntricos desde el polo
  function formaPlaneta(R = 2.2, anillos = 40) {
    const pts = [];
    for (let i = 1; i < anillos; i++) {
      const phi = (Math.PI * i) / anillos;
      const r = Math.sin(phi) * R;
      const y = Math.cos(phi) * R;
      const n = Math.max(6, Math.floor(r * 30));
      for (let j = 0; j < n; j++) {
        const t = (j / n) * Math.PI * 2;
        pts.push(r * Math.cos(t), y, r * Math.sin(t));
      }
    }
    pts.push(0, R, 0, 0, -R, 0);
    return pts;
  }

  // Anillo tipo Saturno: varias bandas finas de puntos
  function formaAnillo(r0 = 3.1, r1 = 4.6, bandas = 6) {
    const pts = [];
    for (let b = 0; b < bandas; b++) {
      const r = r0 + ((r1 - r0) * b) / (bandas - 1);
      const n = Math.floor(r * 80);
      for (let j = 0; j < n; j++) {
        const t = (j / n) * Math.PI * 2;
        pts.push(r * Math.cos(t), (Math.random() - 0.5) * 0.03, r * Math.sin(t));
      }
    }
    return pts;
  }

  // Abanico: radios + arcos (la figura pequeña a un lado del planeta)
  function formaAbanico(largo = 1.6) {
    const pts = [];
    const aMin = -Math.PI / 4.5;
    const aMax = Math.PI / 4.5;
    const radios = 6;
    for (let k = 0; k < radios; k++) {
      const ang = aMin + ((aMax - aMin) * k) / (radios - 1);
      for (let s = 0; s <= 28; s++) {
        const r = (s / 28) * largo;
        pts.push(Math.sin(ang) * r, Math.cos(ang) * r, 0);
      }
    }
    [0.6, 0.95, 1.3, largo].forEach((r) => {
      const n = Math.floor(r * 40);
      for (let j = 0; j <= n; j++) {
        const ang = aMin + ((aMax - aMin) * j) / n;
        pts.push(Math.sin(ang) * r, Math.cos(ang) * r, 0);
      }
    });
    return pts;
  }

  // Posición aleatoria dentro de una galaxia espiral (destino al dispersar)
  function posGalaxia() {
    const brazos = 3;
    const brazo = Math.floor(Math.random() * brazos);
    const r = Math.pow(Math.random(), 0.65) * 10 + 0.4;
    const ang = (brazo / brazos) * Math.PI * 2 + r * 0.55 + (Math.random() - 0.5) * 0.7;
    const alto = (Math.random() - 0.5) * 0.9 * (1 - r / 11);
    return [Math.cos(ang) * r, alto, Math.sin(ang) * r];
  }

  function dispersion(home) {
    const out = [];
    for (let i = 0; i < home.length / 3; i++) out.push(...posGalaxia());
    return out;
  }

  /* ============================================================
   *  4. ARMAR EL SISTEMA
   * ============================================================ */
  const sistema = new THREE.Group();
  scene.add(sistema);

  const homePlaneta = formaPlaneta();
  sistema.add(crearPuntos(homePlaneta, dispersion(homePlaneta), 0x2ee6ff, 0xb36bff, 2.0));

  const grupoAnillo = new THREE.Group();
  grupoAnillo.rotation.set(0.45, 0, -0.35);
  const homeAnillo = formaAnillo();
  grupoAnillo.add(crearPuntos(homeAnillo, dispersion(homeAnillo), 0x8ff6ff, 0xff7ad9, 1.6));
  sistema.add(grupoAnillo);

  const homeAbanico = formaAbanico().map((v, i) => (i % 3 === 0 ? v + 5.2 : i % 3 === 1 ? v - 2.2 : v));
  sistema.add(crearPuntos(homeAbanico, dispersion(homeAbanico), 0x5fb8ff, 0xffb86b, 1.7));

  // Polvo de estrellas de fondo (no se dispersa)
  const estrellasHome = [];
  for (let i = 0; i < 3500; i++) {
    const r = 18 + Math.random() * 70;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    estrellasHome.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
  }
  const estrellas = crearPuntos(estrellasHome, estrellasHome, 0x9fd0ff, 0xffffff, 1.1);
  scene.add(estrellas);

  /* ============================================================
   *  5. ESTADO + ANIMACIÓN
   * ============================================================ */
  const estado = {
    zoom: 1, zoomObj: 1,
    spread: 0, spreadObj: 0,
    rotX: 0.3, rotXObj: 0.3,
    rotY: 0, rotYObj: 0,
    hayMano: false,
  };

  let arrastrando = false;
  let ultimoX = 0, ultimoY = 0;

  const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
  const mapear = (v, a1, b1, a2, b2) => a2 + ((v - a1) / (b1 - a1)) * (b2 - a2);
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

  const reloj = new THREE.Clock();

  function animar() {
    requestAnimationFrame(animar);
    const dt = reloj.getDelta();
    const t = reloj.elapsedTime;

    if (!estado.hayMano && !arrastrando) estado.rotYObj += dt * 0.12; // giro automático

    estado.zoom += (estado.zoomObj - estado.zoom) * 0.12;
    estado.spread += (estado.spreadObj - estado.spread) * 0.06;
    estado.rotX += (estado.rotXObj - estado.rotX) * 0.1;
    estado.rotY += (estado.rotYObj - estado.rotY) * 0.1;

    sistema.scale.setScalar(estado.zoom);
    sistema.rotation.set(estado.rotX, estado.rotY, 0);
    estrellas.rotation.y += dt * 0.01;

    materiales.forEach((m) => {
      m.uniforms.uTime.value = t;
      // las estrellas no se dispersan
      if (m !== estrellas.material) m.uniforms.uSpread.value = estado.spread;
    });

    renderer.render(scene, camera);
  }
  animar();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ============================================================
   *  6. RATÓN / TECLADO (por si no hay cámara)
   * ============================================================ */
  canvas.addEventListener("pointerdown", (e) => {
    arrastrando = true; ultimoX = e.clientX; ultimoY = e.clientY;
  });
  window.addEventListener("pointerup", () => (arrastrando = false));
  window.addEventListener("pointermove", (e) => {
    if (!arrastrando || estado.hayMano) return;
    estado.rotYObj += (e.clientX - ultimoX) * 0.006;
    estado.rotXObj = limitar(estado.rotXObj + (e.clientY - ultimoY) * 0.006, -1.5, 1.5);
    ultimoX = e.clientX; ultimoY = e.clientY;
  });
  window.addEventListener("wheel", (e) => {
    if (estado.hayMano) return;
    estado.zoomObj = limitar(estado.zoomObj - e.deltaY * 0.001, 0.4, 3.2);
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !estado.hayMano) {
      estado.spreadObj = estado.spreadObj > 0.5 ? 0 : 1;
      e.preventDefault();
    }
  });

  /* ============================================================
   *  7. CONTROL CON LAS MANOS (MediaPipe Hands)
   * ============================================================ */
  const video = document.getElementById("video");
  const lmCanvas = document.getElementById("landmarks");
  const lmCtx = lmCanvas.getContext("2d");
  const contenedorCam = document.getElementById("camara");
  const btn = document.getElementById("btnIniciar");
  const txtEstado = document.getElementById("estado");

  const CONEXIONES = [
    [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17],
  ];

  function dibujarManos(manos) {
    lmCtx.clearRect(0, 0, lmCanvas.width, lmCanvas.height);
    const w = lmCanvas.width, h = lmCanvas.height;
    manos.forEach((m) => {
      lmCtx.strokeStyle = "rgba(95, 230, 255, 0.9)";
      lmCtx.lineWidth = 2;
      CONEXIONES.forEach(([a, b]) => {
        lmCtx.beginPath();
        lmCtx.moveTo(m[a].x * w, m[a].y * h);
        lmCtx.lineTo(m[b].x * w, m[b].y * h);
        lmCtx.stroke();
      });
      lmCtx.fillStyle = "#ffffff";
      m.forEach((p) => {
        lmCtx.beginPath();
        lmCtx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
        lmCtx.fill();
      });
    });
  }

  // ¿Dedo extendido? (la punta está más lejos de la muñeca que la articulación media)
  const extendido = (m, punta, pip) => dist(m[0], m[punta]) > dist(m[0], m[pip]) * 1.08;

  function alRecibirManos(resultados) {
    const manos = resultados.multiHandLandmarks || [];
    dibujarManos(manos);

    if (manos.length === 0) {
      estado.hayMano = false;
      txtEstado.textContent = "No veo ninguna mano. Colócala frente a la cámara.";
      return;
    }
    estado.hayMano = true;
    const m = manos[0];

    // --- Rotación: posición de la palma (la cámara está en espejo) ---
    const palma = m[9];
    estado.rotYObj = (0.5 - palma.x) * Math.PI * 1.8;
    estado.rotXObj = limitar((palma.y - 0.5) * Math.PI * 0.9 + 0.3, -1.4, 1.4);

    // --- Zoom ---
    if (manos.length >= 2) {
      // dos manos: distancia entre palmas
      const d = dist(manos[0][9], manos[1][9]);
      estado.zoomObj = limitar(mapear(d, 0.1, 0.7, 0.45, 3.2), 0.4, 3.2);
      txtEstado.textContent = "Dos manos: zoom por distancia entre ellas.";
    } else {
      const tamPalma = dist(m[0], m[9]) || 0.001;
      const pinza = dist(m[4], m[8]) / tamPalma;
      // el zoom solo se actualiza si el índice está extendido (así un puño no lo encoge)
      if (extendido(m, 8, 6)) {
        estado.zoomObj = limitar(mapear(pinza, 0.15, 1.6, 0.5, 3.2), 0.4, 3.2);
      }
      txtEstado.textContent = "Mano detectada · zoom ×" + estado.zoomObj.toFixed(1);
    }

    // --- Dispersión: dedos medio, anular y meñique ---
    let abiertos = 0;
    if (extendido(m, 12, 10)) abiertos++;
    if (extendido(m, 16, 14)) abiertos++;
    if (extendido(m, 20, 18)) abiertos++;
    estado.spreadObj = abiertos / 3;
  }

  let hands = null;
  let procesando = false;

  async function iniciarCamara() {
    btn.disabled = true;
    btn.textContent = "Cargando…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();

      lmCanvas.width = video.videoWidth || 640;
      lmCanvas.height = video.videoHeight || 480;

      hands = new Hands({
        locateFile: (f) => "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/" + f,
      });
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
      hands.onResults(alRecibirManos);

      contenedorCam.classList.add("activa");
      btn.classList.add("oculto");
      txtEstado.textContent = "Cámara activa. Muestra tu mano.";

      const bucle = async () => {
        if (video.readyState >= 2 && !procesando) {
          procesando = true;
          try { await hands.send({ image: video }); } catch (e) { console.error(e); }
          procesando = false;
        }
        requestAnimationFrame(bucle);
      };
      bucle();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = "Activar cámara";
      txtEstado.textContent =
        "No se pudo abrir la cámara. Revisa los permisos (necesita https o localhost).";
    }
  }

  btn.addEventListener("click", iniciarCamara);
})();
