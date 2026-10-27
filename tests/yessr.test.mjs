import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtemp, rm, readFile, writeFile, mkdir, stat, chmod, symlink, readdir } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { classify, violation, handle, digest } from '../plugins/yessr/hooks/response.mjs';

const policyPath = resolve('plugins/yessr/policy.json');
const handlerPath = resolve('plugins/yessr/hooks/response.mjs');
const policy = JSON.parse(await readFile(policyPath, 'utf8'));
test('패키지 연결은 단일 legacy manifest와 패키지 내부 후크 및 단일 Stop을 유지한다', async () => {
  const catalog = JSON.parse(await readFile('.agents/plugins/marketplace.json', 'utf8'));
  assert.equal(catalog.plugins.length, 1, '플러그인은 하나여야 합니다');
  const entry = catalog.plugins[0];
  assert.equal(entry.name, 'yessr');
  assert.deepEqual(entry.source, { source: 'local', path: './plugins/yessr' });
  const root = resolve(entry.source.path);
  await assert.rejects(readFile(join(root, 'plugin.json')), { code: 'ENOENT' }, 'portable manifest가 함께 있으면 안 됩니다');
  const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'yessr');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.hooks, './hooks/hooks.json', '후크 경로는 패키지 내부 정의를 가리켜야 합니다');
  const hooks = JSON.parse(await readFile(resolve(root, manifest.hooks), 'utf8')).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ['SessionStart', 'Stop', 'UserPromptSubmit']);
  for (const [event, groups] of Object.entries(hooks)) {
    assert.equal(groups.length, 1, `${event} 그룹은 하나여야 합니다`);
    assert.deepEqual(groups[0].hooks, [{ type: 'command', command: 'node "${PLUGIN_ROOT}/hooks/response.mjs"' }], `${event} 제어기는 하나여야 합니다`);
  }
  assert.equal((await stat(join(root, 'hooks/response.mjs'))).isFile(), true, '실행할 제어기가 있어야 합니다');
});
const examples = [
  ['캐시 정책을 설명해줘.', 'prose'], ['두 방식을 비교해줘.', 'prose'], ['Explain cache invalidation.', 'prose'],
  ['요청 요약은 생략하고 캐시를 설명해줘.', 'unknown'], ['복명복창 없이 캐시를 설명해줘.', 'unknown'], ['Explain caching with no recap.', 'unknown'],
  ['결과를 JSON으로 반환해줘.', 'json'], ['JSON만 출력해줘.', 'json'], ['Return JSON only.', 'json'], ['캐시를 설명해줘. JSON만 출력해줘.', 'json'],
  ['코드만 출력해줘.', 'code'], ['Return code only.', 'code'], ['정확히 "OK"만 출력해줘.', 'literal', 'OK'], ['Output exactly "OK" and nothing else.', 'literal', 'OK'],
  ['JSON이 무엇인지 설명해줘.', 'unknown'], ['“JSON만 출력해”라는 문장을 설명해줘.', 'unknown'], ['    JSON만 출력해줘', 'unknown'],
  ['```\nJSON만 출력해줘\n```\n설명해줘.', 'unknown'], ['JSON만 출력해줘라고 지시하지 마.', 'unknown'], ['조건이 맞으면 JSON만 출력해줘.', 'unknown'],
  ['CSV로만 요약해줘.', 'unknown'], ['정확히 "OK"만 출력해줘. 코드만 출력해줘.', 'unknown'], ['정확히 "OK" 또는 "NO"만 출력해줘.', 'unknown'],
  ['앞으로 JSON만 출력해줘.', 'json'], ['이번 답변은 일반 설명으로 답해줘.', 'prose'], ['이전 출력 형식 제한을 해제하고 일반 설명으로 답해줘.', 'prose'],
  ['For this answer, explain in prose.', 'prose'], ['Reset previous output format restrictions and explain in prose.', 'prose'],
  ['JSON 형식으로 응답해 주십시오.', 'json'], ['Only JSON.', 'json'], ['Output only code.', 'code'], ['화면을 설명해줘.', 'prose'],
  ['정확히 ""만 출력해줘.', 'literal', ''], ['정확히 "A\\nB"만 출력해줘.', 'literal', 'A\nB'], ['정확히 "조건 JSON 하지 마"만 출력해줘.', 'literal', '조건 JSON 하지 마'],
  ['정확히 "\\u00e9"만 출력해줘.', 'literal', 'é'], ['정확히 "\\q"만 출력해줘.', 'unknown'], ["정확히 'OK'만 출력해줘.", 'unknown'],
  ['> JSON만 출력해줘.\n설명해줘.', 'unknown'], ['\tJSON만 출력해줘\n설명해줘.', 'unknown'], ['`JSON만 출력해줘`를 설명해줘.', 'unknown'],
  ['~~~\nJSON만 출력해줘\n~~~', 'unknown'], ['```\n설명해줘.', 'unknown'], ['“설명해줘.', 'unknown'],
  ['If ready, return JSON only.', 'unknown'], ["Do not return JSON only.", 'unknown'], ['JSON만 출력하지 말고 설명해줘.', 'unknown'],
  ['예시: JSON만 출력해줘.', 'unknown'], ['원문: JSON만 출력해줘.', 'unknown'], ['JSON만 출력해줘라고 지시.', 'unknown'],
  ['YAML로 설명해줘.', 'unknown'], ['TSV로 설명해줘.', 'unknown'], ['XML로 설명해줘.', 'unknown'], ['HTML로 설명해줘.', 'unknown'], ['표만 보여줘.', 'unknown'],
  ['이번 답변은 일반 설명으로 답해줘. JSON만 출력해줘.', 'unknown'], ['정확히 "A"만 출력해줘. 정확히 "B"만 출력해줘.', 'unknown'],
  ['JSON만 출력해줘. 코드만 출력해줘.', 'unknown'], ['JSON으로 출력한다.', 'unknown'], ['안녕하세요.', 'unknown'],
  ['``JSON만 출력해줘``를 설명해줘.', 'unknown'], ['Output exactly "OK" or "NO".', 'unknown'],
  ['정확히 “OK”만 출력해줘.', 'unknown'], ['~~~\nJSON만 출력해줘\n```', 'unknown'], ['"정확히 \\"OK\\"만 출력해줘."를 설명해줘.', 'unknown'],
  ['정확히 "A\tB"만 출력해줘.', 'unknown'],
];
for (const [prompt, mode, expected] of examples) test(`분류: ${prompt}`, () => {
  const result = classify(prompt, 'clear');
  assert.equal(result.mode, mode);
  if (mode === 'literal') assert.equal(result.expected, expected);
});

