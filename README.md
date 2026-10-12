# Rutina

App de Android para llevar tu rutina diaria, tus estudios y tus metas. Está hecha con
[Capacitor](https://capacitorjs.com/): las pantallas son una página web (`www/`) que corre
dentro de la app, y lo que la web no alcanza (alarmas, calendario, archivos) es código de Android.

Todo se guarda en el teléfono. No hay servidor.

## Qué hay en cada carpeta

- `www/`: la app (HTML, CSS y JavaScript). Casi todo cambio se hace aquí.
- `android/`: el proyecto de Android. El código nativo propio está en
  `android/app/src/main/java/com/rutina/diaria/`:
  - `Alarmas.java`, `AlarmasPlugin.java` y sus receptores: alarmas de verdad (sonido de alarma que se
    repite hasta que respondes, pantalla completa con el teléfono bloqueado, botones Listo / Posponer /
    Apagar) y recordatorios de tareas y exámenes. Se vuelven a programar solas al reiniciar el teléfono.
    Cada hábito, imprevisto o tarea elige su aviso (nada, notificación o alarma) y su vibración; como
    Android fija la vibración por canal de notificación, hay un canal por cada combinación que se usa.
  - `AlarmaActivity.java` es la pantalla de la alarma.
  - `CalendarioPlugin.java` lee y escribe el calendario del teléfono, que es donde vive tu Google Calendar
    (también eventos que se repiten, para los hábitos con hora). Lee las columnas por nombre y, si el
    fabricante cambió el proveedor de calendario (pasa en Xiaomi), reintenta con consultas más simples y
    devuelve el motivo exacto del error. La app compara sus eventos con cómo están en el teléfono para
    traer lo que cambies o borres en Google Calendar.
  - `SistemaPlugin.java` pinta las barras del sistema, guarda la copia de seguridad y comparte texto.

## Compilar el APK

Necesitas Node 20 o más nuevo, JDK 21 y el Android SDK (plataforma 35).

```sh
npm install
npm run apk
```

El APK queda en `android/app/build/outputs/apk/release/app-release.apk`.

### La clave de firma

La clave **no** está en este repositorio, porque es público. Para que Android deje instalar
una versión nueva encima de la anterior, todas se firman con la misma clave
(`rutina-firma.keystore`). Crea `android/keystore.properties` (Git lo ignora):

```properties
storeFile=/ruta/a/rutina-firma.keystore
storePassword=...
keyAlias=rutina
keyPassword=...
```

Sin ese archivo el APK sale sin firmar y Android no lo instala. Si pierdes la clave, la
próxima versión tendrá que instalarse desinstalando la anterior, y eso borra los datos:
guarda antes una copia desde Ajustes → Tus datos.

## Probar en el navegador

```sh
cd www && python3 -m http.server 8080
```

Abre `http://localhost:8080`. Funciona todo menos lo que depende de Android: las alarmas
del sistema y Google Calendar.

## Actualizar sin perder datos

Cada versión nueva sube `versionCode` en `android/app/build.gradle` y conserva el id
`com.rutina.diaria` y la misma clave de firma. Así Android la instala como actualización y tus
rutinas, tu historial y tu jardín se quedan donde están.
