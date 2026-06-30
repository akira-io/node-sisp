# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.4] - 2026-06-30

### Changed

- Release v1.0.0-beta.4.

## [1.0.0-beta.3](https://github.com/akira-io/node-sisp/compare/v1.0.0-beta.2...v1.0.0-beta.3) (2026-06-30)

### Bug Fixes

- **payments:** Deduplicate callback replays ([a874fc4](https://github.com/akira-io/node-sisp/commit/a874fc4d094f62962fc607ea6d3415b30aff131f))
- **payments:** Ignore invalid callback fingerprints ([9987ec9](https://github.com/akira-io/node-sisp/commit/9987ec929fd501f5a28129003a7c7d4313ae94e4))
- **payments:** Reject invalid money amounts ([b09c273](https://github.com/akira-io/node-sisp/commit/b09c2737633746dada4500d5c6c07cec07bbb2a9))
- **payments:** Unify money quantization ([d32ecea](https://github.com/akira-io/node-sisp/commit/d32eceaa4d63627ada5a4f8be082c337fff9adf8))
- **http:** Sign callback result links ([f898a54](https://github.com/akira-io/node-sisp/commit/f898a545e3ce0d3acb1affd1c4d4ee5692364428))
- **payments:** Randomize merchant identifiers ([4330903](https://github.com/akira-io/node-sisp/commit/4330903ffa98afb2a9f4c0cac1adb004b0a68d90))
- **payments:** Guard idempotent retry replays ([9dc4757](https://github.com/akira-io/node-sisp/commit/9dc4757f8912cfc3e8d0b8fdbc90e559b42c0ec8))
- **refunds:** Lock transaction before refunding ([37bb093](https://github.com/akira-io/node-sisp/commit/37bb0937781651477ca52d270f252e9310a7b6e6))
- **transactions:** Lock updates before diffing ([aa32ad2](https://github.com/akira-io/node-sisp/commit/aa32ad2d438f9174719964874466bf2d5ea2e4cf))
- **status:** Scope portal credentials per merchant ([508976f](https://github.com/akira-io/node-sisp/commit/508976f25a533f206b339db92dcba10265df57e3))
- **database:** Guard automatic migrations ([b6f49db](https://github.com/akira-io/node-sisp/commit/b6f49dba19a1147c5d34b992723c3493f827160f))
- **driver:** Validate production gateway URL ([353d7be](https://github.com/akira-io/node-sisp/commit/353d7bee54a5ca63475cb43633b503cb5c052f55))
- **security:** Harden payload encryption at rest ([9ab8b21](https://github.com/akira-io/node-sisp/commit/9ab8b210cc6ebcd1f8b6ed3a6b2230086a5f2549))
- **database:** Derive transaction amounts from cents ([790b013](https://github.com/akira-io/node-sisp/commit/790b0133b741d4785fc126f9c737d7342bf91658))
- **security:** Require callback identity fields ([7461608](https://github.com/akira-io/node-sisp/commit/7461608763fb0cd03e2c9e181b437e8c4216bf63))
- **gitignore:** Ignore local secret files ([3d3af33](https://github.com/akira-io/node-sisp/commit/3d3af33bee86247df8ac0aa6b16de1b24eaf3f6b))
- **status:** Surface transport failures ([2364fc1](https://github.com/akira-io/node-sisp/commit/2364fc1d39715fd8f57ef45a21f01fea03c52b2f))
- **database:** Bound transaction history queries ([a882042](https://github.com/akira-io/node-sisp/commit/a882042b2ebf66f722c8ed34485d78f955a32d6d))
- **http:** Harden payment input validation ([3389d0c](https://github.com/akira-io/node-sisp/commit/3389d0c6d0d8b7786be18b011b06d9d1d89c8b1b))
- **database:** Import knex via default export so ESM bundle loads ([4865563](https://github.com/akira-io/node-sisp/commit/4865563f1970c9449d3f54f4921df0c99284d992))
- **payments:** Cap merchantRef/merchantSession at SISP 15-char limit ([a4207b3](https://github.com/akira-io/node-sisp/commit/a4207b337f3c4c1eee10380d2654692623f01184))
- **payments:** Use unbiased randomInt for identifier entropy ([80d4ecf](https://github.com/akira-io/node-sisp/commit/80d4ecfffe94bc95cbb41a9df03e1afe74d30d42))
- **payments:** Fail transaction and emit payment:failed on invalid callback fingerprint ([9a617f7](https://github.com/akira-io/node-sisp/commit/9a617f7639e4668f5ba1ebb1e1c4309f4a041493))


### Code Refactoring

- **architecture:** Restructure into hexagonal layers ([790b94d](https://github.com/akira-io/node-sisp/commit/790b94d3668952019574c31879e584ed075b2619))


### Features

- **http:** Support frontendResultUrl to hand callbacks back to a SPA ([1c20ad3](https://github.com/akira-io/node-sisp/commit/1c20ad3a8f90d8367de4ce7208ed995e48cc8141))
- **database:** Add Transaction.list() for paginated transaction listing ([fb904e4](https://github.com/akira-io/node-sisp/commit/fb904e4a1a38163ee205b8f6794e2d8146a4f4cb))
- **payments:** Cancel transaction and emit event on UserCancelled callback ([44f1621](https://github.com/akira-io/node-sisp/commit/44f1621af6d7823ea156f1d4edee8d762caa21a9))
- **http:** Add JSON payment-intent endpoint for SPAs ([ff880e1](https://github.com/akira-io/node-sisp/commit/ff880e1f258394e2e06f37e17b7ec52cc1e4664a))

## [1.0.0-beta.2](https://github.com/akira-io/node-sisp/compare/v1.0.0-beta.1...v1.0.0-beta.2) (2026-06-20)

### Bug Fixes

- **payments:** Add SISP payment intents ([070e5d3](https://github.com/akira-io/node-sisp/commit/070e5d396583dba5db8b01a186076941ec6fbda3))
- **payments:** Harden idempotent retry attempts ([2b97910](https://github.com/akira-io/node-sisp/commit/2b9791012e19adefeb60a583b8b9b72669d4f6cc))
- **payments:** Handle retry attempt races ([64a196e](https://github.com/akira-io/node-sisp/commit/64a196e263a23893c4efb0d72448d79bb62f1872))
- **config:** Normalize boolean flags ([389ec64](https://github.com/akira-io/node-sisp/commit/389ec64955f502d4fc5e737a580f6eeb4dfc0af5))

## [1.0.0-beta.1](https://github.com/akira-io/node-sisp/compare/...v1.0.0-beta.1) (2026-06-14)

### Bug Fixes

- **tooling:** Exclude SVG assets from biome, enable parameter decorators, apply pending formatting ([ee06c2e](https://github.com/akira-io/node-sisp/commit/ee06c2e620ca26c5f299cd7a420d6756501ddece))
- **http:** Rate limit the refund route and replace the email regex with a linear validator ([b25f2e2](https://github.com/akira-io/node-sisp/commit/b25f2e27f1deb34fbcbcb91c93a715b2f94e846d))
- **sandbox:** Use unbiased randomInt for fake gateway token generation ([dc37b82](https://github.com/akira-io/node-sisp/commit/dc37b82aa8efd3a4521ad55e49e787b3054ae54c))


### Code Refactoring

- **db:** Rename repositories directory to models mirroring the Laravel package layout ([9c22a1e](https://github.com/akira-io/node-sisp/commit/9c22a1e1a7a5542812b1af161159180d3851530f))
- **db:** Drop the Repository suffix from model classes and expose them as sisp.models ([778706c](https://github.com/akira-io/node-sisp/commit/778706c428de8af58c12e4e4417e62af1ccc6741))


### Features

- **support:** Port SispAmount thousandths parsing and reference generators ([f7dfd17](https://github.com/akira-io/node-sisp/commit/f7dfd177386a630532870f3efdb8d4501fbed5a1))
- **config:** Mirror config/sisp.php keys with defaults and credentials resolver ([3fb9511](https://github.com/akira-io/node-sisp/commit/3fb951106128f3d0bd6485621fa06dac407abbaa))
- **fingerprints:** Port token, payment, callback, and refund fingerprints with PHP golden vectors ([ddf53a9](https://github.com/akira-io/node-sisp/commit/ddf53a9a47d9ec094383ea9f0a268d88ff3e38e7))
- **enums:** Port statuses, transaction codes, and message types with generated translations ([34ed216](https://github.com/akira-io/node-sisp/commit/34ed216355f56798a3f50f0ffb46a2e3a667fd28))
- **db:** Add knex bootstrap with bundled migrations and idempotent auto-migrate ([b87293c](https://github.com/akira-io/node-sisp/commit/b87293cce85d9b01bc22a8053a5d6946a952f125))
- **db:** Add repositories with AES-256-GCM payload encryption and transaction change logs ([58532c5](https://github.com/akira-io/node-sisp/commit/58532c51e6a29ece4af6d6a20ccd2fdd10f318e6))
- **events:** Add typed emitter with isolated listener failures ([17d1ab3](https://github.com/akira-io/node-sisp/commit/17d1ab3d2e644c4128df6b567efe21ef3e1e240e))
- **drivers:** Add SispManager with production and sandbox drivers plus extend hook ([63897ed](https://github.com/akira-io/node-sisp/commit/63897ed4cb6c6ab97f8604ba3ec6750a003a77a6))
- **pipelines:** Add PaymentBuilder, request payload action, and payment pipeline with guards ([80d013e](https://github.com/akira-io/node-sisp/commit/80d013ec3491887ce0d123ea3fc5be3cee495ad1))
- **pipelines:** Add callback pipeline with fingerprint validation and reconciliation ([c9a077b](https://github.com/akira-io/node-sisp/commit/c9a077bf521ff124cd8da3bcfeb880d5c50e3031))
- **sandbox:** Add fake gateway payload builder with signed callbacks ([450e2dc](https://github.com/akira-io/node-sisp/commit/450e2dc57f393d3d56e64afb9bd45df3afd73a99))
- **http:** Add core handlers with payment validation, callback flow, and country catalog ([5158190](https://github.com/akira-io/node-sisp/commit/51581903ef98fcc354632bbb1088dd772082ef85))
- **core:** Add createSisp facade and Express adapter with sandbox E2E coverage ([705e47a](https://github.com/akira-io/node-sisp/commit/705e47ae82325888d7fee4e7b925f859750faceb))
- **support:** Add HMAC signed expiring URLs keyed from appKey ([aa24aca](https://github.com/akira-io/node-sisp/commit/aa24acafe00dfe536dc5436fd961a3f0e21cc1e3))
- **actions:** Add cancel flow with signed route and transaction:cancelled event ([a5b5594](https://github.com/akira-io/node-sisp/commit/a5b559450500541d8eee60881f86a1d7bd5816fa))
- **actions:** Add retry flow with signed expiring URLs and session rotation ([f4af720](https://github.com/akira-io/node-sisp/commit/f4af720fe124cb374ff2eb02abb3c7a070031021))
- **builders:** Add RefundBuilder with signed reversal requests and local balance tracking ([6789488](https://github.com/akira-io/node-sisp/commit/6789488165835601246c7f5514d6bfc8d2594050))
- **drivers:** Add transaction-status client with reconciliation and reconcilePending ([6004e9b](https://github.com/akira-io/node-sisp/commit/6004e9b86904c7ea6914f9fe543563cb8d6ab051))
- **core:** Add forCredentials multi-merchant scoping through ScopedSisp ([698ae56](https://github.com/akira-io/node-sisp/commit/698ae563e657e25abd7fa5598f6dea890cf8d241))
- **cli:** Add sisp binary with migrate and reconcile-pending commands ([f1a532c](https://github.com/akira-io/node-sisp/commit/f1a532c788f2bef63b18b8252be264da80534728))
- **fastify:** Add Fastify adapter reusing the core handlers ([a68172b](https://github.com/akira-io/node-sisp/commit/a68172b264b3ce61aea4822e0eb0db10da1dff9a))
- **nest:** Add SispModule dynamic module with controller over the core handlers ([000ef12](https://github.com/akira-io/node-sisp/commit/000ef12f24e4be8002ad716f099041978b83b839))