test('이력 제한은 새 exact와 해제를 허용하되 불명 이력의 현재 설명은 막는다', () => {
  for (const guard of ['constrained', 'unknown-history']) {
    assert.equal(classify('장단점을 설명해줘.', guard).mode, 'unknown');
    assert.equal(classify('JSON만 출력해줘.', guard).mode, 'json');
    for (const prompt of ['이번 답변은 일반 설명으로 답해줘.', 'For this answer, explain in prose.']) {
      assert.equal(classify(prompt, guard).mode, guard === 'constrained' ? 'prose' : 'unknown');
      assert.equal(classify(`${prompt} JSON만 출력해줘.`, guard).rule, 'conflicting_formats');
    }
    assert.equal(classify('이전 출력 형식 제한을 해제하고 일반 설명으로 답해줘.', guard).reset, true);
  }
});
test('명시적 영어 전용 단서는 해제보다 우선하며 인용에서도 제한 신호를 보존한다', () => {
  for (const prompt of ['Explain caching in English only.', '영어로만 캐시를 설명해줘.', 'Explain caching in ENGLISH ONLY.', 'Reset previous output format restrictions and explain in prose. English only.', '이전 출력 형식 제한을 해제하고 일반 설명으로 답해줘. 영어로만 답해줘.', 'Explain “English only”.', '“영어로만” 설명해줘.']) {
    const contract = classify(prompt, 'clear');
    assert.equal(contract.mode, 'unknown', prompt);
    assert.equal(contract.restricted, true, prompt);
    assert.equal(violation(contract, '**Request summary:** Explain caching.\nA cache stores reusable results.', policy), null);
  }
});
test('유효한 literal 안의 영어 전용 단서와 Unicode는 원문 데이터로 검사한다', () => {
  const expected = ' English only Only English English   only 영어로만 e\u0301\n';
  const contract = classify(`정확히 ${JSON.stringify(expected)}만 출력해줘.`, 'unknown-history');
  assert.equal(contract.mode, 'literal');
  assert.equal(contract.expected, expected);
  assert.equal(violation(contract, expected, policy), null);
  assert.equal(violation(contract, expected.normalize('NFC'), policy), 'literal_mismatch');
});
test('요약 없이 표현은 생략 제한을 보존하고 일반 설명으로 판별하지 않는다', () => {
  for (const prompt of ['요청 요약 없이 캐시를 설명해줘.', 'Explain caching without recap.', 'Explain caching without a recap.']) {
    const contract = classify(prompt, 'clear');
    assert.equal(contract.mode, 'unknown', '명시적 요약 생략은 자동 교정 대상이 아니어야 합니다');
    assert.equal(contract.restricted, true, '후속 턴에도 생략 제한 신호를 보존해야 합니다');
  }
});
test('Never 부정은 출력 계약을 만들지 않고 다른 단어의 일부와 구분한다', () => {
  for (const prompt of ['Never output JSON. Explain caching.', 'Never output exactly "OK".', 'NEVER output JSON. Explain caching.']) {
    assert.equal(classify(prompt, 'clear').mode, 'unknown', '금지한 형식을 출력 계약으로 채택하면 안 됩니다');
  }
  assert.equal(classify('Explain nevermore.', 'clear').mode, 'prose', 'never가 다른 단어의 일부이면 부정으로 처리하면 안 됩니다');
});
test('새 생략과 부정 단서도 literal 안에서는 원문 데이터로 보존한다', () => {
  for (const expected of ['요청 요약 없이 without recap', 'Never output JSON.']) {
    const contract = classify(`정확히 ${JSON.stringify(expected)}만 출력해줘.`, 'clear');
    assert.equal(contract.mode, 'literal', '문자열 내부 단서가 명시적 출력 계약을 무효화하면 안 됩니다');
    assert.equal(contract.expected, expected, '기대 문자열의 원문을 보존해야 합니다');
    assert.equal(violation(contract, expected, policy), null, '원문과 일치하는 응답은 교정하면 안 됩니다');
  }
});
test('형식 질문과 추가 조건이 남은 영어 문장은 출력 계약으로 확정하지 않는다', () => {
  for (const prompt of ['Output exactly "OK" followed by a newline.', 'Output exactly "OK" twice.', 'Can this program output exactly "OK"?', 'Should I output JSON? Explain the trade-offs.', 'Explain why some APIs return JSON.', 'Return JSON only, followed by an explanation.', 'Can this program output code only?']) {
    const contract = classify(prompt, 'clear');
    assert.equal(contract.mode, 'unknown', '문장의 일부만 출력 지시로 채택하면 안 됩니다');
    assert.equal(contract.restricted, true, '형식 해석이 불명확하다는 이력을 유지해야 합니다');
  }
});
test('완결된 영어 지시와 문장 뒤 지시는 기존 출력 계약을 유지한다', () => {
  for (const [prompt, mode] of [['Output exactly "OK"', 'literal'], ['Output exactly "OK"!', 'literal'], ['Explain caching. Output exactly "OK" and nothing else.', 'literal'], ['Return JSON', 'json'], ['Explain caching. Return JSON only.', 'json'], ['Explain caching. Output only code.', 'code']]) {
    const contract = classify(prompt, 'clear');
    assert.equal(contract.mode, mode, '명확한 기존 지시는 계속 판별해야 합니다');
    if (mode === 'literal') assert.equal(contract.expected, 'OK');
  }
  const expected = 'Omit the summary prefix. followed by a newline. ?';
  const contract = classify(`Output exactly ${JSON.stringify(expected)} and nothing else.`, 'clear');
  assert.equal(contract.mode, 'literal', '문자열 내부 문장 부호와 단서는 계약을 끊으면 안 됩니다');
  assert.equal(contract.expected, expected, '문자열 원문을 보존해야 합니다');
});
test('summary와 prefix 생략도 제한 신호로 보존한다', () => {
  for (const prompt of ['Explain caching. Omit the summary prefix.', 'Explain caching. Omit the prefix.', 'Explain caching. Skip the summary.']) {
    const contract = classify(prompt, 'clear');
    assert.equal(contract.mode, 'unknown', '명시적 접두 생략은 교정 대상이 아니어야 합니다');
    assert.equal(contract.restricted, true, '접두 생략을 후속 이력에 반영해야 합니다');
  }
});
test('literal 뒤 후속 문장은 해석하지 않고 제한 이력을 보존한다', () => {
  for (const prompt of ['Output exactly "OK". Append a newline.', 'Output exactly "OK". Repeat it twice.', '정확히 "OK"만 출력해줘. 마지막에 줄바꿈을 추가해줘.', '정확히 "OK"만 출력해줘. 두 번 반복해줘.', 'Output exactly "OK". Append a newline. Output exactly "OK".']) {
    const contract = classify(prompt, 'clear');
    assert.equal(contract.mode, 'unknown', '뒤 문장에 남은 조건을 무시하고 literal을 강제하면 안 됩니다');
    assert.equal(contract.restricted, true, '불명확한 출력 제한을 후속 턴에도 보존해야 합니다');
  }
});
test('단독 literal은 종결 공백과 원문 내부의 후속 지시 문구를 보존한다', () => {
  for (const expected of ['OK', ' e\u0301\nAppend a newline. 두 번 반복해줘. ']) {
    for (const prompt of [`정확히 ${JSON.stringify(expected)}만 출력해줘.\n`, `Output exactly ${JSON.stringify(expected)} and nothing else.\n`]) {
      const contract = classify(prompt, 'clear');
      assert.equal(contract.mode, 'literal', '단독 literal 지시를 계속 검사해야 합니다');
      assert.equal(contract.expected, expected, '문자열 내부의 조건 문구와 원문 바이트를 보존해야 합니다');
      assert.equal(violation(contract, expected, policy), null, '원문과 일치하는 응답은 교정하면 안 됩니다');
      assert.equal(violation(contract, `${expected}\n`, policy), 'literal_mismatch', '실제 추가 개행 위반은 계속 검출해야 합니다');
    }
  }
});
test('원시 응답의 JSON 스칼라와 요약 첫 줄과 문자열 완전 일치를 검사한다', () => {
  for (const raw of ['{}', '[]', '"문자"', 'null', 'true', '12', ' {}\n']) assert.equal(violation({ mode: 'json' }, raw, policy), null);
  for (const raw of ['', '```json\n{}\n```', '{} 뒤 설명', 'undefined']) assert.equal(violation({ mode: 'json' }, raw, policy), 'invalid_json');
  assert.equal(violation({ mode: 'prose' }, '**요청 요약:** 캐시 설명\n본문', policy), null);
  for (const raw of ['', ' **요청 요약:** 내용', '**요청 요약:** \n본문', '본문']) assert.equal(violation({ mode: 'prose' }, raw, policy), 'missing_recap');
  for (const [expected, actual] of [['OK', ' OK'], ['OK', 'OK\n'], ['é', 'e\u0301'], ['A\nB', 'A\\nB']]) assert.equal(violation({ mode: 'literal', expected }, actual, policy), 'literal_mismatch');
  assert.equal(violation({ mode: 'literal', expected: '' }, '', policy), null);
  for (const mode of ['json', 'literal', 'prose', 'code', 'unknown']) assert.equal(violation({ mode }, null, policy), null);
});
async function fixture(t) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'yessr-test-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true }));
  const options = { dataRoot, policyPath };
  const event = (hook_event_name, extra = {}) => ({ hook_event_name, session_id: '세션/../하나', turn_id: '턴-A', ...extra });
  const run = (name, extra) => handle(event(name, extra), options);
  const dir = join(dataRoot, 'state', digest('세션/../하나'));
  const state = async () => JSON.parse(await readFile(join(dir, 'session.json'), 'utf8'));
  await run('SessionStart', { source: 'startup' });
  return { dataRoot, options, event, run, dir, state };
}
const badStop = { stop_hook_active: false, last_assistant_message: '잘못된 결과' };
test('영수증은 검증된 세션 시작 출처만 그대로 기록한다', async t => {
  const f = await fixture(t);
  const sources = ['startup', 'clear', 'resume', 'compact', 'fork'];
  for (const source of sources.slice(1)) await f.run('SessionStart', { source, stop_hook_active: true });
  assert.equal(await f.run('SessionStart', { source: '민감한 잘못된 출처' }), null);
  const receipts = (await readFile(join(f.dir, 'receipts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(receipts.map(r => r.source), sources, '허용된 출처를 정확히 기록하고 잘못된 출처는 기록하지 않아야 합니다');
  assert.equal(receipts.every(r => r.event === 'SessionStart' && !Object.hasOwn(r, 'stopHookActive')), true);
});
test('영수증은 Stop 플래그의 참 거짓 누락을 구별하고 원문을 저장하지 않는다', async t => {
  const f = await fixture(t);
  const flags = [false, true, undefined, null, 0, 'false', '민감한 플래그', {}];
  const prompt = '정확히 "민감한 기대값"만 출력해줘.';
  for (const [index, flag] of flags.entries()) {
    const turn_id = `관측-${index}`;
    await f.run('UserPromptSubmit', { turn_id, prompt, source: '민감한 출처', stop_hook_active: true });
    await f.run('Stop', { turn_id, last_assistant_message: '민감한 응답', source: '민감한 출처', ...(flag === undefined ? {} : { stop_hook_active: flag }) });
  }
  const raw = await readFile(join(f.dir, 'receipts.jsonl'), 'utf8');
  const receipts = raw.trim().split('\n').map(JSON.parse);
  const stops = receipts.filter(r => r.event === 'Stop');
  assert.deepEqual(stops.map(r => r.stopHookActive), [false, true, null, null, null, null, null, null], '불리언만 보존하고 누락되거나 잘못된 값은 null이어야 합니다');
  assert.equal(stops.every(r => !Object.hasOwn(r, 'source')), true);
  assert.equal(receipts.filter(r => r.event === 'UserPromptSubmit').every(r => !Object.hasOwn(r, 'source') && !Object.hasOwn(r, 'stopHookActive')), true);
  for (const value of [prompt, '민감한 기대값', '민감한 응답', '민감한 출처', '민감한 플래그']) assert.equal(raw.includes(value), false, '영수증에 원문을 저장하면 안 됩니다');
});
test('같은 턴의 false 재전달과 true 후속은 최대 한 번만 차단한다', async t => {
  const f = await fixture(t);
  await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  assert.equal((await f.run('Stop', badStop)).decision, 'block');
  assert.equal(await f.run('Stop', badStop), null);
  assert.equal(await f.run('Stop', { ...badStop, stop_hook_active: true }), null);
  const state = await f.state();
  assert.equal(state.turns[digest('턴-A')].correctionConsumed, true);
  const receipts = (await readFile(join(f.dir, 'receipts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(receipts.filter(r => r.blockPrepared).length, 1);
  assert.equal(JSON.stringify(receipts).includes('잘못된 결과'), false);
  assert.equal(JSON.stringify(state).includes('JSON만 출력해줘'), false);
  assert.equal((await stat(f.dir)).mode & 0o777, 0o700);
  assert.equal((await stat(join(f.dir, 'session.json'))).mode & 0o777, 0o600);
});
for (const flag of [true, undefined, null, 0, 'false']) test(`native 플래그 ${String(flag)}는 교정을 요청하지 않는다`, async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  assert.equal(await f.run('Stop', { ...badStop, stop_hook_active: flag }), null);
});
test('빈 응답은 검사하고 null 응답은 건너뛴다', async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: '정확히 ""만 출력해줘.' });
  assert.equal(await f.run('Stop', { ...badStop, last_assistant_message: '' }), null);
  assert.equal((await f.state()).turns[digest('턴-A')].closed, true);
  assert.equal('expected' in (await f.state()).turns[digest('턴-A')], false);
  await f.run('UserPromptSubmit', { turn_id: 'B', prompt: 'JSON만 출력해줘.' });
  assert.equal(await f.run('Stop', { ...badStop, turn_id: 'B', last_assistant_message: null }), null);
  await f.run('UserPromptSubmit', { turn_id: 'C', prompt: 'JSON만 출력해줘.' });
  assert.equal((await f.run('Stop', { ...badStop, turn_id: 'C', last_assistant_message: '' })).decision, 'block');
});
test('같은 키의 A→B→A 충돌은 되돌아오지 않는다', async t => {
  const f = await fixture(t);
  for (const prompt of ['정확히 "A"만 출력해줘.', '정확히 "B"만 출력해줘.', '정확히 "A"만 출력해줘.']) await f.run('UserPromptSubmit', { prompt });
  assert.equal(await f.run('Stop', badStop), null);
  assert.equal((await f.state()).turns[digest('턴-A')].ambiguous, true);
});
test('새 턴은 옛 계약을 닫고 세션은 서로 격리된다', async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: '정확히 "비밀"만 출력해줘.' });
  await f.run('SessionStart', { source: 'clear' });
  await f.run('UserPromptSubmit', { turn_id: 'B', prompt: '캐시를 설명해줘.' });
  assert.equal(await f.run('Stop', badStop), null);
  assert.equal((await f.run('Stop', { ...badStop, turn_id: 'B' })).decision, 'block');
  assert.equal(await f.run('Stop', { ...badStop, session_id: '다른 세션', turn_id: 'B' }), null);
  assert.equal(JSON.stringify(await f.state()).includes('비밀'), false);
});
for (const source of ['startup', 'clear', 'resume', 'compact', 'fork']) test(`수명주기 ${source} 정책 주입과 이력 보호`, async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  await f.run('Stop', badStop);
  const output = await f.run('SessionStart', { source });
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(output.hookSpecificOutput.additionalContext.includes(policy.recapPrefix));
  assert.ok(output.hookSpecificOutput.additionalContext.includes(policy.preservationInstructions[0]));
  await f.run('UserPromptSubmit', { turn_id: 'B', prompt: '캐시를 설명해줘.' });
  assert.equal((await f.state()).turns[digest('B')].mode, ['startup', 'clear'].includes(source) ? 'prose' : 'unknown');
  assert.equal((await f.state()).turns[digest('턴-A')].correctionConsumed, true);
});
test('인용된 형식의 unknown 이력에서는 현재 설명도 억제하고 reset으로만 해제한다', async t => {
  const f = await fixture(t);
  for (const [turn_id, prompt, mode] of [['A', '“JSON만 출력해”라는 문장을 설명해줘.', 'unknown'], ['B', '장단점을 설명해줘.', 'unknown'], ['C', '이번 답변은 일반 설명으로 답해줘.', 'unknown'], ['D', '장단점을 설명해줘.', 'unknown'], ['E', '이전 출력 형식 제한을 해제하고 일반 설명으로 답해줘.', 'prose'], ['F', '장단점을 설명해줘.', 'prose']]) {
    await f.run('UserPromptSubmit', { turn_id, prompt }); assert.equal((await f.state()).turns[digest(turn_id)].mode, mode);
  }
});
test('지속 요약 생략 뒤 새 exact 계약은 검사하되 불명 이력을 해제하지 않는다', async t => {
  const f = await fixture(t);
  await f.run('UserPromptSubmit', { prompt: '앞으로 요청 요약은 생략하고 설명해줘.' });
  assert.equal(await f.run('Stop', badStop), null);
  for (const [turn_id, prompt, mode, response, invalid] of [
    ['JSON', 'JSON만 출력해줘.', 'json', '{}', 'not JSON'],
    ['문자열', '정확히 "OK"만 출력해줘.', 'literal', 'OK', ' OK'],
    ['코드', '코드만 출력해줘.', 'code', 'const value = 1;', null],
  ]) {
    await f.run('UserPromptSubmit', { turn_id, prompt });
    const state = await f.state();
    assert.equal(state.turns[digest(turn_id)].mode, mode);
    assert.equal(state.proseGuard, 'unknown-history');
    if (invalid !== null) assert.equal((await f.run('Stop', { ...badStop, turn_id, last_assistant_message: invalid })).decision, 'block');
    assert.equal(await f.run('Stop', { ...badStop, turn_id, last_assistant_message: response }), null);
    const proseTurn = `${turn_id}-설명`;
    await f.run('UserPromptSubmit', { turn_id: proseTurn, prompt: '이번 답변은 일반 설명으로 답해줘.' });
    assert.equal((await f.state()).turns[digest(proseTurn)].mode, 'unknown');
    assert.equal(await f.run('Stop', { ...badStop, turn_id: proseTurn }), null);
  }
  await f.run('UserPromptSubmit', { turn_id: '해제', prompt: '이전 출력 형식 제한을 해제하고 일반 설명으로 답해줘.' });
  assert.equal((await f.state()).proseGuard, 'clear');
  assert.equal((await f.run('Stop', { ...badStop, turn_id: '해제' })).decision, 'block');
});
test('알려진 exact 이력에서는 현재 설명 교정과 guard 유지를 허용한다', async t => {
  const f = await fixture(t);
  await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  assert.equal(await f.run('Stop', { ...badStop, last_assistant_message: '{}' }), null);
  await f.run('UserPromptSubmit', { turn_id: '설명', prompt: '이번 답변은 일반 설명으로 답해줘.' });
  assert.equal((await f.state()).proseGuard, 'constrained');
  assert.equal((await f.run('Stop', { ...badStop, turn_id: '설명' })).decision, 'block');
});
test('자체 교정 요청은 새 인간 계약을 만들지 않는다', async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  const block = await f.run('Stop', badStop);
  assert.ok(block.reason.startsWith('YESSR_CORRECTION:'));
  await f.run('UserPromptSubmit', { turn_id: 'synthetic', prompt: block.reason });
  assert.equal((await f.state()).turns[digest('synthetic')], undefined);
  assert.equal(await f.run('Stop', { ...badStop, turn_id: 'synthetic' }), null);
});
for (const damage of ['missing', 'corrupt', 'directory']) test(`상태 ${damage} 오류에서는 이전 계약을 사용하지 않는다`, async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  const path = join(f.dir, 'session.json'); await rm(path);
  if (damage === 'corrupt') await writeFile(path, '{');
  if (damage === 'directory') await mkdir(path);
  assert.equal(await f.run('Stop', badStop), null);
});
test('소비 상태 저장 실패와 영수증 저장 실패에서는 stdout을 준비하지 않는다', async t => {
  for (const target of ['session.json', 'receipts.jsonl']) {
    const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
    await rm(join(f.dir, target)); await mkdir(join(f.dir, target));
    assert.equal(await f.run('Stop', badStop), null);
  }
});
test('디렉터리 쓰기 권한 실패가 나면 block하지 않는다', async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  await chmod(join(f.dir, 'session.json'), 0o400);
  await chmod(f.dir, 0o500);
  try { assert.equal(await f.run('Stop', badStop), null); }
  finally { await chmod(f.dir, 0o700); }
  assert.equal((await f.state()).turns[digest('턴-A')].correctionConsumed, false);
});
test('합성 파일시스템 오류 주입: 소비 상태 rename 실패는 교정과 임시 파일을 남기지 않는다', async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: '정확히 "민감 값"만 출력해줘.' });
  const realRename = fs.rename;
  let prepared;
  t.mock.method(fs, 'rename', async (from, to) => {
    if (to === join(f.dir, 'session.json')) {
      prepared = JSON.parse(await readFile(from, 'utf8'));
      throw Object.assign(new Error('합성 rename 실패'), { code: 'EIO' });
    }
    return realRename(from, to);
  });
  syncBuiltinESMExports();
  try { assert.equal(await f.run('Stop', badStop), null); }
  finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
  assert.equal(prepared.turns[digest('턴-A')].correctionConsumed, true);
  assert.equal((await f.state()).turns[digest('턴-A')].correctionConsumed, false);
  assert.equal((await readdir(f.dir)).some(name => name.endsWith('.tmp')), false);
  const receipts = (await readFile(join(f.dir, 'receipts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(receipts.some(r => r.blockPrepared), false);
});
test('교정 reason은 해당 형식 계약만 담고 일반 문체 지침을 추가하지 않는다', async t => {
  const f = await fixture(t);
  for (const [turn_id, prompt, required] of [
    ['json', 'JSON만 출력해줘.', { parser: 'JSON.parse', input: 'entire raw response' }],
    ['literal', '정확히 "비밀\\n문자"만 출력해줘.', { literalData: '비밀\n문자' }],
    ['prose', '이번 답변은 일반 설명으로 답해줘.', { prefix: policy.recapPrefix, firstSummaryLine: 'nonempty' }],
  ]) {
    await f.run('UserPromptSubmit', { turn_id, prompt });
    const block = await f.run('Stop', { ...badStop, turn_id });
    const descriptor = JSON.parse(block.reason.slice('YESSR_CORRECTION: '.length));
    assert.equal(descriptor.formatOnly, true); assert.equal(descriptor.preserveOriginalTask, true);
    assert.deepEqual(descriptor.required, required);
    for (const sentence of policy.clarityInstructions) assert.equal(block.reason.includes(sentence), false);
  }
  assert.equal((await readFile(join(f.dir, 'receipts.jsonl'), 'utf8')).includes('비밀'), false);
});
test('영수증 실패 후에도 저장된 소비 상태를 다시 열지 않는다', async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: '정확히 "비밀"만 출력해줘.' });
  await rm(join(f.dir, 'receipts.jsonl')); await mkdir(join(f.dir, 'receipts.jsonl'));
  assert.equal(await f.run('Stop', badStop), null);
  assert.equal((await f.state()).turns[digest('턴-A')].correctionConsumed, true);
  await rm(join(f.dir, 'receipts.jsonl'), { recursive: true });
  assert.equal(await f.run('Stop', badStop), null);
  await f.run('UserPromptSubmit', { prompt: '정확히 "비밀"만 출력해줘.' });
  assert.equal(await f.run('Stop', badStop), null);
});
test('코드와 unknown은 자동 교정하지 않으며 닫힌 계약은 다시 열지 않는다', async t => {
  const f = await fixture(t);
  for (const [turn_id, prompt] of [['code', '코드만 출력해줘.'], ['unknown', 'JSON이 무엇인지 설명해줘.']]) {
    await f.run('UserPromptSubmit', { turn_id, prompt });
    assert.equal(await f.run('Stop', { ...badStop, turn_id }), null);
    await f.run('UserPromptSubmit', { turn_id, prompt });
    assert.equal((await f.state()).turns[digest(turn_id)].closed, true);
  }
});
test('심볼릭 링크 상태와 marker 읽기 오류는 교정을 막는다', async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  const original = await readFile(join(f.dir, 'session.json'), 'utf8');
  const outside = join(f.dataRoot, 'outside.json'); await writeFile(outside, original, { mode: 0o600 });
  await rm(join(f.dir, 'session.json')); await symlink(outside, join(f.dir, 'session.json'));
  assert.equal(await f.run('Stop', badStop), null);
  await rm(join(f.dir, 'session.json')); await writeFile(join(f.dir, 'session.json'), original, { mode: 0o600 });
  await mkdir(join(f.dir, 'uncertainty'));
  assert.equal(await f.run('Stop', badStop), null);
});
test('lock 경합 표시와 reset 경합은 이후 Stop을 억제한다', async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  await mkdir(join(f.dir, 'lock'));
  assert.equal(await f.run('UserPromptSubmit', { turn_id: 'reset', prompt: '이전 출력 형식 제한을 해제하고 일반 설명으로 답해줘.' }), null);
  await rm(join(f.dir, 'lock'), { recursive: true });
  assert.equal(await f.run('Stop', badStop), null);
  await f.run('UserPromptSubmit', { turn_id: 'fresh', prompt: 'JSON만 출력해줘.' });
  assert.equal(await f.run('Stop', { ...badStop, turn_id: 'fresh' }), null);
});
async function processRun(f, payload, splitAt) {
  const input = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const observer = `
    import { pathToFileURL } from 'node:url';
    const iterate = process.stdin[Symbol.asyncIterator].bind(process.stdin);
    process.stdin[Symbol.asyncIterator] = async function* () {
      for await (const chunk of iterate()) { yield chunk; process.send('read'); }
    };
    await import(pathToFileURL(process.argv[1]).href);
    process.disconnect();
  `;
  const child = spawn(process.execPath, splitAt === undefined ? [handlerPath] : ['--input-type=module', '-e', observer, handlerPath], {
    env: { ...process.env, PLUGIN_DATA: f.dataRoot }, stdio: ['pipe', 'pipe', 'pipe', ...(splitAt === undefined ? [] : ['ipc'])], timeout: 10000,
  });
  let stdout = '', stderr = ''; child.stdout.setEncoding('utf8').on('data', b => { stdout += b; }); child.stderr.setEncoding('utf8').on('data', b => { stderr += b; });
  if (splitAt === undefined) child.stdin.end(input);
  else {
    // 첫 청크를 실제로 소비한 뒤 나머지를 보내어 OS 파이프의 청크 병합을 막습니다.
    child.once('message', () => child.stdin.end(input.subarray(splitAt)));
    child.stdin.write(input.subarray(0, splitAt));
  }
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 0); assert.equal(stderr, '');
  return stdout ? JSON.parse(stdout) : null;
}
test('실제 프로세스는 UTF-8 중간에서 나눈 요청의 원문 literal을 보존한다', async t => {
  const f = await fixture(t);
  const input = f.event('UserPromptSubmit', { prompt: '정확히 "한"만 출력해줘.' });
  const splitAt = Buffer.from(JSON.stringify(input)).indexOf(Buffer.from('한')) + 1;
  assert.equal(await processRun(f, input, splitAt), null);
  const stored = (await f.state()).turns[digest('턴-A')].expected;
  const stop = await processRun(f, f.event('Stop', { ...badStop, last_assistant_message: '한' }));
  assert.deepEqual({ stored, stop }, { stored: '한', stop: null }, '원문을 보존하고 올바른 응답을 차단하지 않아야 합니다');
});
test('실제 프로세스는 UTF-8 중간에서 나눈 올바른 Stop 응답을 차단하지 않는다', async t => {
  const f = await fixture(t);
  await processRun(f, f.event('UserPromptSubmit', { prompt: '정확히 "한"만 출력해줘.' }));
  const input = f.event('Stop', { ...badStop, last_assistant_message: '한' });
  const splitAt = Buffer.from(JSON.stringify(input)).indexOf(Buffer.from('한')) + 1;
  assert.equal(await processRun(f, input, splitAt), null, '청크 경계가 올바른 응답을 바꾸면 안 됩니다');
});
test('실제 자식 프로세스 stdin/stdout은 정책 주입과 단일 교정 계약을 지킨다', async t => {
  const f = await fixture(t);
  assert.equal((await processRun(f, f.event('SessionStart', { source: 'startup' }))).hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(await processRun(f, f.event('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' })), null);
  assert.equal((await processRun(f, f.event('Stop', badStop))).decision, 'block');
  assert.equal(await processRun(f, f.event('Stop', badStop)), null);
  for (const input of ['{', 'null', '[]', '{}']) assert.equal(await processRun(f, input), null);
});
test('실제 프로세스는 영어 전용 요청에 한국어 접두 교정을 보내지 않는다', async t => {
  for (const prompt of ['Explain caching in English only.', '영어로만 캐시를 설명해줘.', 'Explain caching. Only English.', 'Explain caching in English   only.']) {
    const f = await fixture(t);
    await processRun(f, f.event('SessionStart', { source: 'startup' }));
    assert.equal(await processRun(f, f.event('UserPromptSubmit', { prompt })), null);
    assert.equal(await processRun(f, f.event('Stop', { ...badStop, last_assistant_message: '**Request summary:** Explain caching.\nA cache stores reusable results.' })), null);
    const state = await f.state();
    assert.equal(state.turns[digest('턴-A')].mode, 'unknown');
    assert.equal(state.proseGuard, 'unknown-history');
    const receipts = (await readFile(join(f.dir, 'receipts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(receipts.some(r => r.blockPrepared), false);
    assert.equal(classify(`Explain ${JSON.stringify(prompt)}.`, 'clear').rule, 'quoted_format_instruction');
  }
});
for (const [name, prompt, response] of [
  ['한국어 요약 생략', '요청 요약 없이 캐시를 설명해줘.', '캐시는 재사용할 데이터를 보관합니다.'],
  ['영문 요약 생략', 'Explain caching without recap.', 'A cache stores reusable results.'],
  ['JSON 부정', 'Never output JSON. Explain caching.', '**요청 요약:** 캐시를 설명합니다.\n캐시는 재사용할 데이터를 보관합니다.'],
  ['문자열 부정', 'Never output exactly "OK".', 'Understood.'],
  ['문자열 뒤 개행 조건', 'Output exactly "OK" followed by a newline.', 'OK\n'],
  ['문자열 반복 조건', 'Output exactly "OK" twice.', 'OKOK'],
  ['JSON 형식 질문', 'Should I output JSON? Explain the trade-offs.', '**요청 요약:** JSON의 장단점을 설명합니다.\nJSON은 구조화된 데이터 교환에 유용합니다.'],
  ['문자열 출력 가능성 질문', 'Can this program output exactly "OK"?', 'The program can output that value.'],
  ['영문 요약 접두 생략', 'Explain caching. Omit the summary prefix.', 'A cache stores reusable results.'],
  ['영문 후속 문장 개행', 'Output exactly "OK". Append a newline.', 'OK\n'],
  ['영문 후속 문장 반복', 'Output exactly "OK". Repeat it twice.', 'OKOK'],
  ['한글 후속 문장 개행', '정확히 "OK"만 출력해줘. 마지막에 줄바꿈을 추가해줘.', 'OK\n'],
  ['한글 후속 문장 반복', '정확히 "OK"만 출력해줘. 두 번 반복해줘.', 'OKOK'],
]) test(`실제 프로세스 회귀: ${name} 요청을 반대로 교정하지 않는다`, async t => {
  const f = await fixture(t);
  await processRun(f, f.event('SessionStart', { source: 'startup' }));
  assert.equal(await processRun(f, f.event('UserPromptSubmit', { prompt })), null);
  assert.equal(await processRun(f, f.event('Stop', { ...badStop, last_assistant_message: response })), null, '요청에 맞는 응답에 반대 형식의 교정을 보내면 안 됩니다');
  assert.equal((await f.state()).proseGuard, 'unknown-history', '불명확한 형식 이력을 유지해야 합니다');
  await processRun(f, f.event('UserPromptSubmit', { turn_id: '후속', prompt: '이번 답변은 일반 설명으로 답해줘.' }));
  assert.equal(await processRun(f, f.event('Stop', { ...badStop, turn_id: '후속', last_assistant_message: response })), null, '후속 설명 요청이 이전 제한을 임의로 지우면 안 됩니다');
  await processRun(f, f.event('UserPromptSubmit', { turn_id: '해제', prompt: '이전 출력 형식 제한을 해제하고 일반 설명으로 답해줘.' }));
  assert.equal((await processRun(f, f.event('Stop', { ...badStop, turn_id: '해제' }))).decision, 'block', '명시적 해제 후에는 일반 설명 검사가 다시 작동해야 합니다');
});
test('동시 실제 프로세스는 block과 blockPrepared를 각각 최대 한 번만 만든다', async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  const results = await Promise.all(Array.from({ length: 8 }, () => processRun(f, f.event('Stop', badStop))));
  assert.ok(results.filter(r => r?.decision === 'block').length <= 1);
  const receipts = (await readFile(join(f.dir, 'receipts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(receipts.filter(r => r.blockPrepared).length <= 1);
});
test('손상 정책과 잘못된 이벤트는 차단하지 않는다', async t => {
  const f = await fixture(t); const broken = join(f.dataRoot, 'policy.json'); await writeFile(broken, '{}');
  assert.equal(await handle(f.event('SessionStart', { source: 'startup' }), { ...f.options, policyPath: broken }), null);
  for (const input of [null, [], {}, f.event('Stop', { session_id: '' }), f.event('UserPromptSubmit', { prompt: 42 }), f.event('SessionStart', { source: 'other' })]) assert.equal(await handle(input, f.options), null);
});
test('세션 파일이 사라진 뒤 startup도 이전 소비 계약을 복구하지 않는다', async t => {
  const f = await fixture(t); await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  assert.equal((await f.run('Stop', badStop)).decision, 'block');
  await rm(join(f.dir, 'session.json'));
  await f.run('SessionStart', { source: 'startup' });
  await f.run('UserPromptSubmit', { prompt: 'JSON만 출력해줘.' });
  assert.equal(await f.run('Stop', badStop), null);
});
test('첫 true 또는 잘못된 flag 뒤 false가 와도 닫힌 턴을 다시 교정하지 않는다', async t => {
  const f = await fixture(t);
  for (const [turn_id, flag] of [['true', true], ['missing', undefined], ['invalid', 'false']]) {
    await f.run('UserPromptSubmit', { turn_id, prompt: 'JSON만 출력해줘.' });
    assert.equal(await f.run('Stop', { ...badStop, turn_id, stop_hook_active: flag }), null);
    assert.equal(await f.run('Stop', { ...badStop, turn_id }), null);
  }
});
test('호스트의 기존 0755 데이터 루트를 보존하고 하위 상태만 사용자 전용으로 만든다', async t => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'yessr-host-root-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true }));
  await chmod(dataRoot, 0o755);
  const options = { dataRoot, policyPath }, session_id = '호스트 권한 시험', turn_id = '턴';
  const output = await handle({ hook_event_name: 'SessionStart', source: 'startup', session_id }, options);
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  await handle({ hook_event_name: 'UserPromptSubmit', session_id, turn_id, prompt: 'JSON만 출력해줘.' }, options);
  assert.equal((await handle({ hook_event_name: 'Stop', session_id, turn_id, ...badStop }, options)).decision, 'block');
  assert.equal((await stat(dataRoot)).mode & 0o777, 0o755);
  for (const path of [join(dataRoot, 'state'), join(dataRoot, 'state', digest(session_id))]) assert.equal((await stat(path)).mode & 0o777, 0o700);
  assert.equal((await stat(join(dataRoot, 'state', digest(session_id), 'session.json'))).mode & 0o777, 0o600);
});

test('레거시 v1 계약은 교정 사용 이력을 보존하며 닫고 같은 키로 재개하지 않는다', async t => {
  const f = await fixture(t);
  assert.equal((await f.state()).version, 2, '새 세션은 v2 상태를 생성해야 합니다');
  const prompt = 'Explain caching in English only.';
  const active = digest('턴-A'), consumed = digest('이미 교정'), literal = digest('손상 문자열');
  const legacy = { version: 1, proseGuard: 'clear', ready: true, activeTurn: active, acknowledged: '', turns: {
    [active]: { mode: 'prose', rule: 'prose_request', promptDigest: digest(prompt), ambiguous: false, closed: false, correctionConsumed: false },
    [consumed]: { mode: 'json', rule: 'json_request', promptDigest: digest('JSON만 출력해줘.'), ambiguous: true, closed: true, correctionConsumed: true },
    [literal]: { mode: 'literal', rule: 'literal_request', promptDigest: digest('정확히 "한"만 출력해줘.'), expected: '���', ambiguous: false, closed: false, correctionConsumed: true },
  } };
  await writeFile(join(f.dir, 'session.json'), JSON.stringify(legacy), { mode: 0o600 });
  assert.equal(await processRun(f, f.event('Stop', { ...badStop, last_assistant_message: 'A cache stores results.' })), null, '구형 prose 계약으로 한국어 접두를 요구하면 안 됩니다');
  let state = await f.state();
  assert.equal(state.version, 2);
  assert.equal(state.activeTurn, null);
  assert.equal(state.proseGuard, 'unknown-history');
  assert.equal(state.ready, legacy.ready);
  assert.equal(state.acknowledged, legacy.acknowledged);
  assert.deepEqual(state.turns, Object.fromEntries(Object.entries(legacy.turns).map(([key, { expected, ...turn }]) => [key, { ...turn, closed: true }])), '모든 턴과 교정 소비 여부를 보존하고 기대값만 제거해야 합니다');
  for (const [turn_id, repeat] of [['턴-A', prompt], ['손상 문자열', '정확히 "한"만 출력해줘.']]) {
    await f.run('UserPromptSubmit', { turn_id, prompt: repeat });
    assert.equal(await f.run('Stop', { ...badStop, turn_id }), null, '같은 키를 다시 제출해도 닫힌 계약을 열면 안 됩니다');
    assert.equal((await f.state()).turns[digest(turn_id)].closed, true);
  }
  await f.run('UserPromptSubmit', { turn_id: '새 문자열', prompt: '정확히 "한"만 출력해줘.' });
  const correction = await processRun(f, f.event('Stop', { ...badStop, turn_id: '새 문자열' }));
  assert.equal(correction.decision, 'block');
  assert.equal(JSON.parse(correction.reason.slice('YESSR_CORRECTION: '.length)).required.literalData, '한');
  await f.run('UserPromptSubmit', { turn_id: '새 설명', prompt: '캐시를 설명해줘.' });
  state = await f.state();
  assert.equal(state.proseGuard, 'unknown-history');
  assert.equal(state.turns[digest('새 설명')].mode, 'unknown');
  assert.equal(state.turns[consumed].correctionConsumed, true);
  assert.equal(state.turns[literal].correctionConsumed, true);
});

test('비활성 literal의 후속 Stop은 거짓 위반을 기록하지 않으며 활성 교정 후속은 검사한다', async t => {
  const f = await fixture(t);
  await f.run('UserPromptSubmit', { prompt: '정확히 "OK"만 출력해줘.' });
  assert.equal(await f.run('Stop', { ...badStop, last_assistant_message: 'OK' }), null);
  assert.equal(await processRun(f, f.event('Stop', { stop_hook_active: true, last_assistant_message: 'OK' })), null);
  let receipts = (await readFile(join(f.dir, 'receipts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(receipts.at(-1).mode, 'unknown');
  assert.equal(receipts.at(-1).code, 'inactive_contract');
  assert.equal(receipts.at(-1).blockPrepared, false);
  await f.run('UserPromptSubmit', { turn_id: '교정', prompt: '정확히 "OK"만 출력해줘.' });
  assert.equal((await f.run('Stop', { ...badStop, turn_id: '교정' })).decision, 'block');
  assert.equal(await f.run('Stop', { ...badStop, turn_id: '교정', stop_hook_active: true }), null);
  receipts = (await readFile(join(f.dir, 'receipts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(receipts.at(-1).mode, 'literal');
  assert.equal(receipts.at(-1).code, 'literal_mismatch');
  assert.equal(receipts.at(-1).blockPrepared, false);
});
