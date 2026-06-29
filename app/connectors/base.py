"""Protocolo comun de conectores.

Un conector representa una fuente externa que la red puede sincronizar al
indice local. Cada conector declara su `SourceInfo` y sabe traer paginas de su
API y mapearlas a `IndexedRecord`. El endpoint de sync solo necesita
`source` y `sync(...)`, sin conocer detalles de paginacion ni de auth.
"""


def stamp_and_upsert(store, settings, source_id, records):
    """Estampa procedencia local y persiste; devuelve nº importado."""
    for record in records:
        if record.origin_node is None:
            record.origin_node = settings.node_id
            record.origin_source = source_id
    return store.upsert_records(records)


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


class HttpListConnector(Connector):
    """Base para APIs JSON de lista paginada (offset/limit o page).

    Una subclase declara la URL, las claves de la respuesta y `map_item`.
    Pagina el dataset completo (hasta `safety_max`) para reflejar toda la fuente.
    """

    list_url = None
    items_key = "items"
    has_more_key = None          # p.ej. "hasMore", o None
    page_param = "offset"        # "offset" o "page"
    page_size_param = "limit"
    page_size = 100
    page_start = 0               # 0 para offset, 1 para page
    safety_max = 100000
    extra_params = None

    def map_item(self, item):
        raise NotImplementedError

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        from ..client import HttpClient

        store.upsert_source(self.source)
        client = HttpClient(settings)

        imported = 0
        scanned = 0
        pages = 0
        cap = max(source_limit or 0, self.safety_max)
        page_value = self.page_start

        while pages < 2000 and scanned < cap:
            params = dict(self.extra_params or {})
            params[self.page_size_param] = self.page_size
            params[self.page_param] = page_value
            data = await client.get_json(self.list_url, params=params)

            items = (data.get(self.items_key) if isinstance(data, dict) else None) or []
            pages += 1
            scanned += len(items)

            records = []
            for item in items:
                record = self.map_item(item)
                if record is None:
                    continue
                if record.origin_node is None:
                    record.origin_node = settings.node_id
                    record.origin_source = self.source_id
                records.append(record)
            imported += store.upsert_records(records)

            if not items:
                break
            if self.has_more_key is not None and not data.get(self.has_more_key):
                break
            if len(items) < self.page_size:
                break
            page_value += 1 if self.page_param == "page" else self.page_size

        store.touch_source_sync(self.source_id)
        return imported, scanned, pages
