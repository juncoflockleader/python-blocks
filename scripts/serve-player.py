#!/usr/bin/env python3
"""Serve this extracted project locally; no installation or internet required."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000, help='Local port (default 8000; use 0 to choose a free port)')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('Port must be between 0 and 65535.')
    root = Path(__file__).resolve().parent
    class Handler(SimpleHTTPRequestHandler):
        extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm'}
    try:
        with ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(root))) as server:
            print('Open http://127.0.0.1:{}/ — press Ctrl+C to stop.'.format(server.server_port), flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
    except OSError as error:
        parser.exit(1, 'Could not start the local server: {}. Try --port 8001.\n'.format(error))


if __name__ == '__main__':
    main()
