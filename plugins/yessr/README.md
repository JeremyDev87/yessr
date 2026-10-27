# Yessr! 0.1.0

현재 요청의 요약과 정확 출력 예외를 다루는 **실험용 로컬 Codex 플러그인**입니다. Node.js `24.15.0`과 CLI `0.164.0-alpha.11.1`에서 현재 legacy manifest의 정상 설치·신뢰와 실제 모델 응답 연결을 확인했습니다. Desktop 직접 입력·압축은 미검증이며, 수정 후에도 출력 형식이 틀릴 수 있습니다.

## 동작과 범위

응답 지침의 정본은 [policy.json](policy.json) 하나입니다. README는 동작과 한계를 설명합니다. `SessionStart`에서 정책을 주입합니다. `UserPromptSubmit`에서는 요청의 출력 계약을 보수적으로 판별하고 상태를 기록합니다. `Stop`에서는 제공된 최신 최종 응답의 구조를 검사합니다. 각 이벤트는 한 제어기만 호출합니다. manifest의 명시적 hook 경로가 기본 파일 탐색을 대체하므로 별도 중복 등록은 필요하지 않습니다.

명확하게 판별한 계약에서만 수정을 요청합니다. 일반 설명은 요청 요약 접두를, JSON은 원시 응답 전체의 JSON 문법을, 고정 문자열은 원문 일치를 검사합니다. JSON은 객체·배열뿐 아니라 문자열·숫자·불리언·`null`도 허용합니다. 스키마와 의미의 정확성은 검사하지 않습니다. 고정 문자열의 공백·개행·Unicode를 trim하거나 정규화하지 않습니다.

코드만 요구한 응답은 정책으로 안내하고 자동 수정을 요청하지 않습니다. 언어를 추측하거나 코드를 실행하지 않으며, 코드의 의미와 자연어 혼입을 판정하지 않습니다. 한국어 명료성과 요약 충실도도 정책 안내 대상입니다. 접두 통과가 의미 정확성이나 ASD-STE100 준수·인증을 뜻하지 않습니다.

`Stop` 수정은 `YESSR_CORRECTION:` 이유를 가진 후속 응답 요청입니다. 이미 표시된 답변을 회수하지 않으며, 모든 메시지의 표시 전 차단 기능도 아닙니다. 제어기의 같은 턴에 대한 수정 요청 상한은 한 번입니다. 실제 CLI에서 같은 턴의 수정 후속 응답과 재진입을 확인했습니다. 다른 플러그인의 요청 횟수까지 제한하지 않습니다.

## 인식 예문

전용 명령 없이 아래처럼 명확한 자연어를 인식합니다. 표현 범위 밖이거나 해석이 불명확하면 `unknown`으로 두고 자동 수정을 요청하지 않습니다.

| 요청 | 판별 |
| --- | --- |
| 새 세션에서 `캐시 정책을 설명해줘.` / `두 방식을 비교해줘.` / `Explain cache invalidation.` | 일반 설명 (`prose`) |
| `결과를 JSON으로 반환해줘.` / `JSON만 출력해줘.` / `Return JSON only.` | JSON (`json`) |
| `캐시를 설명해줘. JSON만 출력해줘.` | JSON (`json`) |
| `코드만 출력해줘.` / `Return code only.` | 코드 (`code`) |
| `정확히 "OK"만 출력해줘.` / `Output exactly "OK" and nothing else.` | 고정 문자열 (`literal`), 기대값 `OK` |
| `요청 요약은 생략하고 캐시를 설명해줘.` / `복명복창 없이 캐시를 설명해줘.` / `Explain caching with no recap.` / `Explain caching. Omit the summary prefix.` | `unknown`, 접두를 다시 요구하지 않음 |
| `영어로만 캐시를 설명해줘.` / `Explain caching in English only.` / `Explain caching. Only English.` | `unknown`, 한국어 접두를 요구하지 않음 |
| `JSON이 무엇인지 설명해줘.` / `“JSON만 출력해”라는 문장을 설명해줘.` | `unknown`, 형식 논의·인용 |
| 코드 펜스나 들여쓴 코드 안의 `JSON만 출력해줘` | `unknown`, 코드 안 지시 |
| `JSON만 출력해줘라고 지시하지 마.` / `조건이 맞으면 JSON만 출력해줘.` | `unknown`, 부정·조건 |
| `CSV로만 요약해줘.` | `unknown`, 미지원 형식 |
| `정확히 "OK"만 출력해줘. 코드만 출력해줘.` / `정확히 "OK" 또는 "NO"만 출력해줘.` | `unknown`, 상충·대안 |

