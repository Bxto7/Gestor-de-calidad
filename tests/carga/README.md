# Pruebas de carga (k6)

`CLAUDE.md` §6.4 sitúa estas pruebas **solo en Staging**, nunca en producción y nunca en cada
PR de CI: son demasiado costosas y ruidosas para eso. Lo que validan es el RNF de §3.4
—generación de documentos por debajo de 5 s— y los tiempos de respuesta bajo concurrencia.

## Estado honesto

**Todavía no se han ejecutado contra Staging, porque Staging no existe.** El despliegue del
§5 está pendiente. Sí se han ejecutado contra el entorno de desarrollo local, lo que sirve
para detectar regresiones groseras y para dejar los scripts probados el día que haya dónde
correrlos — pero **no** vale como validación del RNF: una máquina de desarrollo no tiene el
perfil de recursos de un CPX21 con PostgreSQL, Redis, la API y el worker compartiendo 3 vCPU.

### Última ejecución en local — 25 de agosto de 2026

Contra el plan ISI 2018 (74 asignaturas, 10 ciclos):

| Métrica | Resultado | Umbral |
|---|---|---|
| `consultas.js` — p(95) de respuesta | **104 ms** | < 800 ms |
| `consultas.js` — panel estadístico p(95) | **86 ms** | < 1500 ms |
| `consultas.js` — errores | **0 de 1372** | < 1 % |
| `documentos.js` — extremo a extremo p(95) | **942 ms** | < 5000 ms |
| `documentos.js` — solo encolar p(95) | **73 ms** | < 500 ms |
| `documentos.js` — documentos fallidos | **0** | 0 |

Con 15 usuarios concurrentes en el primero y 6 documentos/minuto en el segundo. El margen
sobre el RNF es de unas cinco veces, pero medido donde no aprieta: el número que cuenta es el
que salga del VPS.

## Antes de ejecutar

Dos ajustes, y los dos importan:

1. **Subir el límite de peticiones.** §4.4 fija 120 req/min por IP. Con eso, k6 mide el rate
   limiter y no la aplicación: a los pocos segundos todo son 429. Arrancar la API con
   `THROTTLE_LIMIT=10000`.
2. **Datos cargados.** Los scripts necesitan al menos un plan con asignaturas. En local,
   `npx tsx scripts/cargar-plan-isi-2018.ts`.

Y el worker tiene que estar corriendo (`npm run start:worker`), o los documentos se quedarán
encolados para siempre y el script reportará el timeout — que es, de hecho, una comprobación
útil por sí sola.

## Ejecutar

k6 no hace falta instalarlo; la imagen oficial basta. Los scripts comparten `comun.js`, así
que hay que **montar el directorio**: pasarlos por stdin (`k6 run -`) no resolvería el import.

```bash
# Consultas bajo concurrencia
docker run --rm \
  -v "$(pwd)/tests/carga:/scripts" \
  --add-host=host.docker.internal:host-gateway \
  -e BASE_URL=http://host.docker.internal:3000/api/v1 \
  -e EMAIL=directora@sgc.local -e PASSWORD='...' \
  grafana/k6 run /scripts/consultas.js

# El RNF de generación de documentos
docker run --rm \
  -v "$(pwd)/tests/carga:/scripts" \
  --add-host=host.docker.internal:host-gateway \
  -e BASE_URL=http://host.docker.internal:3000/api/v1 \
  -e EMAIL=directora@sgc.local -e PASSWORD='...' \
  grafana/k6 run /scripts/documentos.js
```

La contraseña va por variable de entorno y no como argumento: los argumentos quedan en el
historial del shell y en la lista de procesos.

Contra Staging, `BASE_URL` apunta a su dominio y se quita `--add-host`.

## Qué mide cada script

| Script | Qué valida | Umbral que hace fallar la prueba |
|---|---|---|
| `consultas.js` | Lectura bajo concurrencia: detalle de plan, malla, búsqueda global, panel | p(95) < 800 ms, menos de 1 % de errores |
| `documentos.js` | RNF §3.4: del clic a la descarga | p(95) < 5 s de extremo a extremo, 0 fallos de generación |

Los umbrales están en el propio script (`thresholds`), así que k6 sale con código distinto de
cero cuando no se cumplen: sirve como puerta de calidad, no solo como informe para mirar.

## Un hallazgo de la primera ejecución

Preparar estas pruebas destapó un fallo que no era de rendimiento sino de configuración: la
aplicación no declaraba `trust proxy`, así que Express tomaba como IP del cliente la del
socket. Detrás de Caddy (§5.2) esa es siempre la de Caddy, y el rate limiting de §4.4 —120
peticiones y 5 inicios de sesión por minuto— habría pasado de ser **por persona** a ser **por
instalación**: cinco personas entrando a primera hora habrían bloqueado al resto de la
universidad.

Se corrigió con `TRUST_PROXY`, que es el número de saltos de proxy y no un `true`. Confiar sin
contarlos permite falsificar `X-Forwarded-For` y saltarse el límite del login eligiendo una IP
distinta en cada intento — justo lo que ese límite existe para impedir. Comprobado en las dos
direcciones: con `TRUST_PROXY=0` la cabecera se ignora y no hay forma de esquivar el límite;
con `TRUST_PROXY=1` cada usuario tras el proxy tiene su propio cubo y el mismo repetido sí se
corta.

**En el VPS hay que poner `TRUST_PROXY=1`.**
