import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ending = '(?:해\\s*(?:주십시오|주세요|줘)?|하라|하세요|하십시오)';
const verb = `(?:(?:출력|반환|답변|응답|답)\\s*${ending}|보여\\s*(?:줘|주세요))`;
const boundary = '(?=$|[\\s.!?])';
const instructionStart = '(?:^|[.!?]\\s+)';
const instructionEnd = '(?=\\s*(?:[.!](?:\\s|$)|$))';
const trailingContent = /[^\s.!?]/;
const lexeme = '"(?:[^"\\\\\\r\\n]|\\\\["\\\\/bfnrt]|\\\\u[0-9A-Fa-f]{4})*"';
const formatHint = /JSON|코드만|code only|only code|정확히|exactly|고정 문자열|literal|원문 그대로|verbatim|만\s*(?:출력|답)|only (?:output|return)|nothing else|CSV|TSV|YAML|YML|XML|HTML|표만|테이블만|Markdown만/i;
const omission = /요청 요약(?:은 생략| 없이)|요약을 생략|복명복창 없이|요청 요약을 붙이지|접두 없이|\b(?:omit|skip)\s+(?:the\s+)?(?:recap|summary(?:\s+prefix)?|prefix)\b|no recap|without (?:a )?recap/i;
const languageHint = /영어로만|\b(?:English\s+only|only\s+English)\b/i;
const rejected = /하지 마|하지 말|하지 않|말고|금지|만약|조건|아니면|그렇지 않으면|[가-힣]+(?:라면|다면|으면)(?=\s|[,.:!?]|$)|\b(?:do not|don't|must not|never|if|unless|otherwise)\b|예시:|인용:|원문:|로그:|라는 문장|라고 지시/i;

function maskedPrompt(prompt) {
  const literals = [];
  const pattern = new RegExp(`정확히\\s+(${lexeme})만\\s*${verb}${boundary}|${instructionStart}(?:output|return|reply with)\\s+exactly\\s+(${lexeme})(?:\\s+and nothing else)?${instructionEnd}`, 'gi');
  for (const match of prompt.matchAll(pattern)) {
    const raw = match[1] ?? match[2];
    const start = match.index + match[0].indexOf(raw);
    try { literals.push({ start, end: start + raw.length, commandStart: match.index, commandEnd: match.index + match[0].length, expected: JSON.parse(raw) }); }
    catch { /* JSON 문자열 안의 원시 제어 문자는 계약으로 채택하지 않는다. */ }
  }
  const chars = prompt.split('');
  const constraintChars = [...chars];
  let quoted = false, ambiguous = false;
  const payloads = [];
  const mask = (start, end, payload = false) => {
    const text = prompt.slice(start, end);
    if (!payload && (formatHint.test(text) || omission.test(text) || languageHint.test(text))) quoted = true;
    for (let j = start; j < end; j++) if (chars[j] !== '\n') {
      chars[j] = ' ';
      if (payload || /[.!?]/.test(constraintChars[j])) constraintChars[j] = ' ';
    }
  };
  for (let i = 0; i < prompt.length;) {
    const lineStart = i === 0 || prompt[i - 1] === '\n';
    if (lineStart) {
      const lineEnd = prompt.indexOf('\n', i) < 0 ? prompt.length : prompt.indexOf('\n', i);
      const line = prompt.slice(i, lineEnd);
      const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) {
        const closing = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`, 'm');
        const rest = prompt.slice(lineEnd + 1), close = closing.exec(rest);
        if (!close) { ambiguous = true; mask(i, prompt.length); break; }
        const end = lineEnd + 1 + close.index + close[0].length;
        mask(i, end); i = end; continue;
      }
      if (/^(?: {0,3}>| {4}|\t)/.test(line)) { mask(i, lineEnd); i = lineEnd + 1; continue; }
    }
    const payload = literals.find(value => value.start === i && chars.slice(value.commandStart, i).join('') === prompt.slice(value.commandStart, i));
    if (payload) { payloads.push(payload); mask(i, payload.end, true); i = payload.end; continue; }
    const c = prompt[i];
    if (c === '`') {
      const run = /^`+/.exec(prompt.slice(i))[0], end = prompt.indexOf(run, i + run.length);
      if (end < 0 || prompt.slice(i, end).includes('\n')) { ambiguous = true; break; }
      mask(i, end + run.length); i = end + run.length; continue;
    }
    const pairs = { '"': '"', "'": "'", '“': '”', '‘': '’' };
    if (c === "'" && /[A-Za-z]/.test(prompt[i - 1] ?? '') && /[A-Za-z]/.test(prompt[i + 1] ?? '')) { i++; continue; }
    if (pairs[c]) {
      let end = i + 1;
      while (end < prompt.length && (prompt[end] !== pairs[c] || prompt[end - 1] === '\\')) end++;
      if (end === prompt.length) { ambiguous = true; break; }
      const inside = prompt.slice(i + 1, end);
      if (/[“”‘’]/.test(inside) || (c !== '"' && inside.includes('"'))) ambiguous = true;
      mask(i, end + 1); i = end + 1; continue;
    }
    if (/[”’]/.test(c)) ambiguous = true;
    i++;
  }
  return { view: chars.join(''), constraintView: constraintChars.join(''), payloads, quoted, ambiguous };
}

export function classify(prompt, proseGuard = 'unknown-history') {
  if (typeof prompt !== 'string') return { mode: 'unknown', rule: 'invalid_prompt', restricted: false };
  const { view, constraintView, payloads, quoted, ambiguous } = maskedPrompt(prompt);
  const hasOutputConstraint = /코드\s*(?:펜스|블록)|\bcode\s+(?:fence|block)s?\b/i.test(constraintView) || constraintView.split(/[.!?](?=\s|$)/).some(clause => {
    const actionIndex = clause.search(/\b(?:include|add|put|append|prepend)\b/i);
    const detailIndex = clause.search(/설명|제목|개행|줄바꿈/);
    return (actionIndex >= 0 && /\b(?:explanation|heading|title|newline|line\s+break)s?\b/i.test(clause.slice(actionIndex)))
      || (detailIndex >= 0 && /붙|추가|넣|포함/.test(clause.slice(detailIndex)));
  });
  const restricted = hasOutputConstraint || formatHint.test(prompt) || omission.test(prompt) || languageHint.test(prompt);
  const unknown = rule => ({ mode: 'unknown', rule, restricted });
  if (ambiguous) return unknown('ambiguous_delimiter');
  if (quoted) return unknown('quoted_format_instruction');
  if (omission.test(view)) return unknown('recap_omission');
  if (languageHint.test(view)) return unknown('language_constraint');
  if (rejected.test(view)) return unknown('negation_condition_example');
  if (hasOutputConstraint) return unknown('output_constraint');
  if (payloads.length && /또는|\bor\b/i.test(view)) return unknown('alternative_literals');
  if (/CSV|TSV|YAML|YML|XML|HTML|표만|테이블만|Markdown만/i.test(view)) return unknown('unsupported_format');
  const candidates = payloads.map(p => ({ mode: 'literal', expected: p.expected, rule: 'literal' }));
  const jsonCommand = new RegExp(`JSON(?:으로만|만|으로| 형식으로)\\s*${verb}${boundary}|${instructionStart}(?:(?:return|output|reply with|respond with)\\s+(?:only\\s+)?JSON(?:\\s+only)?|JSON only|only JSON)${instructionEnd}`, 'i').exec(view);
  if (jsonCommand) candidates.push({ mode: 'json', rule: 'json' });
  if (new RegExp(`코드만\\s*${verb}${boundary}|${instructionStart}(?:return|output)\\s+(?:only code|code only)${instructionEnd}`, 'i').test(view)) candidates.push({ mode: 'code', rule: 'code' });
  const reset = new RegExp(`이전 출력 형식 제한을 해제하고 일반 설명으로\\s*(?:답|응답)\\s*${ending}${boundary}|Reset previous output format restrictions and explain in prose\\.`, 'i').test(view);
  const currentProse = new RegExp(`이번 답변은 일반 설명으로\\s*(?:답|응답)\\s*${ending}${boundary}|For this answer, explain in prose\\.`, 'i').test(view);
  if (reset || currentProse) candidates.push({ mode: 'prose', rule: reset ? 'reset' : 'current_prose', reset });
  const unique = new Set(candidates.map(c => JSON.stringify([c.mode, c.expected])));
  if (unique.size > 1) return unknown('conflicting_formats');
  if (payloads.some(p => trailingContent.test(prompt.slice(p.commandEnd)))) return unknown('literal_trailing_content');
  if (jsonCommand && trailingContent.test(prompt.slice(jsonCommand.index + jsonCommand[0].length))) return unknown('json_trailing_content');
  if (currentProse && !reset && proseGuard === 'unknown-history') return unknown('history_guard');
  if (candidates.length) return { ...candidates[0], restricted };
  if (restricted) return unknown('format_without_contract');
  if (proseGuard !== 'clear') return unknown('history_guard');
  if (new RegExp(`(?:설명|비교|요약|분석|검토|정리)\\s*${ending}${boundary}|(?:^|[.!?]\\s*)(?:explain|compare|summarize|analyze|analyse|review|describe)\\b`, 'i').test(view)) return { mode: 'prose', rule: 'prose_task', restricted };
  return unknown('no_positive_request');
}

export function violation(contract, response, policy) {
  if (typeof response !== 'string') return null;
  switch (contract.mode) {
    case 'prose': return response.startsWith(policy.recapPrefix) && response.slice(policy.recapPrefix.length).split(/\r?\n/, 1)[0].trim() ? null : 'missing_recap';
    case 'json': try { JSON.parse(response); return null; } catch { return 'invalid_json'; }
    case 'literal': return response === contract.expected ? null : 'literal_mismatch';
    default: return null;
  }
}

async function privateDirectory(path, hostRoot = false) {
  const created = await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & (hostRoot ? 0o022 : 0o077))) throw new Error('unsafe_directory');
  return created !== undefined;
}
async function readPrivate(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || (info.mode & 0o077)) throw new Error('unsafe_file');
    return await file.readFile('utf8');
  } finally { await file.close(); }
}
async function atomicWrite(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  const file = await open(temp, 'wx', 0o600);
  try {
    try { await file.writeFile(JSON.stringify(value)); await file.sync(); }
    finally { await file.close(); }
    await rename(temp, path);
  }
  finally { await rm(temp, { force: true }); }
}
async function marker(dir) {
  try { return await readPrivate(join(dir, 'uncertainty')); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}
function validState(state) {
  return [1, 2].includes(state?.version) && ['clear', 'constrained', 'unknown-history'].includes(state.proseGuard)
    && typeof state.ready === 'boolean' && typeof state.acknowledged === 'string'
    && (state.activeTurn === null || /^[a-f0-9]{64}$/.test(state.activeTurn))
    && state.turns && typeof state.turns === 'object' && !Array.isArray(state.turns)
    && Object.entries(state.turns).every(([key, turn]) => /^[a-f0-9]{64}$/.test(key)
      && /^[a-f0-9]{64}$/.test(turn.promptDigest) && ['prose', 'json', 'literal', 'code', 'unknown'].includes(turn.mode)
      && typeof turn.rule === 'string' && ['ambiguous', 'closed', 'correctionConsumed'].every(k => typeof turn[k] === 'boolean')
      && (turn.mode !== 'literal' || turn.closed || typeof turn.expected === 'string'));
}
function closeTurn(turn) { turn.closed = true; delete turn.expected; }

export async function handle(input, options = {}) {
  let dir, locked = false;
  try {
    if (!input || Array.isArray(input) || typeof input !== 'object' || typeof input.session_id !== 'string' || !input.session_id.length) return null;
    const event = input.hook_event_name;
    if (!['SessionStart', 'UserPromptSubmit', 'Stop'].includes(event)) return null;
    const turnId = input.turn_id === undefined ? input.prompt_id : input.turn_id;
    if (event === 'SessionStart' ? !['startup', 'resume', 'clear', 'compact', 'fork'].includes(input.source)
      : typeof turnId !== 'string' || !turnId.length) return null;
    if (event === 'UserPromptSubmit' && typeof input.prompt !== 'string') return null;
    if (event === 'Stop' && input.last_assistant_message !== null && typeof input.last_assistant_message !== 'string') return null;
    const policy = JSON.parse(await readFile(options.policyPath ?? join(dirname(fileURLToPath(import.meta.url)), '../policy.json'), 'utf8'));
    if (Object.keys(policy).sort().join() !== ['clarityInstructions', 'exactOutputInstructions', 'preservationInstructions', 'recapPrefix'].sort().join()
      || typeof policy.recapPrefix !== 'string' || !policy.recapPrefix.trim()
      || !['clarityInstructions', 'preservationInstructions', 'exactOutputInstructions'].every(k => Array.isArray(policy[k]) && policy[k].length && policy[k].every(v => typeof v === 'string' && v.trim()))) return null;
    const context = [policy.recapPrefix, ...policy.clarityInstructions, ...policy.preservationInstructions, ...policy.exactOutputInstructions].join('\n');
    const dataRoot = options.dataRoot ?? process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA;
    if (typeof dataRoot !== 'string' || !dataRoot) return null;
    await privateDirectory(dataRoot, true); await privateDirectory(join(dataRoot, 'state'));
    dir = join(dataRoot, 'state', digest(input.session_id)); const newSession = await privateDirectory(dir);
    try { await mkdir(join(dir, 'lock'), { mode: 0o700 }); locked = true; }
    catch (error) { if (error.code === 'EEXIST') await atomicWrite(join(dir, 'uncertainty'), randomUUID()); return null; }
    const observedMarker = await marker(dir);
    let state;
    try { state = JSON.parse(await readPrivate(join(dir, 'session.json'))); if (!validState(state)) throw new Error('invalid_state'); }
    catch (error) {
      if (event === 'Stop') return null;
      state = { version: 2, proseGuard: 'unknown-history', ready: false, activeTurn: null, acknowledged: observedMarker, turns: {} };
      if (error.code !== 'ENOENT' || !newSession) await atomicWrite(join(dir, 'uncertainty'), randomUUID());
    }
    if (state.version === 1) {
      for (const turn of Object.values(state.turns)) closeTurn(turn);
      state.activeTurn = null;
      state.proseGuard = 'unknown-history';
      state.version = 2;
    }
    const turnKey = event === 'SessionStart' ? null : digest(turnId);
    const receipt = { plugin: 'yessr', version: '0.1.0', event, sessionHash: digest(input.session_id), turnHash: turnKey, mode: 'unknown', code: 'skip', blockPrepared: false };
    if (event === 'SessionStart') receipt.source = input.source;
    if (event === 'Stop') receipt.stopHookActive = typeof input.stop_hook_active === 'boolean' ? input.stop_hook_active : null;
    let result = null;
    if (event === 'SessionStart') {
      for (const turn of Object.values(state.turns)) closeTurn(turn);
      state.activeTurn = null;
      state.proseGuard = ['startup', 'clear'].includes(input.source) ? 'clear' : 'unknown-history';
      state.ready = true;
      result = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } };
      receipt.code = 'policy_injected';
    } else if (event === 'UserPromptSubmit') {
      if (input.prompt.startsWith('YESSR_CORRECTION:')) {
        if (state.turns[turnKey]) { state.turns[turnKey].ambiguous = true; closeTurn(state.turns[turnKey]); }
        receipt.code = 'synthetic_prompt';
      } else {
        const contract = classify(input.prompt, state.proseGuard);
        const promptDigest = digest(input.prompt), prior = state.turns[turnKey];
        if (state.activeTurn !== turnKey && state.turns[state.activeTurn]) closeTurn(state.turns[state.activeTurn]);
        state.activeTurn = turnKey;
        if (prior) {
          if (prior.promptDigest !== promptDigest) { prior.mode = 'unknown'; prior.ambiguous = true; closeTurn(prior); state.proseGuard = 'unknown-history'; }
        } else {
          state.turns[turnKey] = { ...contract, promptDigest, ambiguous: false, closed: false, correctionConsumed: false };
          if (contract.reset) { state.proseGuard = 'clear'; state.acknowledged = observedMarker; state.ready = true; }
          else if (contract.mode === 'unknown' && contract.restricted) state.proseGuard = 'unknown-history';
          else if (['json', 'code', 'literal'].includes(contract.mode) && state.proseGuard !== 'unknown-history') state.proseGuard = 'constrained';
        }
        receipt.mode = state.turns[turnKey].mode; receipt.code = state.turns[turnKey].rule;
      }
    } else {
      const turn = state.turns[turnKey];
      const eligible = turn && state.activeTurn === turnKey && !turn.closed && !turn.ambiguous;
      const issue = eligible ? violation(turn, input.last_assistant_message, policy) : null;
      receipt.mode = eligible ? turn.mode : 'unknown';
      receipt.code = eligible ? issue ?? 'no_violation' : 'inactive_contract';
      if (eligible) {
        if (issue && input.stop_hook_active === false && !turn.correctionConsumed && state.ready && observedMarker === state.acknowledged) {
          turn.correctionConsumed = true;
          receipt.blockPrepared = true;
          const required = turn.mode === 'literal' ? { literalData: turn.expected }
            : turn.mode === 'json' ? { parser: 'JSON.parse', input: 'entire raw response' }
              : { prefix: policy.recapPrefix, firstSummaryLine: 'nonempty' };
          result = { decision: 'block', reason: `YESSR_CORRECTION: ${JSON.stringify({ mode: turn.mode, violation: issue, preserveOriginalTask: true, formatOnly: true, required })}` };
        } else closeTurn(turn);
      }
    }
    await atomicWrite(join(dir, 'session.json'), state);
    const receiptFile = await open(join(dir, 'receipts.jsonl'), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try {
      const info = await receiptFile.stat();
      if (!info.isFile() || (info.mode & 0o077)) throw new Error('unsafe_receipt');
      await receiptFile.writeFile(`${JSON.stringify(receipt)}\n`); await receiptFile.sync();
    } finally { await receiptFile.close(); }
    if (result?.decision === 'block' && await marker(dir) !== state.acknowledged) return null;
    return result;
  } catch { return null; }
  finally { if (locked) await rm(join(dir, 'lock'), { recursive: true, force: true }).catch(() => {}); }
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === fileURLToPath(import.meta.url)) {
  try {
    process.stdin.setEncoding('utf8');
    let raw = ''; for await (const chunk of process.stdin) raw += chunk;
    const output = await handle(JSON.parse(raw));
    if (output) process.stdout.write(JSON.stringify(output));
  } catch { /* 손상 입력으로 후속 요청을 만들지 않는다. */ }
}