영문 출력 지시는 문장 시작의 명령형이 문장 끝이나 입력 끝까지 완결된 경우에만 채택합니다. `Should I output JSON?` 같은 형식 질문과 `Output exactly "OK" followed by a newline.`처럼 해석하지 않은 추가 조건은 `unknown`으로 건너뜁니다.

한글·영문 literal·JSON 명령 뒤에는 공백과 종결부호(`.`·`!`·`?`)만 허용합니다. 뒤에 다른 내용이 남으면 개행·반복·코드 펜스·설명 등의 후속 조건을 추측하지 않고 `unknown`으로 처리합니다. literal 원문 내부의 문구·공백·개행은 이 검사에서 제외합니다.

JSON 지시 앞에 `코드 펜스`·`코드 블록`·`code fence`·`code block` 단서가 있으면, 인용된 용어도 포함해 포장 조건을 추측하지 않고 `unknown`으로 처리합니다. 이 단서가 없는 앞쪽 일반 과업 설명과 단독 JSON 검사는 유지합니다.

명시적인 언어·요약 생략·정확 출력 요청은 정책에서도 우선합니다. 언어 제한의 자동 검사 생략 단서는 `영어로만`과 영단어 경계의 `English only`·`only English`로 한정합니다. 영어 단서는 대소문자를 구분하지 않고 단어 사이의 공백·탭·개행을 하나 이상 허용합니다. 예를 들어 `Explain caching in English   only.`도 해당합니다. 이 단서는 명시적 형식 해제와 함께 있어도 `unknown`이며, 인용 안에서도 제한 신호를 남깁니다. 유효한 고정 문자열의 payload 안에서는 원문 데이터로만 다룹니다. 다른 언어·표현을 모두 판별하거나 접두를 번역하지 않습니다. 자동 판별을 생략해도 정책 안내는 유지합니다. 인용·부정·조건을 보수적으로 다루므로 유효한 요청 일부도 자동 검사하지 않을 수 있습니다.

## 이전 형식의 영향

세션 상태의 `proseGuard`는 이전 출력 제한을 일반 설명으로 잘못 덮어쓰는 일을 막습니다. **한 번만 JSON·코드·고정 문자열을 요청해도** 이후 `장단점을 설명해줘.` 같은 일반 설명 요청은 `unknown`이 될 수 있습니다. 이전 exact 값이나 JSON 스키마를 다음 턴에 복사하지는 않습니다. 형식 관련 인용·부정·언어 제한·요약 생략으로 생긴 `unknown-history`는 새 exact 계약 뒤에도 유지합니다. 지속적인 요약 생략 등의 제약이 해제되었는지 알 수 없으므로, 이 상태에서는 현재 턴의 일반 설명 요청도 자동 교정하지 않습니다.

| 이후 요청·상황 | 처리 |
| --- | --- |
| `JSON만 출력해줘.` | 새 exact 계약을 판별·검사, `unknown-history`는 유지 |
| `이번 답변은 일반 설명으로 답해줘.` / `For this answer, explain in prose.` | `clear`·`constrained`에서는 이번 턴만 일반 설명, `unknown-history`에서는 `unknown`; guard 유지 |
| `이전 출력 형식 제한을 해제하고 일반 설명으로 답해줘.` / `Reset previous output format restrictions and explain in prose.` | 일반 설명, guard 해제 |
| resume·fork·compact, 상태 유실·손상 | 이전 형식 불명으로 일반 설명 추측 억제 |
| startup·clear | 유효한 새 세션 상태 시작 |

