"""Exercise trusted installed hooks with a local scripted provider; no paid model calls."""
import argparse
import http.server
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import threading
import time
import tomllib

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--plugin', required=True, type=Path, help='Installed Proof-Jev bundle; its Codex hooks must already be enabled and trusted')
parser.add_argument('--output', type=Path, default=Path('out/native-validation'))
options = parser.parse_args()
plugin = options.plugin.resolve()
version = json.loads((plugin / 'package.json').read_text())['version']
evidence = options.output.resolve()
evidence.mkdir(parents=True, exist_ok=True)
reports = Path(tempfile.mkdtemp(prefix='run-', dir=evidence))
root = Path(tempfile.mkdtemp(prefix='proof-native-repair-'))
request_text = 'Fix shipping: totals of 50 and above ship free; lower totals cost 5. Map this requirement to the configured shipping check, then preserve the original task through verification.'
requests = []
errors = []


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"models":[]}')

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        number = len(requests) + 1
        text = json.dumps(body.get('input', []))
        requests.append({'request': number,
                         'promptCaptured': 'Proof-Jev automatically tracks' in text,
                         'executionEnabled': 'enabled for this trusted project' in text,
                         'postEditAnalysis': 'No tests ran.' in text,
                         'stopContinuation': 'Investigate actionable findings' in text,
                         'assertionEvidence': 'AssertionError' in text and '50 must ship free' in text})
        if number == 1:
            name = 'task_event'
            args = {'event': {'type': 'requirements', 'requirements': [
                {'id': 'shipping', 'description': 'Free at 50 and above, 5 below', 'check': 'shipping'}]}}
        elif number in (2, 4):
            if number == 4 and not requests[-1]['assertionEvidence']:
                errors.append('The automatic repair continuation did not carry the actual assertion failure')
            before, after = (51, 60) if number == 2 else (60, 50)
            command = "python3 -c \"from pathlib import Path; p=Path('src/pricing.mjs'); p.write_text(p.read_text().replace('>= %d','>= %d'))\"" % (before, after)
            name = 'exec_command'
            args = {'cmd': command, 'workdir': str(root), 'max_output_tokens': 1000}
        else:
            name = None
        if name:
            item = {'type': 'function_call', 'id': f'fc_{number}', 'call_id': f'call_{number}',
                    'name': name, 'arguments': json.dumps(args), 'status': 'completed'}
            if number == 1:
                item['namespace'] = 'mcp__proof_jev'
        else:
            item = {'type': 'message', 'id': f'msg_{number}', 'role': 'assistant', 'status': 'completed',
                    'content': [{'type': 'output_text', 'text': 'Fixture edit complete; inspect the automatic verification result.', 'annotations': []}]}
        response = {'id': f'resp_{number}', 'object': 'response', 'created_at': int(time.time()),
                    'model': body.get('model'), 'status': 'completed', 'output': [item],
                    'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}
        events = [('response.created', {'response': {**response, 'status': 'in_progress', 'output': []}}),
                  ('response.output_item.added', {'output_index': 0, 'item': item}),
                  ('response.output_item.done', {'output_index': 0, 'item': item}),
                  ('response.completed', {'response': response})]
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        for seq, (kind, data) in enumerate(events):
            self.wfile.write(('event: ' + kind + '\ndata: ' + json.dumps({'type': kind, 'sequence_number': seq, **data}) + '\n\n').encode())
        self.wfile.flush()


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
process = None
try:
    (root / 'src').mkdir()
    (root / 'test').mkdir()
    (root / '.gitignore').write_text('out/\n')
    (root / 'src/pricing.mjs').write_text('export function shipping(total) { return total >= 51 ? 0 : 5; }\n')
    (root / 'test/pricing.test.mjs').write_text("import assert from 'node:assert/strict'; import {shipping} from '../src/pricing.mjs'; assert.equal(shipping(20),5); assert.equal(shipping(50),0,'50 must ship free'); assert.equal(shipping(80),0);\n")
    command = ['node', '--test', 'test/pricing.test.mjs']
    (root / 'vouch.config.json').write_text(json.dumps({'testCommand': command, 'acceptanceChecks': {'shipping': command},
                                                     'maxMutants': 1, 'commandTimeoutMs': 2000, 'totalTimeoutMs': 15000}))
    for args in [['init', '--quiet'], ['add', '.'], ['-c', 'user.name=Proof Test', '-c', 'user.email=proof@example.invalid', 'commit', '-qm', 'fixture']]:
        subprocess.run(['git', '-C', str(root)] + args, check=True, capture_output=True)
    config = tomllib.loads(Path.home().joinpath('.codex/config.toml').read_text())
    args = ['nice', '-n', '10', 'codex', '--no-daemon', 'exec', '--json', '--ephemeral', '-C', str(root), '-s', 'workspace-write']
    overrides = ['model_provider="proof_fixture"',
                 f'model_providers.proof_fixture={{name="Local deterministic fixture",base_url="http://127.0.0.1:{server.server_port}/v1",wire_api="responses",supports_websockets=false,request_max_retries=0,stream_max_retries=0}}',
                 'approval_policy="never"', 'features.apps=false', 'notify=[]', 'plugins."proof-jev@personal".enabled=true',
                 'mcp_servers={"proof-jev"={command="node",args=["./bin/plugin.mjs","--stdio"],cwd=' + json.dumps(str(plugin)) + ',env={VOUCH_ALLOW_EXECUTION="1",VERIFY_OUTPUT_DIR=' + json.dumps(str(reports)) + '},tools={task_event={approval_mode="approve"}}}}']
    overrides += ['plugins.' + json.dumps(name) + '.enabled=false' for name in config.get('plugins', {}) if name != 'proof-jev@personal']
    for override in overrides:
        args += ['-c', override]
    args += [request_text]
    env = {k: v for k, v in os.environ.items() if not k.startswith(('JEV_', 'VOUCH_', 'PROOF_TASK', 'VERIFY_OUTPUT'))}
    with (evidence / 'events.jsonl').open('w') as stdout, (evidence / 'stderr.log').open('w') as stderr:
        process = subprocess.Popen(args, env=env, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, start_new_session=True)
        exit_code = process.wait(timeout=100)
    tasks = list(reports.glob('**/task.json'))
    task = json.loads(tasks[0].read_text()) if len(tasks) == 1 else {}
    result = {'version': version, 'exitCode': exit_code, 'requests': requests, 'scriptErrors': errors,
              'originalTaskPreserved': task.get('request') == request_text,
              'finalDecision': task.get('feedback', {}).get('decision'),
              'requirements': task.get('feedback', {}).get('requirements'),
              'sourceRepaired': '>= 50' in (root / 'src/pricing.mjs').read_text(),
              'report': str(tasks[0]) if len(tasks) == 1 else None,
              'paidModelCalls': 0, 'provider': 'local scripted responses; not autonomous model repair'}
    (evidence / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
    assert exit_code == 0 and len(requests) == 5 and not errors, 'Native fixture did not complete its bounded repair sequence'
    assert requests[0]['promptCaptured'] and requests[0]['executionEnabled'], 'Trusted prompt hook did not start executable verification'
    assert requests[2]['postEditAnalysis'], 'Post-tool hook evidence missing'
    assert requests[3]['stopContinuation'] and requests[3]['assertionEvidence'], 'Stop hook failed to deliver useful error evidence'
    assert result['originalTaskPreserved'] and result['sourceRepaired'] and result['finalDecision'] == 'checks_passed', 'The repaired source was not verified against the original requirement'
finally:
    if process:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        process.wait(timeout=5)
    server.shutdown()
    server.server_close()
    shutil.rmtree(root)
