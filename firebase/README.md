# La nube de VinyList (Firebase)

VinyList guarda la colección de la familia en Firebase: **Authentication** (cuentas con
correo y contraseña) y **Firestore** (los discos, los deseos y quién es de la familia).
Esta carpeta tiene lo que la nube necesita de nuestro lado:

| Archivo | Para qué sirve |
| --- | --- |
| `firestore.rules` | Las reglas de seguridad: quién puede leer y escribir qué. Son lo que protege los datos; la configuración de la app es pública. |
| `firebase.json` | Configuración del emulador local (Auth en el puerto 9099, Firestore en el 8080) y dónde están las reglas. |

El código de la app que habla con la nube está en `src/cloud/`.

## Qué prometen las reglas

- Cada persona lee y escribe solo su perfil (`users/{suyo}`).
- Una colección la crea quien la va a administrar, y de entrada solo está esa persona.
- Solo los miembros ven la colección, sus discos y sus deseos.
- Un código de invitación lo puede leer cualquiera con cuenta **si lo conoce**; nadie puede listar los códigos.
- Para unirse hay que traer un código válido de esa colección y solo agregarse a sí mismo como editor.
- Un miembro solo puede cambiar su propio nombre o salirse. Quien administra cambia lo demás
  (nombre de la colección, token de Discogs, código, sacar a alguien).

Las pruebas en `tests/nube/` comprueban cada punto contra el emulador.

## Probar la nube en tu computadora (sin tocar la nube real)

Las pruebas de la nube corren contra el **emulador de Firebase**, un Firebase de mentira
que vive en tu computadora. No necesitas cuenta de Google ni internet para esto.

Necesitas:

1. **Java 21 o más nuevo** (el emulador de Firestore está hecho en Java).
   Compruébalo con `java -version`.
2. **La herramienta de Firebase** (`firebase-tools`). Instálala una vez con
   `npm install -g firebase-tools`, o cambia `firebase` por `npx firebase-tools` en el
   script `test:nube` de `package.json`.
3. Las dependencias del proyecto: `npm install`.

Luego:

```sh
npm run test:nube
```

Eso levanta el emulador (Auth + Firestore) con el proyecto de mentira `demo-vinylist`,
corre las pruebas de `tests/nube/` y apaga el emulador al terminar. La primera vez, la
herramienta descarga el emulador de Firestore (unos 130 MB) y lo guarda en
`~/.cache/firebase/emulators/`.

Si prefieres dejar el emulador prendido mientras trabajas:

```sh
firebase emulators:start --only auth,firestore --project demo-vinylist --config firebase/firebase.json
# y en otra terminal:
npx vitest run --config tests/nube/vitest.config.ts
```

Si las pruebas dicen "No encuentro el emulador de Firebase", es que no está prendido o
está en otro puerto. Los puertos se leen de `FIRESTORE_EMULATOR_HOST` y
`FIREBASE_AUTH_EMULATOR_HOST`; si no existen, se usan `127.0.0.1:8080` y `127.0.0.1:9099`.

### Qué prueban

- `tests/nube/reglas.test.ts`: cada regla de `firestore.rules`, actuando como distintas
  personas (dueña, miembro, alguien de fuera, sin cuenta).
- `tests/nube/flujo.test.ts`: el flujo completo con el código de la app (`src/cloud/*`):
  crear cuenta, crear la colección, unirse con el código, agregar y calificar discos, apartar
  deseos, subir lo que había en el celular, salirse, renovar el código y sacar a alguien.
- `tests/nube/emulador.test.ts`: la lógica de las ayudas de prueba.

Las pruebas normales (`npm test`) no incluyen estas, porque necesitan el emulador.

## Crear el proyecto real de Firebase (una sola vez, gratis)

Esto lo hace quien vaya a administrar la nube de la familia. Toma unos 10 minutos y no
pide tarjeta: el plan gratuito sobra para una colección familiar.

1. Entra a la **consola de Firebase**: <https://console.firebase.google.com> con tu cuenta
   de Google.
2. **Agregar proyecto** → ponle nombre (por ejemplo "VinyList familia") → puedes
   desactivar Google Analytics → **Crear proyecto**.
3. En el menú de la izquierda, **Compilación → Authentication** → **Comenzar** →
   pestaña **Método de acceso** → **Correo electrónico/contraseña** → activa la primera
   opción (solo correo y contraseña; el enlace sin contraseña no hace falta) → **Guardar**.
4. **Compilación → Firestore Database** → **Crear base de datos** → elige la ubicación
   más cercana (por ejemplo `us-central1` o `nam5`) → **Comenzar en modo de producción**
   → **Crear**.
5. En Firestore, pestaña **Reglas** → borra lo que haya → pega el contenido completo de
   `firebase/firestore.rules` → **Publicar**. Sin este paso nadie podrá leer ni escribir.
6. Registra la app web: en la página principal del proyecto (icono de engrane →
   **Configuración del proyecto** → sección **Tus apps**) → el icono **</>** (Web) → ponle
   nombre "VinyList" → no hace falta Hosting → **Registrar app**.
7. Firebase te muestra un bloque `firebaseConfig` con `apiKey`, `authDomain`, `projectId`,
   `storageBucket`, `messagingSenderId` y `appId`. Copia esos valores como JSON en
   `src/cloud/firebase-config.json`:

   ```json
   {
     "apiKey": "AIza...",
     "authDomain": "tu-proyecto.firebaseapp.com",
     "projectId": "tu-proyecto",
     "storageBucket": "tu-proyecto.appspot.com",
     "messagingSenderId": "1234567890",
     "appId": "1:1234567890:web:abc123"
   }
   ```

   Esta configuración es pública por diseño (va dentro de cualquier app web de Firebase);
   lo que protege los datos son las reglas del paso 5.
8. Vuelve a construir y publicar la app (`npm run build`). Cuando la app vive en otro
   dominio (por ejemplo GitHub Pages), agrégalo en **Authentication → Configuración →
   Dominios autorizados** para que el inicio de sesión funcione desde ahí.

Si más adelante cambias `firestore.rules`, repite el paso 5 (o, con `firebase-tools` y
sesión iniciada con `firebase login`, corre `firebase deploy --only firestore:rules
--project tu-proyecto --config firebase/firebase.json`).