호스트 식별자·상태 연결이 불확실하거나 입력·정책·상태 저장에 문제가 있으면 수정 요청을 생략합니다. `PLUGIN_DATA` 아래에 세션·턴 상태를 저장하므로 정상 실행에는 쓰기 권한이 필요합니다. 상태 삭제는 이전 제한을 안전하게 해제하는 방법이 아닙니다.

세션 상태는 v2를 사용합니다. 유효한 v1 상태를 읽으면 이전 분류·문자열 디코딩 결과를 다시 사용하지 않도록 모든 기존 계약을 닫고 기대값을 제거합니다. 턴 식별자·요청 해시·교정 사용 기록은 보존하며 같은 턴을 다시 제출해도 계약을 열지 않습니다. 이때 `unknown-history`를 설정하므로 새 exact 계약은 검사하지만 일반 설명은 기존의 명시적 형식 해제·startup·clear까지 보수적으로 처리합니다. 비활성 계약의 `Stop` 기록은 `unknown`·`inactive_contract`이며 위반 판정을 하지 않습니다.

호출 기록인 `receipts.jsonl`에는 세션·턴 식별자의 해시, 판별 결과, 수정 요청 준비 여부를 남깁니다. `SessionStart`에는 실제 입력의 `source`를 기록합니다. `Stop`에는 실제 입력의 `stop_hook_active`를 `stopHookActive` 키로 기록합니다. 호출 기록에는 요청·응답 본문을 남기지 않습니다. 별도 세션 상태에는 고정 문자열 비교에 필요한 기대값이 저장될 수 있습니다.

## 실제 검증과 남은 한계

- **정상 로딩:** 세 후크 `SessionStart`, `UserPromptSubmit`, `Stop`의 신뢰와 실제 호출을 확인했습니다. 이전 portable manifest는 설치 후에도 후크를 로드하지 못했습니다. 현재 단일 legacy manifest로 이 문제를 해결했습니다.
- **형식과 수정:** 실제 CLI 형식 시나리오 8개의 최종 응답 중 7개가 통과했습니다. 요청 요약 누락과 개행 문자열 오류는 한 번의 수정 요청으로 복구되었습니다. `" OK "`는 뒤 공백이 빠진 `" OK"`로 남았습니다. 기대 바이트는 `20 4f 4b 20`, 실제 바이트는 `20 4f 4b`입니다. 위반 검출과 수정 상한을 확인한 결과이며, 최종 출력의 정확성을 보장하는 결과가 아닙니다.
- **재개와 압축:** 명시 UUID 재개 후 지속 JSON 요청 유지, 명시적 형식 해제, 목표 변경, 실제 `/compact`, 압축 후 첫 진행 보고·최종 답변의 요청 요약을 확인했습니다. 후속 메타데이터 시험에서 `source=startup/resume/compact`와 같은 턴의 `stopHookActive=false→true`를 직접 확인했습니다. `compact`의 SessionStart 기록은 다음 사용자 턴에 관찰되었습니다.
- **공존 한계:** 기존 전역 `CLAUDE.md`·`AGENTS.md` 규칙을 유지한 환경입니다. 응답 전체를 Yessr만의 효과로 귀속하지 않습니다. 다른 플러그인의 Stop은 활성 상태가 아니었으므로 Stop 간 동시 동작은 검증하지 않았습니다. 패키지 안의 정책 정본은 하나이며, 전역 규칙의 이전·삭제는 이번 범위에 포함하지 않습니다.
- **Desktop 미검증:** 앱 도구의 위임 메시지는 일반 직접 입력과 달리 `UserPromptSubmit`을 거치지 않습니다. 이 결과를 Desktop 직접 입력 검증으로 사용하지 않습니다. 검증 도구 경로에서 네이티브 UI 접근 제한과 기존 writer의 연결 거부가 발생하여 직접 입력·압축·압축 후 응답 확인은 남아 있습니다. 이는 해당 검증 경로의 제한이며 Yessr의 Desktop 동작 실패를 입증하지 않습니다. Desktop에서 사람이 직접 수행하는 검증이 필요합니다.

