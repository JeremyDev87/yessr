# Yessr 제3자 재사용 고지

Yessr의 신규 기여분은 [LICENSE](LICENSE)의 MIT 라이선스를 따릅니다. 아래 두 MIT 자료에서 일부 원칙을 선택하여 `policy.json`에 각색했습니다. 원 저작권과 허가 고지는 각 라이선스 전문에 보존했습니다. 고정 SHA는 출처 재현용이며 실행 의존성이 아닙니다.

## STE-KO — 선택 각색

- 저장소: [beamonic/ste-ko](https://github.com/beamonic/ste-ko)
- 고정 SHA: `ed98bcb249c6a5b129e983a5df8a761b520e0bb3`
- 원본: [`skills/ste-ko/SKILL.md`](https://github.com/beamonic/ste-ko/blob/ed98bcb249c6a5b129e983a5df8a761b520e0bb3/skills/ste-ko/SKILL.md), 29, 31–34, 36–37, 62–83행
- 저작권: `Copyright (c) 2026 Beamonic`
- MIT 원문: [`LICENSE`](https://github.com/beamonic/ste-ko/blob/ed98bcb249c6a5b129e983a5df8a761b520e0bb3/LICENSE), 배포 사본: [licenses/ste-ko-MIT.txt](licenses/ste-ko-MIT.txt)

결론과 현재 상태의 우선 제시, 명확한 행위자, 일관된 용어, 검증 상태 구분을 `clarityInstructions`에 각색했습니다. 부정·한정·수치·단위·시점·원문·불확실성과 필수 근거 보존은 `preservationInstructions`에 반영했습니다. 의미가 모호하거나 필수 정보가 빠질 때 설명을 보충하는 원칙도 적용했습니다.

Yessr의 요청 요약 계약을 유지하도록 결론은 요청 요약 다음에 배치했습니다. 숫자로 정한 어절·명사 개수 상한, 앞 턴 반복 금지를 통한 요청 요약 생략, 필수 마무리, 독립 모드 전환 규칙은 가져오지 않았습니다. 전체 스킬·사전·예문·평가 자료는 배포하지 않습니다.

## structured-output — 선택 각색

- 저장소: [opspresso/agent-plugins](https://github.com/opspresso/agent-plugins)
- 고정 SHA: `ccc4c5abc5da4c9a87c3693ec0646d051ea59d67`
- 원본: [`plugins/agent-craft/skills/structured-output/SKILL.md` 23–24행](https://github.com/opspresso/agent-plugins/blob/ccc4c5abc5da4c9a87c3693ec0646d051ea59d67/plugins/agent-craft/skills/structured-output/SKILL.md#L23-L24)
- 저작권: `Copyright (c) 2026 opspresso`
- MIT 원문: [`LICENSE`](https://github.com/opspresso/agent-plugins/blob/ccc4c5abc5da4c9a87c3693ec0646d051ea59d67/LICENSE), 배포 사본: [licenses/opspresso-MIT.txt](licenses/opspresso-MIT.txt)

원시 출력에 설명·코드 펜스·허용되지 않은 필드를 추가하지 않는 원칙을 `exactOutputInstructions`에 각색했습니다. 적용 범위는 Yessr v1의 JSON·코드·정확한 문자열 요청입니다. 정확 출력과 명시적인 요약 생략 요청은 요청 요약 계약의 예외입니다. CSV 처리 기능과 원본 스킬 전체는 가져오지 않았습니다.

## plain-english — 참조만 사용

- 저장소: [nordscope-fi/plain-english](https://github.com/nordscope-fi/plain-english)
- 고정 SHA: `a82cad4995d5afcb9be9b1346cb85b92df6f1e1f`
- 사례 참조: [`test/mask.test.ts` 47–65행](https://github.com/nordscope-fi/plain-english/blob/a82cad4995d5afcb9be9b1346cb85b92df6f1e1f/test/mask.test.ts#L47-L65), [`test/policy.test.ts` 320–341행](https://github.com/nordscope-fi/plain-english/blob/a82cad4995d5afcb9be9b1346cb85b92df6f1e1f/test/policy.test.ts#L320-L341)

코드·인용 구간을 구분하는 사례와 정책 정본의 동작 검증 방식을 참조했습니다. 원본은 인용된 주석을 복원하지만, Yessr는 코드·인용 안의 지시를 현재 요청으로 승격하지 않는 자체 계약을 따릅니다. 새 한국어 사례를 작성하는 데 쓰는 참고 자료이며 원본 테스트 본문이나 구현은 복사하지 않습니다. NordScope 코드나 실행 패키지를 배포하지 않습니다.

## 포함하지 않은 자료와 검증 범위

plain-english의 재시도 구현·judge·transcript reader·설치 훅, hanlint의 코드·사전·평가 자료, ASD 표준 문안·로고는 포함하지 않습니다. 이 재사용으로 필수 runtime dependency를 추가하지 않습니다. Yessr는 정식 ASD-STE100 준수·인증이나 한국어 의미 정확성의 자동 보장을 주장하지 않습니다.
