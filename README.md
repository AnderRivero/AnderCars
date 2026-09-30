# AnderCars

Bitácora para un auto: servicios, reparaciones, kilometraje y avisos de mantenimiento. La página es estática y puede vivir en GitHub Pages. Los datos y el login viven en Supabase, en el plan gratuito.

Solo puede entrar `rivero.ander@gmail.com`.

## Qué hay que crear en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto gratis. Guarda la contraseña de la base; la app no la usa.
2. En **Project Settings → API** copia:
   - Project URL
   - `anon` `public` key
3. No copies la clave `service_role`. Esa clave salta la seguridad y no debe ir al repositorio ni al frontend.
4. Abre **SQL Editor**, pega todo `supabase/schema.sql` y ejecútalo. El script crea las tablas, las reglas de acceso, el almacén privado de fotos y autoriza tu correo.

## Login con Google

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto.
2. **APIs y servicios → Pantalla de consentimiento de OAuth**. Tipo de usuario: externo. Nombre: AnderCars. Correo de asistencia: `rivero.ander@gmail.com`.
3. En usuarios de prueba agrega `rivero.ander@gmail.com`. Mientras la app siga en prueba, Google puede pedir que vuelvas a entrar más o menos cada 7 días.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
   - Orígenes de JavaScript autorizados: `http://localhost:5173` y, cuando publiques, `https://TU_USUARIO.github.io`
   - URI de redirección autorizada: `https://TU_REF.supabase.co/auth/v1/callback` (el ref es el subdominio de tu Project URL)
5. En Supabase, **Authentication → Providers → Google**: pega el client id y el client secret.
6. En **Authentication → URL Configuration** agrega estas URL de redirección, con la barra final:
   - `http://localhost:5173/`
   - `https://TU_USUARIO.github.io/AnderCars/`
7. Desactiva el proveedor Email si aparece encendido. La pantalla solo ofrece Google, y la lista de correos corta cualquier otra cuenta.

## Correrla en esta máquina

```bash
cp .env.example .env.local
```

Edita `.env.local` con la URL y la clave anon. Después:

```bash
npm install
npm test
npm run dev
```

Abre `http://localhost:5173/`, entra con Google y, en **Entradas**, usa **Importar historial** con `docs/Fuel_Log.csv`.

Ese archivo trae 65 filas de un Chevrolet Aveo Lt Speed, de 2021 a 2026. La importación carga 51 servicios y 4 lecturas de odómetro. Omite 10 cargas de gasolina. El año del auto no viene en el archivo: complétalo en **Autos**. Los nombres quedan como en el respaldo (`Engine Oil`, `Battery`, y el resto en español). Después, en **Servicios**, marca los recurrentes y escribe cada cuántos kilómetros y cada cuántos meses.

Si vuelves a importar el mismo archivo, no duplica las filas.

## Publicar en GitHub Pages

1. Sube el repositorio a GitHub.
2. En **Settings → Secrets and variables → Actions** crea:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. En **Settings → Pages**, elige **GitHub Actions** como origen.
4. El workflow `.github/workflows/pages.yml` publica en cada push a `main` o `master`.
5. Agrega la URL pública en Google y en Supabase, como arriba.

La clave anon queda dentro del JavaScript público. Así está pensado Supabase: sin una sesión de tu cuenta de Google, las políticas de la base devuelven cero filas.

## Seguridad y límites del plan gratis

- El repositorio público no esconde la interfaz. El candado es el login más la tabla `allowed_users`.
- Las fotos van a un bucket privado. Se muestran con un enlace temporal.
- El kilometraje nuevo tiene que ser mayor o igual que el último. La misma regla está en la base, no solo en la pantalla. Puedes corregir la lectura más alta editándola, hasta el valor anterior.
- Supabase puede pausar un proyecto gratis si durante unos 7 días casi no recibe consultas. Avisa por correo y se reactiva desde el panel, sin costo, durante un año.
- Base de 500 MB, 1 GB de archivos y el volumen de este historial caben en el plan gratis.
- `docs/Fuel_Log.csv` es un respaldo personal y no hace falta subirlo. La página lo pide desde tu computadora al importar. En GitHub Actions las pruebas usan un ejemplo corto y omiten ese archivo si no está en el repositorio.

## Pantallas

- **Resumen:** alertas, kilometraje por año y gastos.
- **Autos:** marca, modelo, año, foto y notas.
- **Servicios:** nombre y, si es recurrente, intervalo en kilómetros y en meses.
- **Entradas:** fecha, kilometraje, varios servicios, taller con sugerencias, costo en USD y notas.
- **Odómetro:** solo fecha y kilometraje.
