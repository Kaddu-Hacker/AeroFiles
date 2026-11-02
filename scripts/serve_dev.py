#!/usr/bin/env python3
"""Dev server for the AeroFiles UI — serves ../ui with no-store caching."""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()
    def log_message(self, *a):
        pass

if __name__ == "__main__":
    root = str(Path(__file__).resolve().parent.parent / "ui")
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8900
    print(f"AeroFiles dev UI on http://127.0.0.1:{port}/ (serving {root}, no-cache)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), partial(NoCache, directory=root)).serve_forever()
