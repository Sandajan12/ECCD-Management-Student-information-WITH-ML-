"""Browser-test API using disposable PostgreSQL schemas, never live school data.

Run from the repository root with:
  uv run --no-project --python 3.12 python -m backend.tests.serve_phase3
This loopback-only server uses synthetic test accounts and must not be deployed.
"""
import argparse
import atexit
import importlib

import uvicorn
from fastapi import Request

from backend.tests.test_phase2 import BackendTests
from backend.utils import realtime

main = importlib.import_module('backend.main')
BackendTests.setUpClass()
fixture = BackendTests()
fixture.setUp()
main.engine = fixture.test_engine
main.SessionLocal = fixture.sessions
realtime.SessionLocal = fixture.sessions


@main.api.post('/__test/reset', include_in_schema=False)
async def reset(request: Request):
    if request.client.host not in ('127.0.0.1', '::1'):
        return {'success': False}
    await realtime.disconnect_all()
    fixture.tearDown()
    fixture.setUp()
    main.engine = fixture.test_engine
    main.SessionLocal = fixture.sessions
    realtime.SessionLocal = fixture.sessions
    return {'success': True}


atexit.register(fixture.tearDown)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8767)
    args = parser.parse_args()
    uvicorn.run(main.app, host='127.0.0.1', port=args.port, log_level='warning')
