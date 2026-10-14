"""Browser-test API using disposable PostgreSQL schemas, never live school data.

Run from the repository root with:
  uv run --no-project --python 3.12 python -m backend.tests.serve_phase3
This loopback-only server uses synthetic test accounts and must not be deployed.
"""
import argparse
import atexit
import importlib
from io import BytesIO

import uvicorn
from fastapi import Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
import openpyxl

from backend.tests.test_phase2 import BackendTests
from backend.utils import realtime
from backend.migrations.parity_batch1 import apply_batch1
from backend.migrations.parity_batch2 import apply_batch2


def prepare_parity_schema(fixture):
    with fixture.test_engine.begin() as connection:
        apply_batch1(connection, fixture.schema)
        apply_batch2(connection, fixture.schema)

main = importlib.import_module('backend.main')
BackendTests.setUpClass()
fixture = BackendTests()
fixture.setUp()
prepare_parity_schema(fixture)
main.engine = fixture.test_engine
main.SessionLocal = fixture.sessions
realtime.SessionLocal = fixture.sessions


@main.api.post('/__test/reset', include_in_schema=False)
async def reset(request: Request):
    if request.client.host not in ('127.0.0.1', '::1'):
        return {'success': False}
    await realtime.disconnect_all()
    # Keep the loop available for dependency/session cleanup during schema drop.
    await run_in_threadpool(fixture.tearDown)
    await run_in_threadpool(fixture.setUp)
    await run_in_threadpool(prepare_parity_schema, fixture)
    main.engine = fixture.test_engine
    main.SessionLocal = fixture.sessions
    realtime.SessionLocal = fixture.sessions
    return {'success': True}


@main.api.get('/__test/import-workbook', include_in_schema=False)
def import_workbook():
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.title = 'Info Sheet'
    sheet.append(['Test A'])
    sheet.append(['Headers'])
    from datetime import date
    for row, lrn, name in ((3, '111222333444', 'Learner, Example, Middle'), (4, 'invalid', 'Row, Invalid')):
        for column, value in {'B': name, 'F': lrn, 'H': 'Female', 'I': 'Right', 'J': date(2021, 5, 10), 'K': date(2026, 8, 10)}.items():
            sheet[f'{column}{row}'] = value
    result = BytesIO()
    book.save(result)
    return Response(result.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


atexit.register(fixture.tearDown)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8767)
    args = parser.parse_args()
    uvicorn.run(main.app, host='127.0.0.1', port=args.port, log_level='warning')
