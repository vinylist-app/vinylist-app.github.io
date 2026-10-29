# VinyList

Tu colección de vinilos, en familia y sin membresías. En el celular de todos.

Es una **PWA**: se abre desde un enlace, se instala en la pantalla de inicio de iPhone y Android, y funciona sin internet.

## Qué hace (v0.1)

- Escanea el código de barras o busca a mano; elige tu edición exacta.
- Portada, canciones y datos de Discogs (respaldo: MusicBrainz).
- Calificación de 5 estrellas **con medias estrellas**.
- Filtros por género, década y calificación; orden por artista, título o año.
- Estado del disco y la funda, ubicación, datos de compra, notas.
- Aviso de "ya lo tienen" al escanear.
- Lista de deseos. Respaldo en archivo.
- **Para ti**: sugerencias según tus calificaciones y compras, con la razón de cada una.
- **Escuchar en Spotify** desde la ficha, los deseos y las sugerencias (abre la app de Spotify; no pide cuenta).

Las siguientes versiones están en [ROADMAP.md](ROADMAP.md).

## Correrla en tu computadora

```bash
npm install
cp .env.example .env   # pon tu token de Discogs (gratis) en VITE_DISCOGS_TOKEN
npm run dev
```

Abre la dirección que imprime (normalmente http://localhost:5173). Para probar la cámara desde el celular en la misma red: `npm run dev -- --host` y abre la IP que muestra. La cámara solo funciona en `localhost` o con `https`.

Sin token de Discogs la app sigue funcionando con MusicBrainz, pero sin géneros ni lista de canciones, y "Para ti" tarda más la primera vez (MusicBrainz acepta una consulta por segundo; después queda guardado 30 días).

## La nube familiar

Sin configurar nada, la app guarda todo en el celular. Para que varias personas compartan una colección hace falta un proyecto gratuito de Firebase (plan Spark, sin tarjeta):

1. En https://console.firebase.google.com crea un proyecto.
2. Authentication → Sign-in method → activa "Correo electrónico/contraseña".
3. Firestore Database → crea la base y pega el contenido de `firebase/firestore.rules` en la pestaña Reglas.
4. Configuración del proyecto → "Tus apps" → agrega una app web y copia el objeto `firebaseConfig` en `src/cloud/firebase-config.json` (son valores públicos; las reglas son lo que protege los datos).

Cada persona crea su cuenta en la app y tiene su propia colección. Para compartirla, en Familia se genera un código de invitación. Los cambios se guardan primero en el celular y suben solos cuando hay internet. El token de Discogs se guarda en la colección de la familia, nunca en el código.

Para probar la nube sin cuenta hay un emulador local (`firebase/firebase.json`, proyecto `demo-vinylist`): con el emulador corriendo, `VITE_FIREBASE_EMULATOR=1 npm run dev` conecta la app a él.

## Publicarla gratis

**GitHub Pages** (ya viene configurado): en el repositorio, Settings → Pages → Source: "GitHub Actions". Cada vez que `main` cambia, el flujo `.github/workflows/pages.yml` compila la app y la publica en `https://<usuario>.github.io/vinylist/`. Al abrir ese enlace en el celular, "Agregar a pantalla de inicio" instala la app.

También sirve cualquier hospedaje de sitios estáticos (Vercel, Netlify, Cloudflare Pages):

```bash
npm run build   # genera la carpeta dist/ (con VITE_BASE=/ruta/ si no va en la raíz)
```

Configura las variables de `.env.example` en el panel del hospedaje.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compila para producción |
| `npm test` | Pruebas unitarias |
| `npm run lint` | Revisión de tipos |

## Estructura

```
src/
  api/        Discogs, MusicBrainz, ListenBrainz y la búsqueda con respaldo
  components/ Estrellas, tarjetas, barra inferior, íconos
  lib/        Filtros, calificaciones, perfil, enlaces a Spotify
  lib/taste/  Perfil de gustos, candidatos y ranking de "Para ti"
  pages/      Colección, Buscar, Escanear, Vista previa, Álbum, Para ti, Deseos, Ajustes, Cuenta, Familia
  cloud/      Cuenta, colección compartida y sincronización con la nube (Firebase)
  db.ts       Base local (IndexedDB), espejo de la colección activa
  session.ts  Sesión: quién eres y qué colección estás viendo
  types.ts    Tipos de datos
firebase/
  firestore.rules  Reglas de acceso de la nube familiar
  firebase.json    Emulador local para probar la nube sin cuenta
```

## Fuentes de datos y licencias

- Discogs API: uso personal; parte de los datos está bajo sus términos de la API.
- MusicBrainz y Cover Art Archive: datos abiertos.
- ListenBrainz Labs (artistas parecidos): datos abiertos (CC0), sin clave.
- Spotify: solo enlaces a su app (`open.spotify.com`); no se usa su API ni se guarda nada de tu cuenta.
