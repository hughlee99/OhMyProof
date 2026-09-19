# OhMyProof

[English](README.md) | [한국어](README.ko.md)
AI한테 이런 말, 한 번쯤 들어보셨을 겁니다.

> "Redis 붙이면 더 빨라집니다."
>
> "Vector DB로 바꾸는 게 좋습니다."
>
> "이 구조가 확장성에는 더 유리합니다."

코드도 일단 돌아가고, 설명만 보면 맞는 말 같습니다. 그런데 이게 **지금 이 프로젝트에서도 진짜 더 나은 선택인지**까지는 보통 안 돌려봅니다. 저도 이게 계속 헷갈려서 OhMyProof를 만들었습니다.
**OhMyProof는 AI가 제안한 기술적 아이디어를 실제 코드에서 직접 비교해보는 도구입니다.**
AI가 뭔가를 제안하면 바로 답으로 받아들이기보다 일단 가설로 두고, 가능하면 다른 방법도 같이 놓고 같은 조건에서 돌려봅니다. 결과가 좋으면 쓰고, 아니면 다른 방법을 찾아보면 됩니다.

```text
"Redis 넣는 게 낫습니다"
          ↓
      정말 그런가?
          ↓
Baseline / Redis / 다른 대안
          ↓
     같은 workload
          ↓
성능 · 비용 · 실패 · regression
          ↓
         Evidence
```

바이브코딩으로 구현 자체는 이미 엄청 빨라졌습니다. 그런데 여러 방법을 한꺼번에 제안받기 시작하니까, 뭘 만들 수 있느냐보다 그중 뭘 실제로 남겨야 하느냐가 애매해진 것 같습니다.

---

## 30초만에 보기

AI의 제안을 검증할 때는 아래와 같이 실행합니다.

```bash
node ./bin/ohmyproof.js prove \
  "Add Redis caching to reduce API latency" \
  --repo . \
  --agent codex
```

먼저 planner가 실험을 계획하고, 그 다음 현재 코드와 AI가 수정한 코드를 따로 둔 뒤 둘에 같은 simulation을 돌립니다. 예를 들어 결과가 아래처럼 나왔다고 해보겠습니다.

```text
Latency        487ms  → 201ms
DB queries     12.4   → 3.1
Memory         221MB  → 514MB

Claim          SUPPORTED
Regression     FOUND
Unknown        production ops cost
```

Latency는 많이 줄었지만 메모리는 두 배 이상 늘었습니다. 이 정도면 적어도 "빨라졌으니 적용"으로 바로 넘어가기보다, 무엇을 감수하고 무엇을 얻는지 보고 결정할 수 있습니다.

---

## 그냥 AI한테 한 번 더 물어보면 되지 않나요?

저도 처음에는 "이 구조가 진짜 최선이야?", "더 단순한 방법은 없어?" 하고 다시 물어봤습니다. 그런데 제가 알고 싶었던 건 "**실제로 더 나은가"**였습니다.
가능하면 이런 문제는 말로 한 번 더 검토하기보다 직접 돌려보는 편이 빠릅니다.

- 테스트가 더 잘 통과하는지
- latency가 줄었는지
- query 수가 줄었는지
- memory가 얼마나 늘었는지
- bundle size가 커졌는지
- edge case에서 깨지는지
- scale을 키워도 버티는지

OhMyProof는 AI의 주장을 이런 식으로 **실제로 돌려볼 수 있는 실험으로 바꾸는 것**부터 해보자는 프로젝트입니다.

---

## 후보가 여러 개일 때

처음에는 baseline과 candidate 하나만 비교했습니다. 그런데 몇 번 써보니 AI가 "Vector DB가 좋습니다"라고 했을 때 궁금한 건 단순히 Vector DB가 현재 방식보다 낫냐는 것만은 아니었습니다.
BM25도 있고, TF-IDF도 있고, FTS도 있고, embedding도 있고, hybrid도 있습니다. 어차피 비교할 거라면 같이 돌려보는 편이 낫습니다.
그래서 Campaign을 만들었습니다.

```text
Candidates
× Worlds / Seeds
× Parameters
× Repeats
```

```bash
node ./bin/ohmyproof.js campaign \
  --campaign examples/basic-campaign/campaign.json \
  --repo .
```

repo에 들어있는 demo는 일부러 작게 만들었습니다. `No cache`, `Cache without invalidation`, `Cache + invalidate on write` 세 가지를 read-heavy / mixed / write-heavy 세 조건에서 비교합니다. 전부 합쳐도 9개 experiment cell이라 Campaign이 어떻게 동작하는지만 바로 볼 수 있습니다.

---

## 실제로 돌려보니

demo에서는 calibration 단계에서 아래 후보가 선택됩니다.

```text
Cache + invalidate on write
```

```text
Calibration
fresh_read_rate   100.00%
backend_calls       7

Held-out
fresh_read_rate   100.00%
backend_calls      12

Held-out constraint
PASSED
```

무효화 없는 cache는 backend call을 4번까지 줄이지만 calibration에서 stale read가 45번, held-out에서는 93번 발생합니다. 반대로 write 때 cache를 무효화하면 freshness를 유지하면서도 no-cache보다 backend call을 크게 줄일 수 있습니다.
점수 하나만 보는 것보다 이렇게 어떤 후보가 어디서 깨지는지를 같이 보는 게 Campaign의 핵심입니다.

---
## Calibration 결과

실험이 과적합할 수 있습니다.
AI가 scenario를 만들고, 구현도 하고, threshold까지 조정한 다음 같은 데이터로 다시 평가하면 결과가 잘 나오는 게 이상하진 않습니다.
그래서 Campaign은 world를 나눌 수 있습니다.

```text
explore
calibration
heldout
```