## 설치와 신뢰 검토

패키지는 [.codex-plugin/plugin.json](.codex-plugin/plugin.json) 하나를 manifest로 사용합니다. 최상위 `hooks`는 플러그인 루트 기준 `./hooks/hooks.json`을 가리킵니다. CLI `0.164.0-alpha.11.1`에 대응하는 공식 소스는 [legacy manifest의 최상위 hooks를 읽고](https://github.com/openai/codex/blob/6905ecede7816e91373e9eabda3f6b0368fc747b/codex-rs/core-plugins/src/manifest.rs#L49-L73), [AgentPlugin 형식의 후크는 로드하지 않습니다](https://github.com/openai/codex/blob/6905ecede7816e91373e9eabda3f6b0368fc747b/codex-rs/core-plugins/src/loader.rs#L973-L983). 스키마를 선언한 루트 `plugin.json`은 [legacy 경로보다 먼저 선택되므로](https://github.com/openai/codex/blob/6905ecede7816e91373e9eabda3f6b0368fc747b/codex-rs/utils/plugins/src/plugin_namespace.rs#L43-L64) 함께 두지 않습니다. 이 호환성 설명과 실제 호출 검증은 위 CLI 버전을 기준으로 합니다.

Node.js 24가 Codex 실행 환경의 `PATH`에 있어야 합니다. 필수 npm 의존성이나 빌드 단계는 없습니다. 다음 절차로 설치하고 해당 환경의 후크를 직접 검토하십시오.

1. 저장소 루트에서 Node 버전을 확인하십시오: `node --version`.
2. 저장소 루트에서 로컬 marketplace를 등록하십시오: `codex plugin marketplace add .`.
3. Codex Desktop의 Plugins Directory에서 `Yessr 로컬 검증`을 선택하고 `Yessr!`를 설치하십시오.
4. 해당 프로젝트에서 플러그인을 활성화하십시오.
5. 같은 환경의 CLI `/hooks`에서 Yessr의 현재 세 이벤트 정의와 명령을 검토하고 신뢰하십시오.

이전 portable 후보가 이미 설치되어 있으면 Codex의 정상 제거·설치 절차로 수정본을 다시 설치하십시오. 같은 `0.1.0` 버전이므로 설치 목록의 버전 표시만으로 교체를 판단하지 마십시오. 설치 사본에 `.codex-plugin/plugin.json`이 있고 루트 `plugin.json`이 없는지 확인한 뒤 `/hooks`에서 세 이벤트를 검토하십시오.

설치·활성화와 후크 신뢰는 별개입니다. 후크 정의가 바뀌면 다시 검토해야 합니다. 설치 사본의 경로·내용과 실제 이벤트 호출을 확인한 뒤에만 그 호스트에서 작동한다고 판단할 수 있습니다. 기존 공통 규칙의 전환은 별도 검토 대상이며 이 패키지는 전역 지침·설정·신뢰 정보를 수정하지 않습니다. lifecycle hook 플러그인은 공식 문서상 수동 Desktop 설치 대상이며 공개 플러그인 디렉터리 제출 대상이 아닙니다.

## 로컬 검증과 라이선스

저장소 루트에서 단위·프로세스 시험을 실행하십시오.

```sh
node --test tests/yessr.test.mjs
```

단위·프로세스 시험이 통과했습니다. 이 명령은 합성 입력을 사용하므로 실제 모델 응답을 다시 검증하지는 않습니다. 별도 CLI 검증 범위와 실패 사례는 위에 기록했습니다. 다른 호스트 버전이나 운영체제의 호환성은 확인하지 않았습니다.

[MIT](LICENSE)를 적용합니다. 선별 차용한 문구와 참조 범위는 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), 해당 MIT 전문은 [licenses/](licenses/)에 있습니다.

공식 근거: [플러그인 구조·marketplace·설치](https://developers.openai.com/plugins/build/plugins), [후크 이벤트·신뢰·Stop](https://learn.chatgpt.com/docs/hooks).
