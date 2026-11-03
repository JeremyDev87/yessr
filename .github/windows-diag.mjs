// 임시 진단용: PR #6의 Windows ACL 검사가 어디서 실패하는지 출력한다. PR #6에는 포함하지 않는다.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWindowsPrivatePath, isWindowsPrivateMetadata } from '../plugins/yessr/hooks/windows-security.mjs';
import { handle } from '../plugins/yessr/hooks/response.mjs';

const target = process.argv[2] === 'tmp' ? await mkdtemp(join(tmpdir(), 'yessr-diag-')) : process.argv[2];
console.log('target:', target);
let started = performance.now();
try { await assertWindowsPrivatePath(target); console.log('assert: ok', Math.round(performance.now() - started), 'ms'); }
catch (error) { console.log('assert: FAIL', error.code, Math.round(performance.now() - started), 'ms'); }

const source = await readFile(new URL('../plugins/yessr/hooks/windows-security.mjs', import.meta.url), 'utf8');
const command = source.match(/const command = String\.raw`([\s\S]*?)`;/)[1]
  .replace('} catch { exit 1 }', '} catch { [Console]::Error.WriteLine("$($_) @ $($_.InvocationInfo.PositionMessage)"); exit 1 }');
const child = spawn(win32.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { shell: false, windowsHide: true });
let stdout = '', stderr = '';
child.stdout.setEncoding('utf8').on('data', value => { stdout += value; });
child.stderr.setEncoding('utf8').on('data', value => { stderr += value; });
started = performance.now();
const code = await new Promise(resolve => { child.on('close', resolve); child.stdin.end(JSON.stringify({ path: target })); });
console.log('powershell exit', code, Math.round(performance.now() - started), 'ms');
console.log('stdout:', stdout);
console.log('stderr:', stderr);
try { console.log('pure verdict:', isWindowsPrivateMetadata(JSON.parse(stdout), target)); } catch (error) { console.log('parse FAIL', error.message); }

started = performance.now();
const output = await handle({ hook_event_name: 'SessionStart', session_id: 'diag', source: 'startup' }, { dataRoot: target });
console.log('handle:', output ? 'output' : 'null', Math.round(performance.now() - started), 'ms');

// 실제 호스트처럼 BOM 없는 stdin으로 CLI 수명주기 각 단계의 시간을 잰다.
const session = { session_id: 'diag-cli', turn_id: 'turn-1' };
for (const event of [
  { ...session, hook_event_name: 'SessionStart', source: 'startup' },
  { ...session, hook_event_name: 'UserPromptSubmit', prompt: 'JSON만 출력해줘.' },
  { ...session, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: '잘못된 결과' },
  { ...session, hook_event_name: 'Stop', stop_hook_active: true, last_assistant_message: '{}' },
]) {
  const cli = spawn(process.execPath, [fileURLToPath(new URL('../plugins/yessr/hooks/response.mjs', import.meta.url))],
    { env: { ...process.env, PLUGIN_DATA: target }, windowsHide: true });
  let cliOut = '';
  cli.stdout.setEncoding('utf8').on('data', value => { cliOut += value; });
  started = performance.now();
  const cliCode = await new Promise(resolve => { cli.on('close', resolve); cli.stdin.end(JSON.stringify(event)); });
  console.log(`cli ${event.hook_event_name}: exit ${cliCode}, ${Math.round(performance.now() - started)} ms, stdout ${cliOut.slice(0, 80)}`);
}