Calibration에서 후보와 parameter를 고른 뒤 설정을 고정하고, held-out world에서 다시 돌립니다. 거기서도 비슷한 결과가 나오면 근거가 하나 더 생긴 셈이고, 깨지면 calibration에 너무 맞춘 건 아닌지 다시 봐야 합니다.
물론 held-out이라고 해서 production traffic이 되는 건 아닙니다. synthetic world라면 여전히 synthetic world이기 때문에, 결과에는 확인한 것뿐 아니라 아직 확인하지 못한 것도 같이 남깁니다.

---

## 실험 설계도 AI한테 맡길 수 있습니다

이 기능은 아직 실험 단계입니다.

```bash
node ./bin/ohmyproof.js investigate \
  "Should this project add caching, and if so how?" \
  --repo . \
  --agent codex
```

여기서는 AI한테 정답을 바로 달라고 하지 않고, repo를 보고 비교할 후보를 찾고, 어떻게 비교할지 짜고, 일부러 깨질 만한 조건도 넣어보라고 시킵니다.
예를 들면 이런 것들입니다.

- 비교할 후보
- synthetic world
- parameter sweep
- failure case
- calibration / held-out split

그 다음 실제 실행은 OhMyProof가 합니다.

---

## 직접 실험을 만들 수도 있습니다

숫자 결과

```text
OHMYPROOF_METRIC recall=0.998
OHMYPROOF_METRIC p95_ms=183.2
OHMYPROOF_METRIC memory_mb=412
```

실패 케이스

```text
OHMYPROOF_FAILURE {"type":"typo","case":"broken query"}
```

Campaign에서는 지금 어떤 candidate, world, parameter로 돌고 있는지도 환경변수로 받을 수 있습니다.

```text
OHMYPROOF_CANDIDATE
OHMYPROOF_WORLD
OHMYPROOF_SPLIT
OHMYPROOF_PARAM_<KEY>
```

별도 SDK는 없고, 지금은 Node, Python 상관없이 stdout 형식만 맞추면 붙일 수 있는 편이 오히려 낫다고 생각합니다.

---

## 피하려고 하는 것

LLM 하나가 다른 LLM 결과에 8.2점을 주고, 그 점수를 근거로 "개선됐습니다"라고 결론내는 식의 eval tool은 만들고 싶지 않습니다.
물론 UI 느낌이나 문장 품질처럼 실행 결과만으로 판단하기 어려운 문제에는 그런 평가가 필요할 수 있습니다.
다만 프로그램을 돌려서 알 수 있는 문제라면 일단 돌려보는 게 먼저라고 생각합니다.

```text
실행해서 알 수 있음  → 실행
그걸로는 부족함      → 그때 다른 평가 방법
```

---

## 설치

- Node.js 20+
- Git
- Codex CLI 또는 Claude Code — AI에게 실험 설계를 맡길 때

현재 runtime npm dependency는 없습니다.

```bash
git clone https://github.com/hughlee99/OhMyProof.git
cd OhMyProof

npm ci
npm test
npm run demo
```

아직 npm에는 publish하지 않았기 때문에 지금은 CLI를 직접 실행합니다.

```bash
node ./bin/ohmyproof.js help
```

`ohmyproof` package 이름은 현재 비어 있습니다. Publish하면 설치와 실행 부분은 조금 더 간단하게 바꿀 생각입니다.

---

## 결과물

실행 결과 저장

```text
.ohmyproof/reports/<run-id>/
```

단일 proof

```text
report.md
proof.json
experiment.json
candidate.diff
planner-agent.log
candidate-agent.log
```

Campaign

```text
report.md
campaign.json
matrix.json
summaries.json
failure-clusters.json
```

---

## 보안 sandbox 아님

현재는 Git worktree로 planner, baseline, candidate를 나눕니다. Planner가 `.ohmyproof/` 밖을 수정하면 중단하고, simulation subprocess에는 부모 process의 환경변수를 통째로 넘기지 않습니다. 저장되는 로그에는 기본적인 secret redaction도 적용합니다.
다만 package script도 코드를 실행하고, coding agent도 코드를 실행하고, simulation도 코드를 실행하기 때문에 **신뢰할 수 없는 repo나 campaign을 안전하게 돌리는 보안 sandbox는 아직 아닙니다.**
Container / VM isolation은 이후에 붙여야 할 영역이고, 자세한 내용은 [SECURITY.md](SECURITY.md)에 적어두었습니다.

---

## 왜 만들었나요?

바이브코딩을 하면서 모델이 좋아진다고 해서 틀린 제안이 사라지는 건 아니었고, 오히려 틀린 제안도 점점 더 그럴듯해진다고 느꼈습니다.
그래서 "이게 정말 최선이냐?"라고 다시 물어보게 되는데, 그럼 갑자기 태도를 바꾸거나 더 긴 설명이 돌아오는 게 짜증났습니다.
제가 알고 싶었던 건 **지금 이 프로젝트에서 이 변화가 실제로 더 좋은지**였습니다. 그래서 가능한 건 한 건 직접 돌려보기 시작했습니다.
OhMyProof가 최종적으로 CLI가 될지, MCP나 CI 쪽으로 더 갈지, production workload까지 다루게 될지는 아직 잘 모르겠습니다. 그건 쓰면서 바뀔 수 있다고 생각합니다.

---

## Contributing

아직 초기라 바뀔 게 많습니다. [CONTRIBUTING.md](CONTRIBUTING.md)를 참고해주세요.
여러 프로젝트에서 반복해서 쓸 수 있는 experiment primitive나, 지금보다 더 나은 falsification 방법이 있다면 환영입니다. 이 프로젝트 방식 자체가 틀렸다는 걸 보여주는 실험도 괜찮습니다.

---

## License

MIT
