"""Protocolo comun de conectores.

Un conector representa una fuente externa que la red puede sincronizar al
indice local. Cada conector declara su `SourceInfo` y sabe traer paginas de su
API y mapearlas a `IndexedRecord`. El endpoint de sync solo necesita
`source` y `sync(...)`, sin conocer detalles de paginacion ni de auth.
"""


class Connector:
    #: SourceInfo de la fuente; cada subclase debe definirlo. El id de la
    #: fuente (source.id) es tambien el id del conector en el registro.
    source = None

    @property
    def source_id(self):
        return self.source.id

    async def sync(self, *, store, settings, source_limit, max_pages, desde=None):
        """Devuelve (imported, scanned, pages)."""
        raise NotImplementedError


class HttpKeyConnector(Connector):
    """Base para fuentes HTTP paginadas por offset/limit.

    Implementa el bucle de paginacion generico (mismo patron que el antiguo
    `sync_hospitales`) y delega en dos hooks por-conector:
      - `fetch_page(settings, limit, offset, desde) -> (items, count, total)`
      - `map_item(item) -> IndexedRecord`
    """

    async def fetch_page(self, settings, limit, offset, desde):
        raise NotImplementedError

    def map_item(self, item):
        raise NotImplementedError

    async def sync(self, *, store, settings, source_limit, max_pages, desde=None):
        store.upsert_source(self.source)

        imported = 0
        scanned = 0
        pages = 0

        for page in range(max_pages):
            offset = page * source_limit
            items, count, total = await self.fetch_page(
                settings, source_limit, offset, desde
            )
            pages += 1
            scanned += count

            records = [self.map_item(item) for item in items]
            for record in records:
                # Procedencia: estos registros nacen en este nodo.
                if record.origin_node is None:
                    record.origin_node = settings.node_id
                    record.origin_source = record.source_id
            imported += store.upsert_records(records)

            if count < source_limit:
                break
            if offset + count >= total:
                break

        store.touch_source_sync(self.source_id)
        return imported, scanned, pages
