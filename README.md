# Ranking FOMO

Ranking interno de fotógrafos y modelos de FOMO Sevilla. Una quedada = un ranking.

- **Web**: carpeta `web/` (HTML estático, se publica con GitHub Pages).
- **Base de datos**: una Hoja de cálculo de Google (usuarios, quedadas, fotos, votos).
- **Servidor**: `apps-script/Code.gs`, un Google Apps Script que lee y escribe en la hoja y guarda las fotos en una carpeta de Drive.

Los teléfonos solo los reciben las cuentas con `SI` en la columna `admin` de la pestaña **Usuarios**. Solo tú editas esa hoja, así que solo tú decides quién es admin.

## Puesta en marcha (unos 10 minutos)

### 1. La hoja y el script
1. Crea una Hoja de cálculo de Google nueva (nómbrala «Ranking FOMO»).
2. Menú **Extensiones → Apps Script**. Borra el contenido y pega todo `apps-script/Code.gs`. Guarda.
3. En el desplegable de funciones elige **setup** y pulsa **Ejecutar**. Acepta los permisos (Google avisará de «app no verificada»: Avanzado → Ir a… → Permitir; es tu propio script).
   Esto crea las pestañas, la carpeta de fotos en tu Drive, el código de la comunidad (`fomo-halloween`) y la quedada **Halloween, 17-10-2026**.
4. **Implementar → Nueva implementación → Aplicación web**: *Ejecutar como*: **Yo**, *Quién tiene acceso*: **Cualquier persona**. Copia la URL que termina en `/exec`.

### 2. La web
1. Abre `web/config.js` y pega esa URL en `API`.
2. Sube el repositorio a GitHub. En **Settings → Pages** elige *Deploy from a branch*, rama `main` y carpeta `/ (root)` si subes solo el contenido de `web/`, o usa el workflow incluido (`.github/workflows/pages.yml`), que publica `web/` automáticamente: en Settings → Pages elige *Source: GitHub Actions*.
3. La web queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

### 3. Hacerte admin
1. Entra en la web y crea tu cuenta con el código de la comunidad.
2. En la hoja, pestaña **Usuarios**, escribe `SI` en la columna **admin** de tu fila. Recarga la web: aparece la pestaña Admin.
3. Para quitar el permiso, borra el `SI`.

### 4. Día a día
- **Código de la comunidad**: pestaña **Config**, fila `codigo`. Cámbialo cuando quieras (solo afecta a registros nuevos). Compártelo por el grupo.
- **Nueva quedada**: pestaña Admin → Quedadas → Nueva quedada.
- **Cerrar votaciones**: Admin → Quedadas → Cerrar. El ranking queda fijado.
- **Borrar usuarios o fotos**: pestaña Admin. Motivos: cuenta no real, fotos inapropiadas o cualquier otro abuso de las funciones.
- Si cambias `Code.gs`: Implementar → **Gestionar implementaciones** → editar → *Nueva versión* (la URL no cambia).

## Cómo funciona por dentro
- Cada persona entra con **nombre + PIN** (4-6 números). El PIN se guarda con hash SHA-256 y el navegador recibe un token aleatorio del que solo se guarda el hash. Tras 5 fallos seguidos se bloquea el login 10 minutos.
- Votos: 1 Me encanta (+3), 2 Me gusta (+1), 1 No me gusta (−1) por persona y quedada. No se pueden votar fotos propias ni donde te etiquetan. Los topes los aplica el servidor.
- Desempate: más «Me encanta», más «Me gusta», menos «No me gusta», foto más antigua.
- Las fotos se reducen en el móvil antes de subirse y se guardan en Drive con enlace público a cada imagen (la carpeta no se lista).

## Pruebas
```
cd apps-script/test && node backend.test.js   # lógica del servidor sobre una hoja simulada
```
`e2e/server.js` sirve la web con el mismo `Code.gs` simulado, para probarla en un navegador sin tocar Google.

## Límites
- Apps Script tarda 1-2 s por operación y admite pocas decenas de peticiones simultáneas: va bien para una comunidad de cientos de personas, no de miles.
- El PIN sirve para que nadie suplante a otro en el ranking; no es una cuenta bancaria.
