# POST an HTML page to /summarize to get its title and links. The summary is
# kept in KV under the page's SHA-256, and GET /summary/<sha256> reads it back.
import hashlib
import json
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from workers import Response, WorkerEntrypoint


def summarize(html):
    soup = BeautifulSoup(html, "html.parser")
    return {
        "title": soup.title.get_text(strip=True) if soup.title else None,
        "headings": [h.get_text(strip=True) for h in soup.select("h1, h2")],
        "links": [a["href"] for a in soup.select("a[href]")],
    }


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        path = urlparse(request.url).path
        if request.method == "POST" and path == "/summarize":
            html = await request.text()
            digest = hashlib.sha256(html.encode()).hexdigest()
            summary = summarize(html)
            await self.env.PAGES.put(digest, json.dumps(summary))
            return Response.json({"sha256": digest, **summary})
        if request.method == "GET" and path.startswith("/summary/"):
            stored = await self.env.PAGES.get(path.removeprefix("/summary/"))
            if stored is None:
                return Response("not found", status=404)
            return Response(stored, headers={"content-type": "application/json"})
        return Response("POST HTML to /summarize\n", status=404)
