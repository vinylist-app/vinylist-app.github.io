# Versiones de VinyList

## v0.1 · Primera versión
- [x] Escanear código de barras con la cámara, o escribirlo a mano.
- [x] Buscar por artista, título o número de catálogo (discos sin código).
- [x] Datos y portada de Discogs, con MusicBrainz y Cover Art Archive de respaldo.
- [x] Elegir la edición exacta cuando un código tiene varias.
- [x] Aviso de "ya lo tienen" al escanear.
- [x] Calificación de 5 estrellas con medias estrellas.
- [x] Buscar y filtrar por género, década, calificación; ordenar por artista, título, año.
- [x] Ficha del álbum: canciones, estado del disco y la funda, ubicación, compra, notas.
- [x] Lista de deseos (por ahora en este celular).
- [x] Funciona sin internet (PWA, portadas guardadas).
- [x] Respaldo y restauración en archivo.
- [x] "Escuchar en Spotify" en la ficha, en deseos y en resultados: abre la app de Spotify, sin cuenta ni clave; el enlace es exacto cuando MusicBrainz conoce el álbum y, si no, una búsqueda.
- [x] "Para ti": sugerencias según calificaciones y compras, con la razón de cada una (más discos de tus favoritos, artistas parecidos vía ListenBrainz). Se calcula en el celular, sin cuenta, y se guarda 30 días.

## v0.2 · Tu cuenta y la nube familiar
- [x] Cuenta por persona (correo y contraseña); cada quien tiene su propia colección.
- [x] Familia: invitación por código o enlace; varios celulares, una colección (Firebase: Auth + Firestore con caché local, cambios sin internet que suben solos).
- [x] Calificación de cada familiar guardada por separado; al cambiar de cuenta ves la tuya.
- [x] Lista de deseos compartida; el apartado para regalo se oculta a quien lo quiere.
- [x] Token de Discogs guardado en la colección de la familia, nunca en el código.
- [x] Vista previa al escanear o buscar: primero el disco con su contexto ("te cuenta"), luego "Agregar a mi colección".
- [x] Calificar deslizando el dedo sobre las estrellas; opcional al agregar.
- [x] Modo claro y oscuro con interruptor en Ajustes.
- [ ] Importar colección desde Discogs y CLZ (CSV). (pendiente)

## v0.3 · El chat
- [ ] Chatbot con Claude: recomendaciones, comparaciones, imprescindibles.
- [ ] "Para ti" con Claude: reordena y explica mejor las sugerencias de la v0.1 (una llamada al día, guardada en la nube para toda la familia).
- [ ] Búsqueda web limitada a sitios confiables, siempre con fuentes.
- [ ] Dónde comprar: Discogs Marketplace, Mercado Libre, Amazon MX, tiendas que tú apruebes.
- [ ] Conoce la colección: "ya lo tienes" / "te falta".

## v0.4 · Extras
- [ ] Valor aproximado con precios de Discogs.
- [ ] Búsqueda por foto de la portada.
- [ ] Vista "hojear la caja".
- [ ] Diario de escucha y "¿qué pongo hoy?".
- [ ] Préstamos.
- [ ] Estadísticas de la colección.
