# A tiny HTTP server: every response reports the container's hostname, the
# request path, and the MESSAGE environment variable the object passed in.
import json
import os
import signal
import socket
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

# The process is PID 1 in the container, and PID 1 ignores a signal it has
# no handler for. The object's stop() sends SIGTERM, so exit on it.
signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({
            "hostname": socket.gethostname(),
            "path": self.path,
            "message": os.environ.get("MESSAGE", ""),
        }).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


HTTPServer(("0.0.0.0", int(os.environ["PORT"])), Handler).serve_forever()
